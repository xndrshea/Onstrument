import { TokenRecord } from '../../shared/types/token';

const MAINNET_USDC_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MAINNET_SOL_ADDRESS = 'So11111111111111111111111111111111111111112';

const SUSPICIOUS_VOLUME_THRESHOLD = 1_000_000; // $1M in volume
const MIN_MARKET_CAP = 10_000; // $10K market cap

export const filterService = {
    filterTokens: (tokens: TokenRecord[]) => {
        return tokens.filter(token =>
            // Keep token if:
            // 1. Not a fake USDC
            !(token.symbol === 'USDC' && token.mintAddress !== MAINNET_USDC_ADDRESS) &&
            // 2. Not a fake SOL
            !(token.symbol === 'SOL' && token.mintAddress !== MAINNET_SOL_ADDRESS) &&
            // 3. Has an image
            (token.imageUrl || (token.content?.metadata?.image)) &&
            // 4. Filter out suspicious volume/mcap ratio
            !((token.volume24h || 0) > SUSPICIOUS_VOLUME_THRESHOLD && (token.marketCapUsd || 0) < MIN_MARKET_CAP)
        );
    }
}; 