export const formatMarketCap = (marketCap: number | string | null): string => {
    if (!marketCap) return 'N/A';
    const numericMarketCap = typeof marketCap === 'string' ? parseFloat(marketCap) : marketCap;
    return `${numericMarketCap.toFixed(2)} SOL`;
};

export function convertBigIntToNumber(value: bigint | undefined): number {
    if (value === undefined) {
        return 0;
    }
    // Safely convert BigInt to number, handling potential overflow
    try {
        return Number(value);
    } catch (error) {
        console.warn('Error converting BigInt to number:', error);
        return 0;
    }
} 