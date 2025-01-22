import migrate from 'node-pg-migrate';
import path from 'path';
import dotenv from 'dotenv';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args.find(arg => !arg.startsWith('--')) || 'up';
const isLocal = args.includes('--local');
const isTimescale = args.includes('--timescale');

// Production database configuration
const TIMESCALE_CONFIG = {
    host: 'krr5hnzkou.dt2nm2kjqv.tsdb.cloud.timescale.com',
    port: 31509,
    database: 'tsdb',
    user: 'tsdbadmin',
    password: 'Noas)(@#-2398h`s',
    ssl: true
};

let databaseUrl: string;

if (isTimescale) {
    // Use TimescaleDB configuration
    const { host, port, database, user, password } = TIMESCALE_CONFIG;
    // URL encode the password to handle special characters
    const encodedPassword = encodeURIComponent(password);
    databaseUrl = `postgres://${user}:${encodedPassword}@${host}:${port}/${database}?sslmode=require`;
    console.log('Using TimescaleDB configuration');
} else {
    // Load local configuration
    const rootPath = path.join(__dirname, '..', '..', '..');
    console.log('Loading .env.local...');

    const result = dotenv.config({
        path: path.join(rootPath, '.env.local')
    });

    if (result.error) {
        console.log('Error loading .env.local file:', result.error);
        process.exit(1);
    }

    databaseUrl = process.env.DATABASE_URL!;
    console.log('Using local configuration');
}

if (!databaseUrl) {
    console.error('Database URL could not be determined');
    process.exit(1);
}

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

// Add informative logging
console.log(`Running migration command: ${command}`);
console.log(`Database: ${isTimescale ? 'TimescaleDB' : 'Local'}`);
console.log(`Migrations directory: ${config.dir}`);

migrate(config)
    .then(() => {
        console.log('Operation complete!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Operation failed:', error);
        process.exit(1);
    }); 