import { TokenRecord } from '../../shared/types/token';

const MAINNET_USDC_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MAINNET_SOL_ADDRESS = 'So11111111111111111111111111111111111111112';

export const filterService = {
    filterTokens: (tokens: TokenRecord[]) => {
        return tokens.filter(token =>
            // Keep token if:
            // 1. Not a fake USDC
            !(token.symbol === 'USDC' && token.mintAddress !== MAINNET_USDC_ADDRESS) &&
            // 2. Not a fake SOL
            !(token.symbol === 'SOL' && token.mintAddress !== MAINNET_SOL_ADDRESS) &&
            // 3. Has an image
            (token.imageUrl || (token.content?.metadata?.image))
        );
    }
}; 