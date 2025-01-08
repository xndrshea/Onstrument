export const formatMarketCap = (marketCap: number | string | null): string => {
    if (!marketCap) return 'N/A';

    // Convert to number if it's a string
    const value = typeof marketCap === 'string' ? parseFloat(marketCap) : marketCap;

    // Check if we have a valid number
    if (isNaN(value)) return 'N/A';

    if (value >= 1_000_000_000) {
        const billions = value / 1_000_000_000;
        return `$${billions.toFixed(2)}B`;
    } else if (value >= 1_000_000) {
        const millions = value / 1_000_000;
        return `$${millions.toFixed(2)}M`;
    } else if (value >= 1_000) {
        const thousands = value / 1_000;
        return `$${thousands.toFixed(2)}K`;
    } else {
        return `$${value.toFixed(2)}`;
    }
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

export const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(num);
}; 