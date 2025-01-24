import { SSMClient, GetParametersByPathCommand, Parameter } from '@aws-sdk/client-ssm';
import dotenv from 'dotenv';

export class ParameterStore {
    private static instance: ParameterStore;
    private client: SSMClient;
    private initialized: boolean = false;
    private parameterPath: string;

    private constructor() {
        const region = process.env.AWS_REGION || 'us-east-1';
        this.client = new SSMClient({ region });
        this.parameterPath = process.env.PARAMETER_PATH || '/onstrument/prod/';
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

    private async fetchAllParameters(): Promise<Parameter[]> {
        let nextToken: string | undefined;
        let allParameters: Parameter[] = [];

        do {
            const command = new GetParametersByPathCommand({
                Path: this.parameterPath,
                Recursive: true,
                WithDecryption: true,
                NextToken: nextToken
            });

            const response = await this.client.send(command);

            if (response.Parameters) {
                allParameters = [...allParameters, ...response.Parameters];
            }

            nextToken = response.NextToken;
        } while (nextToken);

        return allParameters;
    }

    private setEnvironmentVariables(parameters: Parameter[]): void {

        if (parameters.length === 0) {
            throw new Error('No parameters found in Parameter Store');
        }

        parameters.forEach(param => {
            const name = param.Name?.split('/').pop() || '';
            if (param.Value) {
                process.env[name] = param.Value;
            }
        });
    }

    public async initialize(): Promise<void> {

        try {
            if (process.env.NODE_ENV === 'development') {
                dotenv.config({ path: '.env.local' });
                this.initialized = true;
                return;
            }

            const parameters = await this.fetchAllParameters();
            this.setEnvironmentVariables(parameters);
            this.initialized = true;

        } catch (error) {
            console.error('[STARTUP ERROR] Failed to load parameters:', error);
            throw error;
        }
    }

    // Helper method to get a specific parameter value after initialization
    public getParameter(name: string): string | undefined {
        return process.env[name];
    }
}

// Export singleton instance
export const parameterStore = ParameterStore.getInstance();