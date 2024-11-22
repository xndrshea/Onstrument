# Solana Token Creator with Bonding Curve

A web application for creating and managing tokens on the Solana blockchain with an integrated bonding curve mechanism.

## Architecture

### Token Creation
- Creates SPL tokens with customizable parameters
- Implements an automated market maker using a bonding curve
- Single account (bonding curve) manages both token and SOL reserves
- Configurable parameters include:
  - Initial supply
  - Initial price
  - Price slope
  - Reserve ratio

### Bonding Curve Mechanism
The bonding curve acts as an automated market maker (AMM) that:
- Holds the token supply in its Associated Token Account (ATA)
- Manages SOL reserves in the same account
- Automatically calculates token prices based on:
  - Reserve ratio
  - Slope parameter

### Key Components
1. **Token Mint**: The SPL token mint account
2. **Bonding Curve Account**: 
   - Holds token supply (via ATA)
   - Manages SOL reserves
   - Controls mint authority
   - Executes buy/sell operations

### Transaction Flow
1. **Token Purchase**:
   - User sends SOL to bonding curve account
   - Bonding curve transfers tokens from its ATA to user's ATA
   - Price calculated based on bonding curve formula

2. **Token Sale**:
   - User sends tokens to bonding curve's ATA
   - Bonding curve transfers SOL to user
   - Return amount calculated based on bonding curve formula

## Technical Details

### Smart Contract Interactions
- Uses Solana Web3.js for blockchain interactions
- Implements SPL Token program for token operations
- Manages Associated Token Accounts (ATAs) for token holdings

### Configuration Parameters
- `initialSupply`: Initial token supply minted to bonding curve
- `initialPrice`: Starting price per token in SOL
- `slope`: Rate of price increase
- `reserveRatio`: Ratio between token supply and SOL reserves

## Development

### Prerequisites
- Node.js
- Solana CLI tools
- Phantom Wallet or other Solana wallet

### Setup