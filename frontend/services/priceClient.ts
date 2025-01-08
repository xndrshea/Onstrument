import { API_BASE_URL, MAINNET_API_BASE_URL } from '../config';
import { WebSocketMessage } from '../../shared/types/websocket';
import { CandlestickData } from 'lightweight-charts';
import { Time } from 'lightweight-charts';

class WebSocketClient {
    private static instance: WebSocketClient;
    private wsDevnet: WebSocket | null = null;
    private wsMainnet: WebSocket | null = null;
    private subscribers: Map<string, Set<(update: { price: number; time: number }) => void>> = new Map();
    private tokenNetworks: Map<string, 'mainnet' | 'devnet'> = new Map();
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 5;
    private readonly wsDevnetUrl = `${API_BASE_URL.replace('http', 'ws')}/ws`;
    private readonly wsMainnetUrl = `${MAINNET_API_BASE_URL.replace('http', 'ws')}/ws`;
    private connectionPromises: {
        devnet: Promise<void> | null;
        mainnet: Promise<void> | null;
    } = { devnet: null, mainnet: null };

    private constructor() {
        // Private constructor for singleton
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

                    newWs.onopen = () => {
                        console.log(`WebSocket connected to ${network} network`);
                        this.reconnectAttempts = 0;
                        this.resubscribeAll();
                        resolve();
                        this.connectionPromises[network] = null;
                    };

                    // Rest of the WebSocket setup remains the same
                    newWs.onclose = () => {
                        console.log(`WebSocket disconnected from ${network} network`);
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

                    newWs.onmessage = this.handleMessage.bind(this);
                } catch (error) {
                    console.error(`Error connecting to WebSocket on ${network} network:`, error);
                    reject(error);
                }
            });
        }

        return this.connectionPromises[network];
    }

    private handleMessage(event: MessageEvent) {
        try {
            const data = JSON.parse(event.data);
            console.log('Raw WebSocket message:', data);

            if (data.type === 'price' && data.mintAddress && typeof data.price === 'number') {
                console.log('Valid price update received:', data);
                const callbacks = this.subscribers.get(data.mintAddress);
                if (callbacks) {
                    const priceUpdate = {
                        price: data.price,
                        time: Math.floor(Date.now() / 1000)
                    };
                    callbacks.forEach(callback => callback(priceUpdate));
                } else {
                    console.warn('No callbacks found for mintAddress:', data.mintAddress);
                }
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error, 'Raw data:', event.data);
        }
    }

    private resubscribeAll() {
        for (const [mintAddress] of this.subscribers) {
            this.sendSubscription(mintAddress);
        }
    }

    private sendSubscription(mintAddress: string) {
        const ws = this.getWebSocketForMint(mintAddress);
        console.log('Sending subscription for:', mintAddress, 'WebSocket state:', ws?.readyState);

        if (ws?.readyState === WebSocket.OPEN) {
            const subscribeMsg = {
                type: 'subscribe',
                mintAddress,
                channel: 'price'
            };
            console.log('Sending subscribe message:', subscribeMsg);
            ws.send(JSON.stringify(subscribeMsg));
        } else {
            console.error('WebSocket not ready. State:', ws?.readyState);
        }
    }

    private handleDisconnect(network: 'mainnet' | 'devnet' = 'devnet') {
        if (network === 'mainnet') {
            this.wsMainnet = null;
        } else {
            this.wsDevnet = null;
        }
        this.connectionPromises[network] = null;

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            setTimeout(() => this.ensureConnected(network), delay);
        }
    }

    async subscribeToPrice(
        mintAddress: string,
        callback: (update: { price: number; time: number }) => void,
        network: 'mainnet' | 'devnet' = 'devnet'
    ): Promise<() => void> {
        // Only allow subscriptions for custom tokens
        if (network === 'mainnet') {
            console.warn('WebSocket subscriptions are not supported for DEX tokens');
            return () => { };
        }

        console.log(`Setting up WebSocket subscription for custom token ${mintAddress}`);
        const instance = WebSocketClient.getInstance();
        return await instance.subscribeToPrice(mintAddress, callback, network);
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
        const response = await fetch(`${API_BASE_URL}/price-history/${mintAddress}`);
        if (!response.ok) throw new Error('Failed to fetch price history');

        const data: PriceHistoryPoint[] = await response.json();
        return data.map(point => ({
            time: point.time as Time,
            open: point.open,
            high: point.high,
            low: point.low,
            close: point.close
        }));
    }
}

interface PriceHistoryPoint {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

export const priceClient = {
    wsClient: WebSocketClient.getInstance(),

    // Only used for getting historical price data for charts
    async getPriceHistory(mintAddress: string): Promise<CandlestickData<Time>[]> {
        console.log('Fetching price history from API for:', mintAddress);
        const response = await fetch(`${API_BASE_URL}/price-history/${mintAddress}`);

        if (!response.ok) {
            console.error('Price history fetch failed:', response.status);
            throw new Error('Failed to fetch price history');
        }

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
            const response = await fetch(`${API_BASE_URL}/price-history/${mintAddress}`);
            if (!response.ok) {
                throw new Error('Failed to fetch price history');
            }
            const history = await response.json();
            return history.length > 0 ? history[history.length - 1].value : null;
        } catch (error) {
            console.error('Error fetching latest price:', error);
            return null;
        }
    },

    async subscribeToPrice(
        mintAddress: string,
        callback: (update: { price: number; time: number }) => void,
        network: 'mainnet' | 'devnet' = 'devnet'
    ): Promise<() => void> {
        console.log(`Setting up WebSocket subscription for ${mintAddress} on ${network}`);
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
    }
};