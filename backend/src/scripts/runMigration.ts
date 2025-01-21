import migrate from 'node-pg-migrate';
import path from 'path';
import dotenv from 'dotenv';

// Navigate up to the root directory (../../..) from /backend/src/scripts
const rootPath = path.join(__dirname, '..', '..', '..');
console.log('Looking for .env.local in:', rootPath);

const result = dotenv.config({
    path: path.join(rootPath, '.env.local')
});

if (result.error) {
    console.log('Error loading .env.local file:', result.error);
}
console.log('Loaded ENV:', process.env.DATABASE_URL);

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
}

const command = process.argv[2] || 'up';

// For status command, we need different options
const config = {
    databaseUrl: databaseUrl,
    migrationsTable: 'pgmigrations',
    dir: path.join(__dirname, '../migrations'),
    direction: command === 'status' ? 'up' : command as 'up' | 'down',
    count: undefined,
    checkOrder: true,
    verbose: true,
    dryRun: command === 'status'  // This will show what needs to be run without actually running it
};

migrate(config)
    .then(() => {
        console.log('Operation complete!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Operation failed:', error);
        process.exit(1);
    }); 