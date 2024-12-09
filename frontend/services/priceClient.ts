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
        const ws = new WebSocket(`ws://${window.location.hostname}:3001/ws`);

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'price' && data.mintAddress === mintAddress) {
                callback(data.price);
            }
        };

        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'subscribe', mintAddress }));
        };

        return () => ws.close();
    }
};
