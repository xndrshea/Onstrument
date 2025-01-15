import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import fs from 'fs';

async function generateViteEnv() {
    const ssm = new SSMClient({ region: 'us-east-1' });

    try {
        const response = await ssm.send(new GetParametersByPathCommand({
            Path: '/onstrument/prod/',
            WithDecryption: true,
            Recursive: true
        }));

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

        // Write to .env file in frontend directory
        fs.writeFileSync('frontend/.env', envContent);
        console.log('Generated Vite environment file');
    } catch (error) {
        console.error('Failed to generate Vite env:', error);
        process.exit(1);
    }
}

generateViteEnv(); 