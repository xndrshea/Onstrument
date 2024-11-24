export type Decimal = string; // For precise numeric values
export type PublicKeyString = string; // For Solana addresses

export interface NumericConfig {
    precision: number;
    scale: number;
}

export const PRICE_CONFIG: NumericConfig = {
    precision: 20,
    scale: 9
};
