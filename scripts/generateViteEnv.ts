import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import fs from 'fs';

async function generateViteEnv() {
    console.log('Starting parameter fetch...');
    const ssm = new SSMClient({ region: 'us-east-1' });

    try {
        const response = await ssm.send(new GetParametersByPathCommand({
            Path: '/onstrument/prod/',
            WithDecryption: true,
            Recursive: true
        }));

        console.log('Parameters fetched:', response.Parameters?.length);

        if (!response.Parameters) {
            throw new Error('No parameters found');
        }

        // Filter only VITE_ parameters and create env content
        const envContent = response.Parameters
            .filter(param => param.Name?.includes('VITE_'))
            .map(param => {
                const name = param.Name?.split('/').pop() || '';
                return `${name}=${param.Value}`;
            })
            .join('\n');

        console.log('Writing to frontend/.env...');
        // Create frontend directory if it doesn't exist
        if (!fs.existsSync('frontend')) {
            fs.mkdirSync('frontend');
        }
        fs.writeFileSync('frontend/.env', envContent);
        console.log('Generated Vite environment file');
    } catch (error) {
        console.error('Failed to generate Vite env:', error);
        process.exit(1);
    }
}

generateViteEnv(); 