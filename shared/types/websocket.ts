export type WebSocketMessageType = 'price' | 'trade' | 'orderbook';

export interface WebSocketMessage {
    type: WebSocketMessageType;
    mintAddress: string;
    data: {
        price?: number;
        trade?: {
            side: 'buy' | 'sell';
            amount: number;
            price: number;
            timestamp: number;
        };
        orderbook?: {
            bids: [number, number][];
            asks: [number, number][];
        };
    };
}
