import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';

let configLoaded = false;

export async function loadConfig() {
    if (configLoaded) {
        logger.info('Config already loaded, skipping...');
        return;
    }

    const env = process.env.NODE_ENV || 'development';
    logger.info(`Loading config for environment: ${env}`);

    try {
        if (env === 'development') {
            // For local development, use .env files
            logger.info('Loading local environment variables...');
            dotenv.config({ path: '.env.local' });
        } else {
            // For production, use Parameter Store
            logger.info('Loading from AWS Parameter Store...');
            const ssm = new SSMClient({ region: 'us-east-1' });
            const path = `/onstrument/${env}/`;

            const response = await ssm.send(new GetParametersByPathCommand({
                Path: path,
                WithDecryption: true,
                Recursive: true
            }));

            if (!response.Parameters?.length) {
                throw new Error('No parameters found in AWS Parameter Store');
            }

            // Debug log parameters found
            logger.info(`Found ${response.Parameters.length} parameters in AWS`);
            response.Parameters.forEach(param => {
                if (param.Name) {
                    const envName = param.Name.replace(path, '');
                    logger.info(`Loading parameter: ${envName}`);
                }
            });

            // Load into process.env
            response.Parameters.forEach(param => {
                if (param.Name && param.Value) {
                    const envName = param.Name.replace(path, '');
                    process.env[envName] = param.Value;
                }
            });
        }

        configLoaded = true;
        logger.info('Configuration loaded successfully');

    } catch (error) {
        logger.error('Failed to load configuration:', error);
        throw error;
    }
} 