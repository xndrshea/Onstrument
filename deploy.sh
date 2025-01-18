#!/bin/bash
set -e

echo "Starting deployment..."

# Get version from git commit hash (since we don't have package.json version)
VERSION=$(git rev-parse --short HEAD)

# Get AWS account ID
AWS_ACCOUNT=$(aws sts get-caller-identity --query 'Account' --output text)
AWS_REGION="us-east-1"
ECR_REPO="onstrument-backend"

echo "Building and pushing backend version: $VERSION"
# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com

# Build backend (from project root)
echo "Building backend Docker image..."
docker build --platform linux/amd64 \
    -t $ECR_REPO:$VERSION \
    -t $ECR_REPO:latest \
    -f docker/backend/Dockerfile .

# Tag and push both version-specific and latest tags
echo "Pushing to ECR..."
docker tag $ECR_REPO:$VERSION $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$VERSION
docker tag $ECR_REPO:latest $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest
docker push $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$VERSION
docker push $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest

echo "Building and deploying frontend..."
# Build frontend from root (where package.json is)
echo "Installing dependencies..."
npm install

echo "Building frontend..."
npm run build -- \
    --mode production

echo "Deploying to S3..."
# Hardcode the bucket name since it's a stable infrastructure value
BUCKET_NAME="onstrument-prod-frontend"
aws s3 sync frontend/dist/ s3://$BUCKET_NAME --delete

# Update ECS service with new version
echo "Updating ECS service..."
aws ecs update-service \
    --cluster onstrument-prod-cluster \
    --service onstrument-prod-backend-service \
    --force-new-deployment \
    --region $AWS_REGION

echo "Invalidating CloudFront cache..."
# Hardcode the CloudFront distribution ID since it's a stable infrastructure value
DIST_ID="E26HJ2P8HB4IIH"
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"

echo "Deployment complete!" 