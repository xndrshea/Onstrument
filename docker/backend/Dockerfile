# Build stage
FROM node:20-slim as builder

WORKDIR /app/backend

# Copy package files
COPY backend/package*.json ./

# Install build dependencies first
RUN apt-get update && \
    apt-get install -y python3 make g++ curl && \
    rm -rf /var/lib/apt/lists/*

# Install dependencies including dev dependencies
RUN npm install

# Copy source code and config files  
COPY backend/src ./src
COPY backend/tsconfig.json ./
COPY shared ../shared

# Create symlink for node_modules in shared directory
RUN mkdir -p ../shared/node_modules && \
    ln -s /app/backend/node_modules/@solana ../shared/node_modules/@solana && \
    ln -s /app/backend/node_modules/bn.js ../shared/node_modules/bn.js

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app/backend

# Install build essentials for native modules
RUN apt-get update && \
    apt-get install -y python3 make g++ curl && \
    rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies
COPY backend/package*.json ./
RUN npm install --production

# Copy the built files from builder stage
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/shared ../shared

EXPOSE 3001

# Add specific debug env var for AWS SDK and our parameter store logs
ENV NODE_DEBUG=aws*,parameterStore
CMD ["node", "dist/backend/src/index.js"] 