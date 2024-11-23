import { TokenData } from './tokenService';
import { CurveType, TokenBondingCurveConfig } from '../../shared/types/token';
import { PublicKey, Connection, SystemProgram, LAMPORTS_PER_SOL, TransactionInstruction } from '@solana/web3.js';
import { createTransferInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { bondingCurveManager } from './bondingCurveManager';

interface BondingCurveConfig extends TokenBondingCurveConfig {
    totalSupply: number;
    bondingCurveAddress: string;
    bondingCurveATA: string;
    mintAddress: string;
}

interface PriceCalculationParams {
    connection: Connection;
    amount: number;           // Amount being traded
    isSelling?: boolean;      // Trade direction
}

interface PriceCalculationResult {
    spotPrice: number;
    totalCost: number;
    priceImpact: number;
}

interface BuyInstructionsParams {
    buyer: PublicKey;
    amount: number;
    userATA: PublicKey;
    connection: Connection;
}

interface SellInstructionsParams {
    seller: PublicKey;
    amount: number;
    userATA: PublicKey;
    connection: Connection;
}

export class BondingCurve {
    private config: BondingCurveConfig;

    constructor(config: BondingCurveConfig) {
        // Validate required fields
        if (!config.curveType) {
            throw new Error('Curve type is required');
        }

        if (typeof config.basePrice !== 'number' || config.basePrice <= 0) {
            throw new Error('Base price must be a positive number');
        }

        if (!config.bondingCurveAddress) {
            throw new Error('Bonding curve address is required');
        }

        // Set defaults for optional parameters based on curve type
        switch (config.curveType) {
            case CurveType.LINEAR:
                if (typeof config.slope !== 'number') {
                    config.slope = 0.0000001;
                }
                break;

            case CurveType.EXPONENTIAL:
                if (typeof config.exponent !== 'number') {
                    config.exponent = 2;
                }
                break;

            case CurveType.LOGARITHMIC:
                if (typeof config.logBase !== 'number') {
                    config.logBase = Math.E;
                }
                break;
        }

        this.config = config;
    }

    async calculatePrice({
        connection,
        amount,
        isSelling = false
    }: PriceCalculationParams): Promise<PriceCalculationResult> {
        try {
            const calculationAmount = (!amount || amount <= 0) ? 1 : amount;

            // Get current token supply and SOL price
            const tokenBalance = await connection.getTokenAccountBalance(
                new PublicKey(this.config.bondingCurveATA)
            );
            const currentSupply = Number(tokenBalance.value.amount) / Math.pow(10, 9);
            const totalSupply = this.config.totalSupply;

            // Calculate supply ratio based on remaining supply for buys, total supply for sells
            const supplyRatio = isSelling ?
                (currentSupply + calculationAmount) / totalSupply :
                currentSupply / totalSupply;

            // Calculate base spot price based on curve type
            let spotPrice: number;
            switch (this.config.curveType) {
                case CurveType.LINEAR:
                    // P = P0 + (k * x)
                    spotPrice = this.config.basePrice + (this.config.slope! * supplyRatio);
                    break;

                case CurveType.EXPONENTIAL:
                    // P = P0 * e^(k*x)
                    spotPrice = this.config.basePrice * Math.exp(this.config.exponent! * supplyRatio);
                    break;

                case CurveType.LOGARITHMIC:
                    // P = P0 * ln(1 + k*x)
                    spotPrice = this.config.basePrice * Math.log1p(this.config.logBase! * supplyRatio);
                    break;

                default:
                    throw new Error('Unsupported curve type');
            }

            // Calculate price impact - more sophisticated based on curve type
            const priceImpact = calculatePriceImpact(
                calculationAmount,
                currentSupply,
                totalSupply,
                this.config.curveType,
                isSelling
            );

            // Apply slippage protection
            const slippageMultiplier = isSelling ? 0.98 : 1.02; // 2% slippage
            const adjustedSpotPrice = spotPrice * slippageMultiplier;

            // Calculate total cost with price impact
            const impactMultiplier = 1 + (priceImpact / 100);
            const totalCost = adjustedSpotPrice * calculationAmount * impactMultiplier;

            return {
                spotPrice: adjustedSpotPrice,
                totalCost,
                priceImpact
            };
        } catch (error) {
            console.error('Error calculating price:', error);
            throw error;
        }
    }

    static fromToken(token: TokenData): BondingCurve {
        if (!token.bonding_curve_config || !token.metadata?.bondingCurveAddress) {
            throw new Error('Token missing bonding curve configuration or address');
        }

        return new BondingCurve({
            curveType: token.bonding_curve_config.curveType as CurveType,
            basePrice: token.bonding_curve_config.basePrice,
            slope: token.bonding_curve_config.slope,
            exponent: token.bonding_curve_config.exponent,
            logBase: token.bonding_curve_config.logBase,
            totalSupply: token.metadata.totalSupply || 0,
            bondingCurveAddress: token.metadata.bondingCurveAddress,
            bondingCurveATA: token.metadata.bondingCurveATA,
            mintAddress: token.mint_address
        });
    }

    getBondingCurveAddress(): string {
        return this.config.bondingCurveAddress;
    }

    async getBuyInstructions({
        buyer,
        amount,
        userATA,
        connection
    }: BuyInstructionsParams): Promise<TransactionInstruction[]> {
        const bondingCurvePDA = await bondingCurveManager.getBondingCurvePDA(
            this.config.mintAddress
        );

        const bondingCurveATA = await getAssociatedTokenAddress(
            new PublicKey(this.config.mintAddress),
            bondingCurvePDA,
            true
        );

        const { totalCost: price } = await this.calculatePrice({
            connection,
            amount,
            isSelling: false
        });

        const lamports = BigInt(Math.round(price * LAMPORTS_PER_SOL));
        const tokenAmount = BigInt(Math.round(amount * Math.pow(10, 9)));

        // Create instructions array with proper token transfer metadata
        return [
            SystemProgram.transfer({
                fromPubkey: buyer,
                toPubkey: bondingCurvePDA,
                lamports
            }),
            createTransferInstruction(
                bondingCurveATA,  // from
                userATA,          // to
                bondingCurvePDA,  // authority
                tokenAmount,      // amount
                [],              // multiSigners
                TOKEN_PROGRAM_ID  // programId
            )
        ];
    }

    async getSellInstructions({
        seller,
        amount,
        userATA,
        connection
    }: SellInstructionsParams): Promise<TransactionInstruction[]> {
        const masterKeypair = bondingCurveManager.getMasterKeypair();
        const bondingCurvePDA = await bondingCurveManager.getBondingCurvePDA(
            this.config.mintAddress
        );

        const bondingCurveATA = await getAssociatedTokenAddress(
            new PublicKey(this.config.mintAddress),
            bondingCurvePDA,
            true
        );

        const { totalCost: price } = await this.calculatePrice({
            connection,
            amount,
            isSelling: true
        });

        const instructions: TransactionInstruction[] = [
            // Transfer tokens from seller to bonding curve ATA
            createTransferInstruction(
                userATA,
                bondingCurveATA,
                seller,
                BigInt(Math.floor(amount * Math.pow(10, 9)))
            ),

            // Transfer SOL from bonding curve PDA to seller
            SystemProgram.transfer({
                fromPubkey: bondingCurvePDA,
                toPubkey: seller,
                lamports: price
            })
        ];

        return instructions;
    }
}

// Helper function for price impact calculation
function calculatePriceImpact(
    amount: number,
    currentSupply: number,
    totalSupply: number,
    curveType: CurveType,
    isSelling: boolean
): number {
    const baseImpact = (amount / totalSupply) * 100;

    switch (curveType) {
        case CurveType.LINEAR:
            return baseImpact;
        case CurveType.EXPONENTIAL:
            return baseImpact * 1.5; // Higher impact for exponential curves
        case CurveType.LOGARITHMIC:
            return baseImpact * 0.75; // Lower impact for logarithmic curves
        default:
            return baseImpact;
    }
}