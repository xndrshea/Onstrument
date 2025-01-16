import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { logger } from '../utils/logger';

const ssm = new SSMClient({ region: 'us-east-1' });

export async function loadParameterStoreConfig() {
    const env = process.env.NODE_ENV || 'development';
    const path = `/onstrument/${env}/`;

    try {
        logger.info(`Loading parameters from ${path}`);
        const response = await ssm.send(new GetParametersByPathCommand({
            Path: path,
            WithDecryption: true,
            Recursive: true
        }));

        if (!response.Parameters) {
            throw new Error('No parameters found');
        }

        // Load into process.env
        response.Parameters.forEach(param => {
            if (param.Name && param.Value) {
                // Strip the environment prefix
                const envName = param.Name.replace(path, '');
                process.env[envName] = param.Value;
            }
        });

        logger.info(`Loaded ${response.Parameters.length} parameters from Parameter Store`);
    } catch (error) {
        if (env === 'development') {
            logger.warn('Failed to load from Parameter Store in development - using local env files');
            return;
        }
        logger.error('Failed to load parameters from AWS:', error);
        throw error;
    }
} 