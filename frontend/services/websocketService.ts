import { EventEmitter } from 'events';

export class WebSocketService extends EventEmitter {
    private static instance: WebSocketService;
    private ws: WebSocket | null = null;
    private subscribers: Map<string, Set<(data: any) => void>> = new Map();
    private reconnectTimeout: number | null = null;
    private readonly RECONNECT_DELAY = 5000;

    private constructor() {
        super();
        this.connect();
    }

    static getInstance(): WebSocketService {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }

    private connect() {
        if (this.ws?.readyState === WebSocket.OPEN) return;

        this.ws = new WebSocket(`${process.env.VITE_WS_URL || 'ws://localhost:3001/ws'}`);

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const subscribers = this.subscribers.get(data.mintAddress);
                if (subscribers) {
                    subscribers.forEach(callback => callback(data));
                }
            } catch (error) {
                console.error('WebSocket message handling error:', error);
            }
        };

        this.ws.onclose = () => {
            this.handleReconnect();
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.handleReconnect();
        };
    }

    private handleReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        this.reconnectTimeout = window.setTimeout(() => {
            this.connect();
        }, this.RECONNECT_DELAY);
    }

    public subscribe(mintAddress: string) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'subscribe',
                mintAddress
            }));
        }
    }

    unsubscribe(mintAddress: string, callback: (data: any) => void) {
        const subscribers = this.subscribers.get(mintAddress);
        if (subscribers) {
            subscribers.delete(callback);
        }
    }
}
