FROM node:20-slim

WORKDIR /app/backend

# Copy only backend package.json
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install

# Copy backend source
COPY backend/src ./src
COPY backend/tsconfig.json ./

# Build TypeScript
RUN npm run build

# Production environment
ENV NODE_ENV=production

EXPOSE 3001

# Run production server
CMD ["npm", "run", "start"] 