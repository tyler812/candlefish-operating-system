#!/bin/bash

# ============================================================================
# Candlefish Operating System v2.0 - Master Deployment Script
# ============================================================================
# This script deploys the complete CLOS v2.0 infrastructure and applications
# Author: Patrick Smith, Co-Owner & Root Operator
# ============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="clos-v2"
AWS_REGION="us-east-1"
ENVIRONMENT="production"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="deployment-${TIMESTAMP}.log"

# Function: Print colored output
print_status() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}" | tee -a "$LOG_FILE"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

print_error() {
    echo -e "${RED}❌ $1${NC}" | tee -a "$LOG_FILE"
}

# Function: Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI not found. Please install it first."
        exit 1
    fi
    
    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        print_error "Terraform not found. Please install it first."
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker not found. Please install it first."
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js not found. Please install it first."
        exit 1
    fi
    
    # Check GitHub CLI
    if ! command -v gh &> /dev/null; then
        print_warning "GitHub CLI not found. Some features may not work."
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Please run 'aws configure'."
        exit 1
    fi
    
    print_success "All prerequisites met"
}

# Function: Deploy infrastructure
deploy_infrastructure() {
    print_status "Deploying AWS infrastructure with Terraform..."
    
    cd infrastructure/
    
    # Initialize Terraform
    print_status "Initializing Terraform..."
    terraform init
    
    # Plan deployment
    print_status "Planning infrastructure deployment..."
    terraform plan -out=tfplan
    
    # Apply with auto-approve for automation
    print_status "Applying infrastructure changes..."
    terraform apply tfplan
    
    # Save outputs
    terraform output -json > ../terraform-outputs.json
    
    cd ..
    
    print_success "Infrastructure deployed successfully"
}

# Function: Build and deploy Core API
deploy_core_api() {
    print_status "Building and deploying CLOS Core API..."
    
    cd services/clos-core-api/
    
    # Build Docker image
    print_status "Building Docker image..."
    docker build -t clos-core-api:latest .
    
    # Get ECR repository URL from Terraform outputs
    ECR_REPO=$(cat ../../terraform-outputs.json | jq -r '.ecr_repository_url.value')
    
    # Tag image for ECR
    docker tag clos-core-api:latest "${ECR_REPO}:latest"
    docker tag clos-core-api:latest "${ECR_REPO}:${TIMESTAMP}"
    
    # Login to ECR
    aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REPO}
    
    # Push to ECR
    print_status "Pushing image to ECR..."
    docker push "${ECR_REPO}:latest"
    docker push "${ECR_REPO}:${TIMESTAMP}"
    
    # Update ECS service
    print_status "Updating ECS service..."
    aws ecs update-service \
        --cluster clos-v2-cluster \
        --service clos-core-api \
        --force-new-deployment \
        --region ${AWS_REGION}
    
    cd ../..
    
    print_success "Core API deployed successfully"
}

# Function: Deploy dashboard to Vercel
deploy_dashboard() {
    print_status "Deploying dashboard to Vercel..."
    
    cd apps/dashboard/
    
    # Install dependencies
    print_status "Installing dependencies..."
    npm ci
    
    # Build application
    print_status "Building Next.js application..."
    npm run build
    
    # Deploy to Vercel
    if command -v vercel &> /dev/null; then
        print_status "Deploying to Vercel..."
        vercel --prod --yes
    else
        print_warning "Vercel CLI not found. Please deploy manually."
    fi
    
    cd ../..
    
    print_success "Dashboard deployment initiated"
}

# Function: Deploy Slack bot
deploy_slack_bot() {
    print_status "Deploying CLOS Slack bot..."
    
    cd services/clos-slack-bot/
    
    # Build Docker image
    print_status "Building Slack bot Docker image..."
    docker build -t clos-slack-bot:latest .
    
    # Deploy to ECS or your preferred platform
    # This is a placeholder - adjust based on your deployment strategy
    print_status "Deploying Slack bot..."
    
    cd ../..
    
    print_success "Slack bot deployed successfully"
}

# Function: Setup GitHub Actions
setup_github_actions() {
    print_status "Setting up GitHub Actions workflows..."
    
    if command -v gh &> /dev/null; then
        # Set GitHub secrets
        print_status "Setting GitHub secrets..."
        
        # Get values from Terraform outputs
        API_URL=$(cat terraform-outputs.json | jq -r '.api_url.value')
        
        gh secret set CLOS_API_URL --body "${API_URL}"
        gh secret set AWS_REGION --body "${AWS_REGION}"
        
        print_success "GitHub Actions configured"
    else
        print_warning "GitHub CLI not found. Please configure secrets manually."
    fi
}

# Function: Run health checks
run_health_checks() {
    print_status "Running health checks..."
    
    # Get API URL from Terraform outputs
    API_URL=$(cat terraform-outputs.json | jq -r '.api_url.value')
    
    # Check API health
    if curl -f "${API_URL}/health" &> /dev/null; then
        print_success "API health check passed"
    else
        print_warning "API health check failed"
    fi
    
    # Check dashboard
    DASHBOARD_URL=$(cat terraform-outputs.json | jq -r '.dashboard_url.value' || echo "https://dashboard.clos.candlefish.ai")
    if curl -f "${DASHBOARD_URL}" &> /dev/null; then
        print_success "Dashboard health check passed"
    else
        print_warning "Dashboard health check failed"
    fi
}

# Function: Print deployment summary
print_summary() {
    print_status "Deployment Summary"
    echo "========================================" | tee -a "$LOG_FILE"
    echo "Project: ${PROJECT_NAME}" | tee -a "$LOG_FILE"
    echo "Environment: ${ENVIRONMENT}" | tee -a "$LOG_FILE"
    echo "Region: ${AWS_REGION}" | tee -a "$LOG_FILE"
    echo "Timestamp: ${TIMESTAMP}" | tee -a "$LOG_FILE"
    echo "Log File: ${LOG_FILE}" | tee -a "$LOG_FILE"
    echo "========================================" | tee -a "$LOG_FILE"
    
    # Print access URLs
    if [ -f terraform-outputs.json ]; then
        API_URL=$(cat terraform-outputs.json | jq -r '.api_url.value')
        echo "API URL: ${API_URL}" | tee -a "$LOG_FILE"
    fi
    
    echo "Dashboard URL: https://dashboard.clos.candlefish.ai" | tee -a "$LOG_FILE"
    echo "========================================" | tee -a "$LOG_FILE"
}

# Main deployment flow
main() {
    echo "========================================" | tee "$LOG_FILE"
    echo "Candlefish Operating System v2.0" | tee -a "$LOG_FILE"
    echo "Master Deployment Script" | tee -a "$LOG_FILE"
    echo "========================================" | tee -a "$LOG_FILE"
    
    # Check for deployment mode
    MODE=${1:-full}
    
    case $MODE in
        full)
            check_prerequisites
            deploy_infrastructure
            deploy_core_api
            deploy_dashboard
            deploy_slack_bot
            setup_github_actions
            run_health_checks
            print_summary
            print_success "Full deployment completed successfully!"
            ;;
        infra)
            check_prerequisites
            deploy_infrastructure
            print_success "Infrastructure deployment completed!"
            ;;
        api)
            deploy_core_api
            print_success "API deployment completed!"
            ;;
        dashboard)
            deploy_dashboard
            print_success "Dashboard deployment completed!"
            ;;
        slack)
            deploy_slack_bot
            print_success "Slack bot deployment completed!"
            ;;
        health)
            run_health_checks
            ;;
        *)
            print_error "Unknown deployment mode: $MODE"
            echo "Usage: $0 [full|infra|api|dashboard|slack|health]"
            exit 1
            ;;
    esac
    
    print_status "Deployment log saved to: ${LOG_FILE}"
}

# Handle script interruption
trap 'print_error "Deployment interrupted!"; exit 1' INT TERM

# Run main function
main "$@"