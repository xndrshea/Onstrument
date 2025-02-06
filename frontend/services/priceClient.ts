import type { CandlestickData } from 'lightweight-charts';
import type { Time } from 'lightweight-charts';
import { getBaseUrl } from '../config';


class WebSocketClient {
    private static instance: WebSocketClient | null = null;
    private ws: WebSocket | null = null;
    private subscribers: Map<string, Set<(update: { price: number; time: number; volume?: number; isSell?: boolean }) => void>> = new Map();
    private clientId: string;
    private tradeSubscribers: Set<(update: any) => void> = new Set();
    private creationSubscribers = new Set<(creation: any) => void>();

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

            // Handle price updates
            if (data.type === 'price' && data.mintAddress) {
                const subscribers = this.subscribers.get(data.mintAddress);
                if (subscribers) {
                    const update = {
                        price: Number(data.close || data.price),
                        time: Math.floor(Date.now() / 1000),
                        volume: Number(data.volume || 0),
                        isSell: data.isSell,
                        mintAddress: data.mintAddress,
                        timestamp: data.timestamp || Date.now(),
                        walletAddress: data.walletAddress
                    };

                    // Notify price subscribers
                    subscribers.forEach(callback => callback(update));

                    // Notify trade subscribers
                    this.tradeSubscribers.forEach(callback => callback(update));
                }
            }

            // Add this case
            if (data.type === 'creation') {
                this.creationSubscribers.forEach(cb => cb(data));
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    }

    public sendChatMessage(message: string, userId: string) {
        const chatMessage = {
            type: 'chat',
            message: message,
            userId: userId
        };
        this.ws?.send(JSON.stringify(chatMessage));
    }

    public subscribeToChatMessages(callback: (data: any) => void) {
        const handler = (event: MessageEvent) => {
            const data = JSON.parse(event.data);
            if (data.type === 'chat') {
                callback({
                    username: data.username,
                    message: data.message,
                    timestamp: data.timestamp
                });
            }
        };
        this.ws?.addEventListener('message', handler);
        return () => this.ws?.removeEventListener('message', handler);
    }

    public subscribeToTrades(callback: (data: any) => void) {
        this.tradeSubscribers.add(callback);
        return () => this.tradeSubscribers.delete(callback);
    }

    subscribeToCreations(callback: (creation: any) => void) {
        this.creationSubscribers.add(callback);
        return () => this.creationSubscribers.delete(callback);
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

    sendChatMessage: (message: string, userId: string) =>
        WebSocketClient.getInstance().sendChatMessage(message, userId),

    // Keep existing price history methods
    getPriceHistory: async (mintAddress: string): Promise<CandlestickData<Time>[]> => {
        const response = await fetch(`/api/ohlcv/${mintAddress}?resolution=1&from=${Math.floor(Date.now() / 1000 - 300)}&to=${Math.floor(Date.now() / 1000)}`);
        if (!response.ok) throw new Error('Failed to fetch price history');
        return await response.json();
    },

    subscribeToChatMessages: (callback: (data: any) => void) =>
        WebSocketClient.getInstance().subscribeToChatMessages(callback),

    subscribeToTrades: (callback: (data: any) => void) =>
        WebSocketClient.getInstance().subscribeToTrades(callback),

    subscribeToCreations: (callback: (data: any) => void) =>
        WebSocketClient.getInstance().subscribeToCreations(callback),
};