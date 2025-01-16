FROM node:20-slim

WORKDIR /app

# Copy package files first
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install dependencies
RUN npm install
RUN cd backend && npm install

# Copy backend source
COPY backend ./backend

# Build TypeScript
RUN npm run build:server

EXPOSE 3001

CMD ["npm", "run", "start"] 