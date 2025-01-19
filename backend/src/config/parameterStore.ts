import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';

export class ParameterStore {
    private static instance: ParameterStore;
    private client: SSMClient;
    private initialized: boolean = false;

    private constructor() {
        console.log('[STARTUP] Creating SSM client with region:', process.env.AWS_REGION);
        this.client = new SSMClient({ region: process.env.AWS_REGION });
    }

    public static getInstance(): ParameterStore {
        if (!ParameterStore.instance) {
            ParameterStore.instance = new ParameterStore();
        }
        return ParameterStore.instance;
    }

    public isInitialized(): boolean {
        return this.initialized;
    }

    public async initialize(): Promise<void> {
        console.log('[STARTUP] ParameterStore initialize() called');
        console.log('[STARTUP] Current NODE_ENV:', process.env.NODE_ENV);

        if (process.env.NODE_ENV === 'development') {
            console.log('[STARTUP] Development environment detected, loading .env.local');
            dotenv.config({ path: '.env.local' });
            this.initialized = true;
            return;
        }

        console.log('[STARTUP] Current AWS_REGION:', process.env.AWS_REGION);

        try {
            let nextToken: string | undefined;
            let allParameters: any[] = [];

            do {
                console.log('[STARTUP] Creating GetParametersByPathCommand with path: /onstrument/prod/');
                const command = new GetParametersByPathCommand({
                    Path: '/onstrument/prod/',
                    Recursive: true,
                    WithDecryption: true,
                    NextToken: nextToken
                });

                console.log('[STARTUP] Sending command to SSM...');
                const response = await this.client.send(command);

                if (response.Parameters) {
                    allParameters = [...allParameters, ...response.Parameters];
                }

                nextToken = response.NextToken;
            } while (nextToken);

            console.log('[STARTUP] All parameters received. Total count:', allParameters.length);

            if (allParameters.length === 0) {
                throw new Error('No parameters found in Parameter Store');
            }

            // Process parameters
            allParameters.forEach(param => {
                const name = param.Name?.split('/').pop() || '';
                console.log('[STARTUP] Loading parameter:', name);
                if (param.Value) {
                    process.env[name] = param.Value;
                }
            });

            console.log('[STARTUP] Parameter Store initialization complete');
            this.initialized = true;
        } catch (error) {
            console.error('[STARTUP ERROR] Failed to load parameters:', error);
            throw error;
        }
    }
}

export const parameterStore = ParameterStore.getInstance(); 
