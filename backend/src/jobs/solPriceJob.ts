import { CronJob } from 'cron';
import { SolPriceService } from '../services/price/solPriceService';
import { logger } from '../utils/logger';

export function initializeSolPriceJob(): void {
    const solPriceService = SolPriceService.getInstance();

    // Run every 5 minutes
    const job = new CronJob('*/5 * * * *', async () => {
        logger.info('Starting SOL price update job');
        await solPriceService.updateSolPrice();
    });

    // Start the job
    job.start();

    // Run immediately on startup
    solPriceService.updateSolPrice().catch(error => {
        logger.error('Error in initial SOL price update:', error);
    });
} 