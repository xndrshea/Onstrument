# Solana Token Launchpad Platform

## Project Overview
A decentralized platform for creating and trading tokens on the Solana blockchain, featuring automated market making through bonding curves and eventual Raydium integration.

## Key Features

### Token Creation & Trading Flow
1. **Token Creation**:
   - Creator sets token parameters (name, symbol, supply, etc.)
   - Configures bonding curve (initial price, slope, reserve ratio)
   - Initial supply is minted to bonding curve's Associated Token Account (ATA)
   - Mint authority transferred to bonding curve account

2. **Trading Through Bonding Curve**:
   - Users can buy tokens:
     - Send SOL to reserve account
     - Receive tokens from bonding curve ATA
   - Users can sell tokens:
     - Send tokens back to bonding curve ATA
     - Receive SOL from reserve account
   - Price automatically adjusts based on supply/demand

3. **Raydium Migration**:
   - When market cap threshold reached
   - Remaining tokens and SOL transferred to Raydium pool
   - Liquidity provided automatically
   - Trading continues on Raydium DEX

### Bonding Curve Implementation
- Automated market maker functionality
- Dynamic pricing based on supply
- Reserve pool management
- Liquidity guarantees through mathematical curve
- Configurable parameters:
  - Initial price
  - Slope (price change rate)
  - Reserve ratio (liquidity backing)
  - Initial & maximum supply

## Architecture

### Frontend (React + TypeScript)
- `src/App.tsx`: Main application component handling routing and wallet connection
- `src/index.tsx`: Entry point, sets up React with Solana wallet adapters
- `src/polyfills.ts`: Browser polyfills for Solana web3 compatibility

#### Components
1. **Token Creation**
   - `TokenCreationForm.tsx`: Handles token creation with customizable parameters
   - Features: name, symbol, supply, description, logo upload

2. **Token Trading**
   - `TradingInterface.tsx`: Manages token buying/selling through bonding curve
   - Features:
     - Real-time price calculations
     - Balance checking
     - Transaction handling
     - Network validation (Devnet)

3. **Token Display**
   - `TokenList.tsx`: Displays all created tokens
   - Features:
     - Token cards with details
     - Add to wallet functionality
     - Solana Explorer links

4. **Charts**
   - `PriceChart.tsx`: Visualizes token price curves
   - Uses Chart.js for rendering
   - Shows price/supply relationship

5. **UI Components**
   - `Modal.tsx`: Reusable modal component
   - Styling: CSS modules in `styles/main.css`

### Backend (Node.js + Express)
- `server/src/index.ts`: Entry point
- `server/src/app.ts`: Express application setup

#### Components
1. **API Routes**
   - `tokenRoutes.ts`: Token-related endpoints
   - Endpoints:
     - POST /tokens: Create token
     - GET /tokens: List tokens
     - GET /tokens/:mint: Get specific token
     - PATCH /tokens/:mint/stats: Update stats

2. **Controllers**
   - `tokenController.ts`: Business logic for token operations

3. **Database**
   - PostgreSQL for token storage
   - `dbMigration.ts`: Database schema management
   - `database.ts`: Connection configuration

4. **Middleware**
   - `errorHandler.ts`: Global error handling
   - `validation.ts`: Request validation

### Services
1. **Bonding Curve**
   - Implements automated market maker functionality
   - Calculates token prices based on supply
   - Manages liquidity pool

2. **Token Service**
   - Handles token creation and management
   - Interfaces with Solana blockchain
   - Manages token metadata

### Security Features
- Rate limiting
- CORS protection
- Input validation
- Transaction verification
- Network validation

### Development Tools
- Vite for frontend bundling
- TypeScript for type safety
- Nodemon for development
- Environment configuration
- Logging system

## Technical Requirements
- Node.js 16+
- PostgreSQL
- Solana CLI tools
- Phantom Wallet (or compatible)

## Setup Instructions
1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   - Create `.env` file
   - Set required variables

3. Start development:
   ```bash
   # Frontend
   npm run dev

   # Backend
   npm run server:dev
   ```

4. Database setup:
   ```bash
   npm run db:migrate
   ```

## Network Configuration
- Default: Solana Devnet
- Configurable through environment variables
- Supports wallet network validation

## Deployment
- Frontend: Static hosting (Vercel/Netlify)
- Backend: Node.js hosting (Render)
- Database: PostgreSQL instance

## Contributing
1. Fork repository
2. Create feature branch
3. Submit pull request

## License
[Your License]

## Technical Implementation

### Token Creation Flow
1. **Creator Actions**:
   - Submits token metadata
   - Configures bonding curve parameters
   - Generates and stores keypairs

2. **First Purchase**:
   - Checks if token needs initialization
   - Combines initialization and purchase instructions
   - Updates token metadata with initialization status
   - Sets up bonding curve accounts

3. **Subsequent Trades**:
   - Normal buy/sell operations through bonding curve
   - Price calculations based on current supply
   - Reserve pool management