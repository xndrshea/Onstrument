import { API_BASE_URL } from '../config';

class WebSocketClient {
    private static instance: WebSocketClient | null = null;
    private ws: WebSocket | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private subscribers = new Map<string, Set<(price: number) => void>>();

    private constructor() { }

    static getInstance(): WebSocketClient {
        if (!this.instance) {
            this.instance = new WebSocketClient();
        }
        return this.instance;
    }

    private getWebSocketUrl(): string {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = process.env.NODE_ENV === 'production'
            ? window.location.host
            : `${window.location.hostname}:3001`;
        return `${protocol}//${host}/ws`;
    }

    private connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.getWebSocketUrl());

                this.ws.onopen = () => {
                    console.log('WebSocket connected');
                    this.reconnectAttempts = 0;
                    this.resubscribeAll();
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'price' && data.mintAddress) {
                            const callbacks = this.subscribers.get(data.mintAddress);
                            callbacks?.forEach(callback => callback(data.data.price));
                        }
                    } catch (error) {
                        console.error('Error processing WebSocket message:', error);
                    }
                };

                this.ws.onclose = () => {
                    this.handleDisconnect();
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    reject(error);
                };

            } catch (error) {
                console.error('WebSocket connection error:', error);
                reject(error);
            }
        });
    }

    private async handleDisconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);

        console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
        setTimeout(() => this.connect(), delay);
    }

    private resubscribeAll() {
        for (const mintAddress of this.subscribers.keys()) {
            this.sendSubscription(mintAddress);
        }
    }

    private sendSubscription(mintAddress: string) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'subscribe',
                mintAddress,
                channel: 'price'
            }));
        }
    }

    subscribeToPrice(mintAddress: string, callback: (price: number) => void): () => void {
        if (!this.subscribers.has(mintAddress)) {
            this.subscribers.set(mintAddress, new Set());
        }

        this.subscribers.get(mintAddress)?.add(callback);

        if (this.ws?.readyState !== WebSocket.OPEN) {
            this.connect();
        } else {
            this.sendSubscription(mintAddress);
        }

        return () => {
            const callbacks = this.subscribers.get(mintAddress);
            callbacks?.delete(callback);
            if (callbacks?.size === 0) {
                this.subscribers.delete(mintAddress);
            }
        };
    }
}

export const priceClient = {
    wsClient: WebSocketClient.getInstance(),

    subscribeToPrice(mintAddress: string, callback: (price: number) => void): () => void {
        return this.wsClient.subscribeToPrice(mintAddress, callback);
    },

    // Only used for getting historical price data for charts
    async getPriceHistory(mintAddress: string): Promise<Array<{ time: number, value: number }>> {
        console.log('Fetching price history from API for:', mintAddress);
        const response = await fetch(`${API_BASE_URL}/price-history/${mintAddress}`);

        if (!response.ok) {
            console.error('Price history fetch failed:', response.status);
            throw new Error('Failed to fetch price history');
        }

        const data = await response.json();
        console.log('Price history data points:', data.length);
        console.log('Sample data point:', data[0]);

        if (!data || !data.length) {
            console.warn('No price data available for:', mintAddress);
            throw new Error('No price data available');
        }

        return data.map((point: any) => {
            const time = Number(point.time);
            const value = Number(point.value);

            if (!isFinite(time) || !isFinite(value)) {
                console.warn('Invalid data point:', point);
                return null;
            }

            return { time, value };
        }).filter(Boolean);
    },
};