# Build stage
FROM node:20-slim as builder

WORKDIR /app/backend

# Copy package files
COPY backend/package*.json ./

# Install dependencies
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

# Copy package files and install production dependencies
COPY backend/package*.json ./
RUN npm install --production

# Copy compiled files from builder - fix the path
COPY --from=builder /app/backend/dist/backend/src ./dist

ENV NODE_ENV=production

EXPOSE 3001

CMD ["npm", "run", "start"] 