import { Express } from 'express';
import { Server as HttpServer } from 'http';
import WebSocket from 'ws';
import { logger } from '../utils/logger';
import { wsManager } from '../services/websocket/WebSocketManager';
import { HeliusManager } from '../services/price/websocket/heliusManager';

export class ApplicationServer {
    private server: HttpServer;
    private wss: WebSocket.Server;

    constructor(app: Express, port: number) {
        this.server = new HttpServer(app);
        this.wss = this.createWebSocketServer();
        this.configureServer(port);
    }

    private createWebSocketServer(): WebSocket.Server {
        const wss = new WebSocket.Server({
            server: this.server,
            path: '/api/ws',
            verifyClient: this.verifyWebSocketClient
        });

        wsManager.initialize(wss);
        return wss;
    }

    private verifyWebSocketClient = (info: { origin: string }, cb: (verified: boolean, code?: number, message?: string) => void) => {
        const origin = info.origin;
        const isDocker = process.env.DOCKER === 'true';

        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5173',
            'http://frontend:3000',
            'https://onstrument.com',
            'https://www.onstrument.com',
            process.env.FRONTEND_URL
        ].filter(Boolean);

        if (isDocker && process.env.NODE_ENV !== 'production') {
            logger.info('Docker development mode - accepting connection from:', origin);
            cb(true);
            return;
        }

        if (allowedOrigins.includes(origin)) {
            cb(true);
            logger.info('WebSocket connection accepted from:', origin);
        } else {
            logger.warn(`Rejected WebSocket connection from origin: ${origin}`);
            cb(false, 403, 'Forbidden');
        }
    }

    private configureServer(port: number): void {
        this.server.listen(port, () => {
            logger.info(`Server is running on port ${port}`);
        });
    }

    public async initialize(): Promise<void> {
        const heliusManager = HeliusManager.getInstance();
        await heliusManager.initialize(this.wss);
    }

    public getServer(): HttpServer {
        return this.server;
    }

    public getWebSocketServer(): WebSocket.Server {
        return this.wss;
    }
} 