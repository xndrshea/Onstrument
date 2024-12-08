export const priceClient = {
    async getPrice(mintAddress: string): Promise<number> {
        const response = await fetch(`/api/prices/${mintAddress}`);
        if (!response.ok) throw new Error('Failed to fetch price');
        const data = await response.json();
        return data.price;
    },

    async getPriceHistory(mintAddress: string) {
        const response = await fetch(`/api/prices/${mintAddress}/history`);
        if (!response.ok) throw new Error('Failed to fetch price history');
        return response.json();
    }
};
