import { EventEmitter } from 'events';
export abstract class BaseProcessor extends EventEmitter {
    protected static isActive: boolean = false;
    protected static lastProcessedTime: number = 0;
    protected static processedCount: number = 0;

    public static getStatus() {
        return {
            isActive: this.isActive,
            lastProcessedTime: this.lastProcessedTime,
            processedCount: this.processedCount
        };
    }

    constructor() {
        super();
    }

    protected async emitPriceUpdate(update: {
        mintAddress: string;
        price: number;
        volume?: number;
    }) {
        this.emit('priceUpdate', update);
    }
}
