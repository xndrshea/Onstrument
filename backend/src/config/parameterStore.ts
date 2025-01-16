import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';

export async function loadConfig() {
    const env = process.env.NODE_ENV || 'development';

    // For local development, use .env files
    if (env === 'development') {
        logger.info('Loading local environment variables...');
        dotenv.config({ path: '.env.local' });
        return;
    }

    // For production, try Parameter Store first
    try {
        logger.info('Loading from AWS Parameter Store...');
        const ssm = new SSMClient({ region: 'us-east-1' });
        const path = `/onstrument/${env}/`;

        const response = await ssm.send(new GetParametersByPathCommand({
            Path: path,
            WithDecryption: true,
            Recursive: true
        }));

        if (!response.Parameters) {
            throw new Error('No parameters found in AWS Parameter Store');
        }

        // Load into process.env
        response.Parameters.forEach(param => {
            if (param.Name && param.Value) {
                const envName = param.Name.replace(path, '');
                process.env[envName] = param.Value;
            }
        });

        logger.info(`Loaded ${response.Parameters.length} parameters from AWS Parameter Store`);

    } catch (error) {
        logger.error('Failed to load from AWS Parameter Store:', error);

        // Fallback to .env files if AWS fails
        logger.info('Falling back to .env files...');
        dotenv.config({ path: `.env.${env}` });
    }
} 