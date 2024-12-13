export interface PriceUpdate {
    mintAddress: string;
    price: number;
    volume?: number;
    timestamp: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
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
