import type { CandlestickData } from 'lightweight-charts';
import type { Time } from 'lightweight-charts';


class WebSocketClient {
    private static instance: WebSocketClient | null = null;
    private wsDevnet: WebSocket | null = null;
    private wsMainnet: WebSocket | null = null;
    private subscribers: Map<string, Set<(update: { price: number; time: number }) => void>> = new Map();
    private tokenNetworks: Map<string, 'mainnet' | 'devnet'> = new Map();
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 5;
    private readonly wsDevnetUrl: string;
    private readonly wsMainnetUrl: string;
    private connectionPromises: {
        devnet: Promise<void> | null;
        mainnet: Promise<void> | null;
    } = { devnet: null, mainnet: null };
    private pendingMessages: Map<'mainnet' | 'devnet', any[]> = new Map([
        ['mainnet', []],
        ['devnet', []]
    ]);
    private migrationEventsReceived: Map<'mainnet' | 'devnet', boolean> = new Map([
        ['mainnet', false],
        ['devnet', false]
    ]);
    private lastMessageTime: Map<'mainnet' | 'devnet', number> = new Map();
    private metrics: Map<'mainnet' | 'devnet', WebSocketMetrics> = new Map([
        ['mainnet', this.initMetrics()],
        ['devnet', this.initMetrics()]
    ]);

    private constructor() {
        // Use relative WebSocket path that matches our backend WebSocket server
        this.wsDevnetUrl = 'ws://' + window.location.host + '/api/ws';
        this.wsMainnetUrl = 'ws://' + window.location.host + '/api/ws';

    }

    static getInstance(): WebSocketClient {
        if (!WebSocketClient.instance) {
            WebSocketClient.instance = new WebSocketClient();
        }
        return WebSocketClient.instance;
    }

    private getWebSocketForNetwork(network: 'mainnet' | 'devnet'): WebSocket | null {
        return network === 'mainnet' ? this.wsMainnet : this.wsDevnet;
    }

    private getWebSocketForMint(mintAddress: string): WebSocket | null {
        const network = this.tokenNetworks.get(mintAddress);
        if (!network) {
            console.error('No network found for mintAddress:', mintAddress);
            return null;
        }
        return this.getWebSocketForNetwork(network);
    }

    private async ensureConnected(network: 'mainnet' | 'devnet' = 'devnet'): Promise<void> {
        const ws = this.getWebSocketForNetwork(network);
        if (ws?.readyState === WebSocket.OPEN) {
            return;
        }

        if (!this.connectionPromises[network]) {
            this.connectionPromises[network] = new Promise((resolve, reject) => {
                try {
                    const wsUrl = network === 'devnet' ? this.wsDevnetUrl : this.wsMainnetUrl;
                    const newWs = new WebSocket(wsUrl);

                    // Assign the WebSocket instance immediately
                    if (network === 'mainnet') {
                        this.wsMainnet = newWs;
                    } else {
                        this.wsDevnet = newWs;
                    }

                    newWs.onmessage = this.handleMessage.bind(this);

                    newWs.onopen = () => {
                        console.log(`WebSocket connected to ${network} network`);
                        this.reconnectAttempts = 0;
                        this.resubscribeAll();
                        resolve();
                        this.connectionPromises[network] = null;
                    };

                    // Rest of the WebSocket setup remains the same
                    newWs.onclose = () => {
                        if (network === 'mainnet') {
                            this.wsMainnet = null;
                        } else {
                            this.wsDevnet = null;
                        }
                        this.handleDisconnect(network);
                    };

                    newWs.onerror = (error) => {
                        console.error(`WebSocket error on ${network} network:`, error);
                        reject(error);
                    };
                } catch (error) {
                    console.error(`Error connecting to WebSocket on ${network} network:`, error);
                    reject(error);
                }
            });
        }

        return this.connectionPromises[network];
    }

    private handleMessage = (event: MessageEvent) => {
        try {
            const data = JSON.parse(event.data);
            const network = this.getNetworkFromMessage(data);
            const metrics = this.metrics.get(network)!;

            // Update metrics
            metrics.messageCount++;
            metrics.lastMessageTime = Date.now();
            metrics.latency.push(Date.now() - data.timestamp);
            if (metrics.latency.length > 10) metrics.latency.shift();

            this.lastMessageTime.set(network, Date.now());

            // Track migration events
            if (data.type === 'migration') {
                const network = this.getNetworkFromMessage(data);
                this.migrationEventsReceived.set(network, true);
            }

            const mintAddress = data.mintAddress;
            const update = {
                price: Number(data.close || data.price),
                time: Math.floor(Date.now() / 1000), // Current time in seconds
                isSell: data.type === 'sell',
                volume: Number(data.volume || 0)
            };

            // Notify subscribers
            this.subscribers.get(mintAddress)?.forEach(callback => callback(update));
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    }

    private resubscribeAll() {
        for (const [mintAddress] of this.subscribers) {
            this.sendSubscription(mintAddress);
        }
    }

    private sendSubscription(mintAddress: string) {
        const ws = this.getWebSocketForMint(mintAddress);

        if (ws?.readyState === WebSocket.OPEN) {
            const subscribeMsg = {
                type: 'subscribe',
                mintAddress,
                channel: 'price'
            };
            ws.send(JSON.stringify(subscribeMsg));
        } else {
            console.error('WebSocket not ready. State:', ws?.readyState);
        }
    }

    private handleDisconnect(network: 'mainnet' | 'devnet') {
        if (network === 'mainnet') {
            this.wsMainnet = null;
        } else {
            this.wsDevnet = null;
        }
        this.connectionPromises[network] = null;

        // Always try to reconnect, reset attempts on success
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 5000);
        setTimeout(async () => {
            try {
                await this.ensureConnected(network);
                this.reconnectAttempts = 0;
            } catch (error) {
                this.reconnectAttempts++;
                console.error(`Reconnection attempt failed:`, error);
            }
        }, delay);
    }

    async subscribeToPrice(
        mintAddress: string,
        callback: (update: { price: number; time: number; isSell?: boolean; volume?: number }) => void,
        network: 'mainnet' | 'devnet' = 'devnet'
    ): Promise<() => void> {

        // Store the network for this token
        this.tokenNetworks.set(mintAddress, network);

        // Ensure we have a connection
        await this.ensureConnected(network);

        // Create or get the set of callbacks for this mint address
        if (!this.subscribers.has(mintAddress)) {
            this.subscribers.set(mintAddress, new Set());
        }

        // Add the callback to the subscribers
        const callbacks = this.subscribers.get(mintAddress)!;
        callbacks.add(callback);

        // Send the subscription message
        this.sendSubscription(mintAddress);

        // Return cleanup function
        return () => {
            const callbacks = this.subscribers.get(mintAddress);
            if (callbacks) {
                callbacks.delete(callback);
                if (callbacks.size === 0) {
                    this.subscribers.delete(mintAddress);
                }
            }
        };
    }

    async getDexTokenPrice(mintAddress: string): Promise<number | null> {
        try {
            const response = await fetch(
                `https://quote-api.jup.ag/v6/quote?inputMint=${mintAddress}&outputMint=So11111111111111111111111111111111111111112&amount=1000000&slippageBps=50`
            );

            if (!response.ok) return null;

            const quoteData = await response.json();
            // Calculate price from the quote (outAmount in lamports)
            const outAmount = Number(quoteData.outAmount);
            return outAmount / 1e9; // Convert lamports to SOL
        } catch (error) {
            console.error('Error fetching DEX token price:', error);
            return null;
        }
    }

    async getPriceHistory(mintAddress: string): Promise<CandlestickData<Time>[]> {
        const response = await fetch(`/api/ohlcv/${mintAddress}?resolution=1&from=${Math.floor(Date.now() / 1000 - 300)}&to=${Math.floor(Date.now() / 1000)}`);
        if (!response.ok) throw new Error('Failed to fetch price history');

        const data = await response.json();
        return data.map((point: OHLCVPoint) => ({
            time: point.time as Time,
            open: point.open,
            high: point.high,
            low: point.low,
            close: point.close,
            value: point.close
        }));
    }

    async getLatestPrice(mintAddress: string): Promise<number | null> {
        try {
            const response = await fetch(`/api/prices/${mintAddress}/latest`);
            if (!response.ok) {
                throw new Error('Failed to fetch latest price');
            }
            const data = await response.json();
            return data?.price_usd ? Number(data.price_usd) : null;
        } catch (error) {
            console.error('Error fetching latest price:', error);
            return null;
        }
    }

    // Add method to check migration status
    public hasMigrationEvents(network: 'mainnet' | 'devnet'): boolean {
        return this.migrationEventsReceived.get(network) || false;
    }

    private getNetworkFromMessage(data: any): 'mainnet' | 'devnet' {
        // Assuming the message contains a network field
        return data.network || 'devnet';  // Default to devnet if not specified
    }

    private startHeartbeat(network: 'mainnet' | 'devnet') {
        const HEARTBEAT_INTERVAL = 15000;  // 15 seconds
        const MESSAGE_TIMEOUT = 30000;     // 30 seconds

        setInterval(() => {
            const ws = this.getWebSocketForNetwork(network);
            if (ws?.readyState === WebSocket.OPEN) {
                // Send ping
                ws.send(JSON.stringify({ type: 'ping' }));

                // Check last message time
                const lastMessageTime = this.lastMessageTime.get(network) || 0;
                if (Date.now() - lastMessageTime > MESSAGE_TIMEOUT) {
                    console.warn(`No messages received on ${network} for 30s, reconnecting...`);
                    this.handleDisconnect(network);
                }
            }
        }, HEARTBEAT_INTERVAL);
    }

    private initMetrics(): WebSocketMetrics {
        return {
            messageCount: 0,
            errorCount: 0,
            reconnections: 0,
            latency: [],
            lastMessageTime: Date.now()
        };
    }

    public getConnectionStats(network: 'mainnet' | 'devnet') {
        const metrics = this.metrics.get(network)!;
        const ws = this.getWebSocketForNetwork(network);

        return {
            status: ws?.readyState === WebSocket.OPEN ? 'connected' : 'disconnected',
            metrics: {
                messageCount: metrics.messageCount,
                errorCount: metrics.errorCount,
                reconnections: metrics.reconnections,
                averageLatency: metrics.latency.length ?
                    metrics.latency.reduce((a, b) => a + b, 0) / metrics.latency.length :
                    0,
                lastMessageAge: Date.now() - metrics.lastMessageTime
            },
            subscriptions: Array.from(this.subscribers.keys()).length
        };
    }

    private cleanup(network: 'mainnet' | 'devnet') {
        const ws = this.getWebSocketForNetwork(network);
        if (ws) {
            ws.close();
            if (network === 'mainnet') {
                this.wsMainnet = null;
            } else {
                this.wsDevnet = null;
            }
        }
        const pendingMessages = this.pendingMessages.get(network);
        if (pendingMessages) pendingMessages.length = 0;
        this.metrics.set(network, this.initMetrics());
    }

    // Add public method for complete shutdown
    public shutdown() {
        this.cleanup('mainnet');
        this.cleanup('devnet');
        WebSocketClient.instance = null;
    }

    public send(message: string): void {
        const ws = this.wsDevnet || this.wsMainnet;
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    }
}

interface PriceHistoryPoint {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

interface WebSocketMetrics {
    messageCount: number;
    errorCount: number;
    reconnections: number;
    latency: number[];  // Last 10 message latencies
    lastMessageTime: number;
}

interface OHLCVPoint {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
}

export const priceClient = {
    wsClient: WebSocketClient.getInstance(),

    // Only used for getting historical price data for charts
    async getPriceHistory(mintAddress: string): Promise<CandlestickData<Time>[]> {
        const response = await fetch(`/api/ohlcv/${mintAddress}?resolution=1&from=${Math.floor(Date.now() / 1000 - 300)}&to=${Math.floor(Date.now() / 1000)}`);
        if (!response.ok) throw new Error('Failed to fetch price history');

        const data: PriceHistoryPoint[] = await response.json();

        if (!data || !data.length) {
            console.warn('No price data available for:', mintAddress);
            throw new Error('No price data available');
        }

        return data.map(point => ({
            time: point.time as Time,
            open: point.open,
            high: point.high,
            low: point.low,
            close: point.close
        }));
    },

    getLatestPrice: async (mintAddress: string): Promise<number | null> => {
        try {
            const response = await fetch(`/api/prices/${mintAddress}/latest`);
            if (!response.ok) {
                throw new Error('Failed to fetch latest price');
            }
            const data = await response.json();
            return data?.price_usd ? Number(data.price_usd) : null;
        } catch (error) {
            console.error('Error fetching latest price:', error);
            return null;
        }
    },

    async subscribeToPrice(
        mintAddress: string,
        callback: (update: { price: number; time: number; isSell?: boolean; volume?: number }) => void,
        network: 'mainnet' | 'devnet' = 'devnet'
    ): Promise<() => void> {
        return await this.wsClient.subscribeToPrice(mintAddress, callback, network);
    },

    async getDexTokenPrice(mintAddress: string): Promise<number | null> {
        try {
            const response = await fetch(
                `https://quote-api.jup.ag/v6/quote?inputMint=${mintAddress}&outputMint=So11111111111111111111111111111111111111112&amount=1000000&slippageBps=50`
            );

            if (!response.ok) return null;

            const quoteData = await response.json();
            // Calculate price from the quote (outAmount in lamports)
            const outAmount = Number(quoteData.outAmount);
            return outAmount / 1e9; // Convert lamports to SOL
        } catch (error) {
            console.error('Error fetching DEX token price:', error);
            return null;
        }
    },

    unsubscribeFromPrice: (mintAddress: string) => {
        WebSocketClient.getInstance().send(JSON.stringify({ type: 'unsubscribe', mintAddress }));
    }
};