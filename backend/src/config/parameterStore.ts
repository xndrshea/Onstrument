import { SSMClient, GetParameterCommand, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { logger } from '../utils/logger';

const ssm = new SSMClient({ region: 'us-east-1' });

export async function loadParameterStoreConfig() {
    try {
        const response = await ssm.send(new GetParametersByPathCommand({
            Path: '/onstrument/prod/',
            WithDecryption: true,
            Recursive: true
        }));

        if (!response.Parameters) {
            throw new Error('No parameters found');
        }

        // Load into process.env
        response.Parameters.forEach(param => {
            if (param.Name && param.Value) {
                // Strip the /onstrument/prod/ prefix
                const envName = param.Name.replace('/onstrument/prod/', '');
                process.env[envName] = param.Value;
            }
        });

        logger.info('Loaded configuration from Parameter Store');
    } catch (error) {
        logger.error('Failed to load parameters from AWS:', error);
        throw error;
    }
} 