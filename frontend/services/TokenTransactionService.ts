import { Connection } from '@solana/web3.js';
import { BondingCurve } from './bondingCurve';
import { getProgramErrorMessage } from '../types/errors';

export class TokenTransactionService {
    private bondingCurve: BondingCurve;

    constructor(connection: Connection, wallet: any) {
        this.bondingCurve = new BondingCurve(connection, wallet);
    }

    async createToken(params: {
        name: string;
        symbol: string;
        totalSupply: number;
        basePrice: number;
        slope: number;
    }) {
        try {
            return await this.bondingCurve.createToken(params);
        } catch (error) {
            throw new Error(getProgramErrorMessage(error));
        }
    }

    async buyTokens(params: {
        curveAddress: string;
        amount: number;
        maxSolCost: number;
    }) {
        try {
            return await this.bondingCurve.buy(params);
        } catch (error) {
            throw new Error(getProgramErrorMessage(error));
        }
    }
}