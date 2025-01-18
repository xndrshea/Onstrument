#!/bin/bash
set -e

echo "Starting deployment..."

# Get version from git commit hash
VERSION=$(git rev-parse --short HEAD)

# Get AWS account ID
AWS_ACCOUNT=$(aws sts get-caller-identity --query 'Account' --output text)
AWS_REGION="us-east-1"
ECR_REPO="onstrument-backend"

# Function to deploy backend
deploy_backend() {
    echo "Building and pushing backend version: $VERSION"
    # Login to ECR
    aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com

    # Build backend
    echo "Building backend Docker image..."
    docker build --platform linux/amd64 \
        -t $ECR_REPO:$VERSION \
        -t $ECR_REPO:latest \
        -f docker/backend/Dockerfile .

    # Push to ECR
    echo "Pushing to ECR..."
    docker tag $ECR_REPO:$VERSION $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$VERSION
    docker tag $ECR_REPO:latest $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest
    docker push $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$VERSION
    docker push $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest

    # Update ECS service
    echo "Updating ECS service..."
    aws ecs update-service \
        --cluster onstrument-prod-cluster \
        --service onstrument-prod-backend-service \
        --force-new-deployment \
        --region $AWS_REGION
}

# Function to deploy frontend
deploy_frontend() {
    echo "Building and deploying frontend..."
    # Build frontend
    echo "Installing dependencies..."
    npm install

    echo "Building frontend..."
    npm run build -- \
        --mode production

    echo "Deploying to S3..."
    BUCKET_NAME="onstrument-prod-frontend"
    aws s3 sync frontend/dist/ s3://$BUCKET_NAME --delete

    echo "Invalidating CloudFront cache..."
    DIST_ID="E26HJ2P8HB4IIH"
    aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --backend-only)
            BACKEND_ONLY=true
            shift
            ;;
        --frontend-only)
            FRONTEND_ONLY=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Deploy based on arguments
if [[ $BACKEND_ONLY == true ]]; then
    deploy_backend
elif [[ $FRONTEND_ONLY == true ]]; then
    deploy_frontend
else
    # Deploy both if no specific flag
    deploy_backend
    deploy_frontend
fi

echo "Deployment complete!" 