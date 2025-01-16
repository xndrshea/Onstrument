const { SSMClient, GetParametersByPathCommand } = require('@aws-sdk/client-ssm');

interface AWSError {
    name: string;
    message: string;
    $metadata?: {
        httpStatusCode: number;
    };
}

interface Parameter {
    Name?: string;
    Value?: string;
    Type?: string;
}

async function testAwsAccess(mode = 'prod') {
    console.log(`\nTesting AWS Parameter Store access in ${mode} mode...`);

    try {
        // First, verify we have credentials
        console.log('Checking AWS credentials...');
        const ssm = new SSMClient({
            region: 'us-east-1'
        });

        console.log('Credentials loaded, attempting to fetch parameters...');
        const path = `/onstrument/${mode}/`;
        console.log(`Path: ${path}`);

        let allParameters: Parameter[] = [];
        let nextToken: string | undefined;

        do {
            const response = await ssm.send(new GetParametersByPathCommand({
                Path: path,
                WithDecryption: true,
                Recursive: true,
                NextToken: nextToken
            }));

            if (response.Parameters) {
                allParameters = [...allParameters, ...response.Parameters];
            }
            nextToken = response.NextToken;
        } while (nextToken);

        console.log('Successfully connected to AWS Parameter Store');
        console.log(`Parameters found: ${allParameters.length}`);

        if (allParameters.length) {
            console.log('\nParameters by type:');
            console.log('\nString parameters:');
            allParameters
                .filter((param: Parameter) => param.Type === 'String')
                .forEach((param: Parameter) => {
                    console.log(`  - ${param.Name}`);
                });

            console.log('\nSecureString parameters:');
            allParameters
                .filter((param: Parameter) => param.Type === 'SecureString')
                .forEach((param: Parameter) => {
                    console.log(`  - ${param.Name}`);
                });
        } else {
            console.log('No parameters found in this path');
        }

    } catch (error: unknown) {
        console.error('\nError occurred:');
        const awsError = error as AWSError;
        console.error('  Name:', awsError.name);
        console.error('  Message:', awsError.message);
        if (awsError.$metadata) {
            console.error('  Status code:', awsError.$metadata.httpStatusCode);
        }
    }
}

// Test single mode
console.log('Starting AWS Parameter Store test...');
testAwsAccess();
