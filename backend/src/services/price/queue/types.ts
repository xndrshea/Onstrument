export interface PriceUpdate {
    mintAddress: string;
    price: number;
    volume?: number;
    timestamp: number;
    source: 'raydium_standard' | 'raydium_legacy' | 'raydium_clmm' | 'bonding_curve';
}

export interface BatchProcessingResult {
    success: boolean;
    processedCount: number;
    failedCount: number;
    errors?: Error[];
}

export interface QueueMetrics {
    queueLength: number;
    processedCount: number;
    failedCount: number;
    lastProcessingTime: number;
}
