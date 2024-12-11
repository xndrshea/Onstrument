import WebSocket = require('ws');

export interface WebSocketMessage {
    jsonrpc: string;
    method: string;
    params: {
        result: {
            value: {
                pubkey: string;
                account: {
                    owner: string;
                    data: [string, string];
                }
            }
        }
    }
}

export interface WebSocketClient extends WebSocket {
    subscriptions?: Set<string>;
}

export interface HeliusSubscription {
    jsonrpc: "2.0";
    id: number;
    method: "programSubscribe";
    params: [
        string,  // programId
        { encoding: string }
    ];
}
