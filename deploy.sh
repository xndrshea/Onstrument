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
docker build -t $ECR_REPO:$VERSION -f docker/backend/Dockerfile .

# Tag and push
echo "Pushing to ECR..."
docker tag $ECR_REPO:$VERSION $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$VERSION
docker push $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$VERSION

echo "Building and deploying frontend..."
cd frontend
echo "Installing frontend dependencies..."
npm install

echo "Building frontend..."
npm run build

echo "Deploying to S3..."
# Get bucket name from terraform output
BUCKET_NAME=$(cd ../terraform && terraform output -raw frontend_bucket_name)
aws s3 sync dist/ s3://$BUCKET_NAME --delete

# Update ECS service with new version
echo "Updating ECS service..."
aws ecs update-service \
    --cluster onstrument-prod-cluster \
    --service onstrument-prod-backend-service \
    --force-new-deployment \
    --region $AWS_REGION

echo "Invalidating CloudFront cache..."
# Get distribution ID from terraform output
DIST_ID=$(cd ../terraform && terraform output -raw cloudfront_distribution_id)
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"

echo "Deployment complete!" 