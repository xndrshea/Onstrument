FROM node:20-slim

WORKDIR /app

# Set ARG and ENV before build steps
ARG VITE_DOCKER
ARG NODE_ENV
ENV VITE_DOCKER=$VITE_DOCKER
ENV NODE_ENV=$NODE_ENV

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all necessary files
COPY frontend/ ./frontend/
COPY target/idl/ ./target/idl/        
COPY target/types/ ./target/types/ 
COPY tsconfig.json .
COPY tsconfig.node.json .
COPY vite.config.ts .
COPY tailwind.config.js .
COPY postcss.config.js .

# Build for production
RUN npm run build

EXPOSE 3000

# Use vite preview
CMD ["npm", "run", "preview", "--", "--host", "--port", "3000"] 