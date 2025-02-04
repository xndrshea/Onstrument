import type { CandlestickData } from 'lightweight-charts';
import type { Time } from 'lightweight-charts';
import { getBaseUrl } from '../config';


class WebSocketClient {
    private static instance: WebSocketClient | null = null;
    private ws: WebSocket | null = null;
    private subscribers: Map<string, Set<(update: { price: number; time: number; volume?: number; isSell?: boolean }) => void>> = new Map();
    private clientId: string;

    private constructor() {
        this.clientId = crypto.randomUUID();
        this.connect();
    }

    private connect() {
        const wsUrl = `${getBaseUrl()}/api/ws`.replace('http', 'ws').replace('https', 'wss');
        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                const identifyMsg = { type: 'identify', clientId: this.clientId };
                this.ws?.send(JSON.stringify(identifyMsg));
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event);
            };

            this.ws.onerror = (error) => {
                console.error('DEBUG - WebSocket error:', error);
            };

            this.ws.onclose = (event) => {
            };

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
        callback: (update: { price: number; time: number; volume?: number; isSell?: boolean }) => void,
        network: 'mainnet' | 'devnet' = import.meta.env.PROD ? 'mainnet' : 'devnet'
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
        try {
            const data = JSON.parse(event.data);
            if (!data.mintAddress) return;

            const subscribers = this.subscribers.get(data.mintAddress);
            if (!subscribers) return;

            const update = {
                price: Number(data.close || data.price),
                time: Math.floor(Date.now() / 1000),
                volume: Number(data.volume || 0),
                isSell: data.isSell
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
        callback: (update: { price: number; time: number; volume?: number; isSell?: boolean }) => void,
        network: 'mainnet' | 'devnet' = import.meta.env.PROD ? 'mainnet' : 'devnet'
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