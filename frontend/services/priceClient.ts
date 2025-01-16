import type { CandlestickData } from 'lightweight-charts';
import type { Time } from 'lightweight-charts';


class WebSocketClient {
    private static instance: WebSocketClient | null = null;
    private ws: WebSocket | null = null;
    private subscribers: Map<string, Set<(update: { price: number; time: number }) => void>> = new Map();
    private clientId: string;

    private constructor() {
        this.clientId = crypto.randomUUID();
        this.connect();
    }

    private connect() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.hostname}:3001/api/ws`;
        console.log('DEBUG - Attempting WebSocket connection:', wsUrl);

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('DEBUG - WebSocket connected successfully');
                const identifyMsg = { type: 'identify', clientId: this.clientId };
                this.ws?.send(JSON.stringify(identifyMsg));
            };

            this.ws.onmessage = (event) => {
                console.log('DEBUG - WebSocket message received:', event.data);
                this.handleMessage(event);
            };

            this.ws.onerror = (error) => {
                console.error('DEBUG - WebSocket error:', error);
            };

            this.ws.onclose = (event) => {
                console.log('DEBUG - WebSocket closed:', event.code, event.reason);
            };

            console.log('DEBUG - WebSocket current state:', this.ws.readyState);
        } catch (error) {
            console.error('DEBUG - Error creating WebSocket:', error);
        }
    }

    static getInstance(): WebSocketClient {
        if (!WebSocketClient.instance) {
            WebSocketClient.instance = new WebSocketClient();
        }
        return WebSocketClient.instance;
    }

    async subscribeToPrice(
        mintAddress: string,
        callback: (update: { price: number; time: number }) => void,
        network: 'mainnet' | 'devnet' = 'devnet'
    ): Promise<() => void> {
        if (!this.subscribers.has(mintAddress)) {
            this.subscribers.set(mintAddress, new Set());
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'subscribe',
                    mintAddress,
                    network,
                    clientId: this.clientId
                }));
            }
        }
        this.subscribers.get(mintAddress)!.add(callback);

        return () => {
            const subscribers = this.subscribers.get(mintAddress);
            if (subscribers) {
                subscribers.delete(callback);
                if (subscribers.size === 0) {
                    this.subscribers.delete(mintAddress);
                    if (this.ws?.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({
                            type: 'unsubscribe',
                            mintAddress,
                            clientId: this.clientId
                        }));
                    }
                }
            }
        };
    }

    isConnected(network: 'mainnet' | 'devnet'): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    private handleMessage(event: MessageEvent) {
        console.log('WebSocket message received:', event.data);
        try {
            const data = JSON.parse(event.data);
            if (!data.mintAddress) return;

            const subscribers = this.subscribers.get(data.mintAddress);
            if (!subscribers) return;

            const update = {
                price: Number(data.close || data.price),
                time: Math.floor(Date.now() / 1000)
            };

            subscribers.forEach(callback => callback(update));
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    }
}

export const priceClient = {
    wsClient: WebSocketClient.getInstance(),

    subscribeToPrice: (
        mintAddress: string,
        callback: (update: { price: number; time: number }) => void,
        network: 'mainnet' | 'devnet' = 'devnet'
    ) => WebSocketClient.getInstance().subscribeToPrice(mintAddress, callback, network),

    isConnected: (network: 'mainnet' | 'devnet') =>
        WebSocketClient.getInstance().isConnected(network),

    // Keep existing price history methods
    getPriceHistory: async (mintAddress: string): Promise<CandlestickData<Time>[]> => {
        const response = await fetch(`/api/ohlcv/${mintAddress}?resolution=1&from=${Math.floor(Date.now() / 1000 - 300)}&to=${Math.floor(Date.now() / 1000)}`);
        if (!response.ok) throw new Error('Failed to fetch price history');
        return await response.json();
    }
};