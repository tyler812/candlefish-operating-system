#!/bin/bash
# CLOS v2.0 Quick Start Deployment Script
# This script deploys the entire CLOS infrastructure in one command

set -e

echo "🚀 Candlefish Operating System v2.0 Deployment"
echo "=============================================="

# Configuration
export AWS_REGION=${AWS_REGION:-us-east-1}
export AWS_PROFILE=${AWS_PROFILE:-candlefish}
export ENVIRONMENT=${ENVIRONMENT:-production}
export DOMAIN=${DOMAIN:-clos.candlefish.ai}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}❌ AWS CLI not found. Please install it first.${NC}"
        exit 1
    fi
    
    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        echo -e "${RED}❌ Terraform not found. Please install it first.${NC}"
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js not found. Please install it first.${NC}"
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker not found. Please install it first.${NC}"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity --profile $AWS_PROFILE &> /dev/null; then
        echo -e "${RED}❌ AWS credentials not configured for profile: $AWS_PROFILE${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ All prerequisites met${NC}"
}

# Setup S3 backend for Terraform
setup_terraform_backend() {
    echo -e "${YELLOW}Setting up Terraform backend...${NC}"
    
    BUCKET_NAME="candlefish-terraform-state"
    
    # Create S3 bucket if it doesn't exist
    if ! aws s3api head-bucket --bucket $BUCKET_NAME --profile $AWS_PROFILE 2>/dev/null; then
        aws s3api create-bucket \
            --bucket $BUCKET_NAME \
            --region $AWS_REGION \
            --profile $AWS_PROFILE
        
        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket $BUCKET_NAME \
            --versioning-configuration Status=Enabled \
            --profile $AWS_PROFILE
        
        # Enable encryption
        aws s3api put-bucket-encryption \
            --bucket $BUCKET_NAME \
            --server-side-encryption-configuration '{
                "Rules": [
                    {
                        "ApplyServerSideEncryptionByDefault": {
                            "SSEAlgorithm": "AES256"
                        }
                    }
                ]
            }' \
            --profile $AWS_PROFILE
    fi
    
    echo -e "${GREEN}✅ Terraform backend ready${NC}"
}

# Deploy infrastructure
deploy_infrastructure() {
    echo -e "${YELLOW}Deploying AWS infrastructure...${NC}"
    
    cd ../infrastructure/terraform
    
    # Initialize Terraform
    terraform init \
        -backend-config="bucket=candlefish-terraform-state" \
        -backend-config="key=clos/prod/terraform.tfstate" \
        -backend-config="region=$AWS_REGION"
    
    # Plan deployment
    terraform plan -out=tfplan
    
    # Apply if user confirms
    read -p "Do you want to apply this plan? (yes/no): " confirm
    if [ "$confirm" == "yes" ]; then
        terraform apply tfplan
        
        # Export outputs
        terraform output -json > outputs.json
        
        echo -e "${GREEN}✅ Infrastructure deployed${NC}"
    else
        echo -e "${YELLOW}Infrastructure deployment skipped${NC}"
    fi
    
    cd ../../deploy
}

# Build and deploy Core API
deploy_core_api() {
    echo -e "${YELLOW}Building and deploying Core API...${NC}"
    
    cd ../services/clos-core
    
    # Install dependencies
    npm install
    
    # Build Docker image
    docker build -t clos-core:latest .
    
    # Tag for ECR
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --profile $AWS_PROFILE)
    ECR_REPOSITORY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/clos-core"
    
    # Login to ECR
    aws ecr get-login-password --region $AWS_REGION --profile $AWS_PROFILE | \
        docker login --username AWS --password-stdin $ECR_REPOSITORY
    
    # Create repository if it doesn't exist
    aws ecr describe-repositories --repository-names clos-core --profile $AWS_PROFILE 2>/dev/null || \
        aws ecr create-repository --repository-name clos-core --profile $AWS_PROFILE
    
    # Push image
    docker tag clos-core:latest $ECR_REPOSITORY:latest
    docker push $ECR_REPOSITORY:latest
    
    # Deploy to ECS
    aws ecs update-service \
        --cluster clos-production \
        --service clos-core-api \
        --force-new-deployment \
        --profile $AWS_PROFILE
    
    echo -e "${GREEN}✅ Core API deployed${NC}"
    
    cd ../../deploy
}

# Setup database
setup_database() {
    echo -e "${YELLOW}Setting up database...${NC}"
    
    # Get RDS endpoint from Terraform outputs
    RDS_ENDPOINT=$(cd ../infrastructure/terraform && terraform output -raw rds_endpoint)
    
    # Run migrations
    cd ../database
    
    # Set database URL
    export DATABASE_URL="postgresql://clos_admin:$DB_PASSWORD@$RDS_ENDPOINT/clos"
    
    # Run migrations
    npm run migrate:deploy
    
    # Seed initial data
    npm run seed
    
    echo -e "${GREEN}✅ Database setup complete${NC}"
    
    cd ../deploy
}

# Deploy dashboard
deploy_dashboard() {
    echo -e "${YELLOW}Deploying dashboard to Vercel...${NC}"
    
    cd ../apps/dashboard
    
    # Install dependencies
    npm install
    
    # Build
    npm run build
    
    # Deploy to Vercel
    if command -v vercel &> /dev/null; then
        vercel --prod --yes
    else
        echo -e "${YELLOW}Vercel CLI not found. Please deploy manually.${NC}"
    fi
    
    echo -e "${GREEN}✅ Dashboard deployed${NC}"
    
    cd ../../deploy
}

# Setup GitHub Actions
setup_github_actions() {
    echo -e "${YELLOW}Setting up GitHub Actions...${NC}"
    
    # Create secrets
    gh secret set CLOS_API_TOKEN --body "$CLOS_API_TOKEN"
    gh secret set AWS_ACCESS_KEY_ID --body "$AWS_ACCESS_KEY_ID"
    gh secret set AWS_SECRET_ACCESS_KEY --body "$AWS_SECRET_ACCESS_KEY"
    gh secret set SLACK_BOT_TOKEN --body "$SLACK_BOT_TOKEN"
    
    echo -e "${GREEN}✅ GitHub Actions configured${NC}"
}

# Setup Slack integration
setup_slack() {
    echo -e "${YELLOW}Setting up Slack integration...${NC}"
    
    cd ../integrations/slack
    
    # Install dependencies
    npm install
    
    # Deploy
    npm run deploy:prod
    
    echo -e "${GREEN}✅ Slack bot deployed${NC}"
    
    cd ../../deploy
}

# Setup monitoring
setup_monitoring() {
    echo -e "${YELLOW}Setting up monitoring...${NC}"
    
    # Create CloudWatch dashboards
    aws cloudwatch put-dashboard \
        --dashboard-name CLOS-Main \
        --dashboard-body file://../monitoring/dashboards/main.json \
        --profile $AWS_PROFILE
    
    # Setup Datadog if API key is provided
    if [ ! -z "$DATADOG_API_KEY" ]; then
        # Install Datadog agent on ECS
        aws ecs register-task-definition \
            --cli-input-json file://../monitoring/datadog/task-definition.json \
            --profile $AWS_PROFILE
    fi
    
    echo -e "${GREEN}✅ Monitoring configured${NC}"
}

# Main deployment flow
main() {
    echo ""
    echo "Starting CLOS v2.0 deployment..."
    echo ""
    
    check_prerequisites
    setup_terraform_backend
    
    echo ""
    echo -e "${YELLOW}This will deploy the following:${NC}"
    echo "  • AWS Infrastructure (ECS, RDS, DynamoDB, etc.)"
    echo "  • Core API Service"
    echo "  • PostgreSQL Database"
    echo "  • Dashboard (Vercel)"
    echo "  • Slack Integration"
    echo "  • GitHub Actions Workflows"
    echo "  • Monitoring Stack"
    echo ""
    
    read -p "Continue with deployment? (yes/no): " proceed
    if [ "$proceed" != "yes" ]; then
        echo "Deployment cancelled."
        exit 0
    fi
    
    # Get required secrets
    echo ""
    echo "Please provide the following secrets:"
    read -s -p "Database Password: " DB_PASSWORD
    echo ""
    read -s -p "CLOS API Token: " CLOS_API_TOKEN
    echo ""
    read -s -p "Slack Bot Token: " SLACK_BOT_TOKEN
    echo ""
    
    # Deploy everything
    deploy_infrastructure
    setup_database
    deploy_core_api
    deploy_dashboard
    setup_github_actions
    setup_slack
    setup_monitoring
    
    echo ""
    echo -e "${GREEN}🎉 CLOS v2.0 deployment complete!${NC}"
    echo ""
    echo "Access your services at:"
    echo "  • Dashboard: https://dashboard.$DOMAIN"
    echo "  • API: https://api.$DOMAIN"
    echo "  • Docs: https://docs.$DOMAIN"
    echo ""
    echo "Next steps:"
    echo "  1. Configure your first pod in the dashboard"
    echo "  2. Invite team members"
    echo "  3. Connect your GitHub repositories"
    echo "  4. Test the Slack integration with /clos help"
    echo ""
}

# Run main function
main "$@"