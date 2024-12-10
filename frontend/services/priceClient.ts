import { API_BASE_URL } from '../config';

export const priceClient = {
    // Only used for getting historical price data for charts
    async getPriceHistory(mintAddress: string): Promise<Array<{ time: number, value: number }>> {
        const response = await fetch(`${API_BASE_URL}/price-history/${mintAddress}`);
        if (!response.ok) throw new Error('Failed to fetch price history');
        return response.json();
    },

    // Only used for real-time chart updates
    subscribeToPrice(mintAddress: string, callback: (price: number) => void): () => void {
        let ws: WebSocket | null = null;
        let reconnectTimer: NodeJS.Timeout | null = null;
        let isIntentionalClose = false;
        let isConnecting = false;

        const connect = () => {
            if (isConnecting || ws?.readyState === WebSocket.OPEN) return;

            isConnecting = true;
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = process.env.NODE_ENV === 'production'
                ? window.location.host
                : `${window.location.hostname}:3001`;
            const wsUrl = `${protocol}//${host}/ws`;

            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log(`WebSocket connected for ${mintAddress}`);
                isConnecting = false;
                ws?.send(JSON.stringify({
                    type: 'subscribe',
                    mintAddress,
                    channel: 'price'
                }));
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'price' && data.mintAddress === mintAddress) {
                        callback(data.data.price);
                    }
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            ws.onclose = () => {
                isConnecting = false;
                if (!isIntentionalClose) {
                    reconnectTimer = setTimeout(connect, 2000);
                }
            };
        };

        connect();

        return () => {
            isIntentionalClose = true;
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
            }
            if (ws) {
                ws.close();
            }
        };
    }
};