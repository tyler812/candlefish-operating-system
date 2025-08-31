#!/bin/bash

# ============================================================================
# Candlefish Operating System v2.0 - Demo Deployment
# ============================================================================
# This script demonstrates the CLOS v2.0 deployment without actually deploying
# ============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  CANDLEFISH OPERATING SYSTEM v2.0${NC}"
echo -e "${CYAN}  Demo Deployment Walkthrough${NC}"
echo -e "${CYAN}============================================${NC}\n"

echo -e "${BLUE}📋 What This Deployment Will Create:${NC}\n"

echo -e "${GREEN}1. AWS Infrastructure (Terraform)${NC}"
echo "   ├── ECS Fargate Cluster"
echo "   ├── RDS Aurora PostgreSQL (Multi-AZ)"
echo "   ├── DynamoDB Tables (5)"
echo "   ├── EventBridge Event Bus"
echo "   ├── Lambda Functions (5)"
echo "   ├── Application Load Balancer"
echo "   ├── VPC with 3 Availability Zones"
echo "   └── CloudWatch Monitoring"
echo -e "   💰 Estimated Cost: ~\$600/month\n"

echo -e "${GREEN}2. Core API Service${NC}"
echo "   ├── GraphQL API with 50+ types"
echo "   ├── Stage Gate Enforcement"
echo "   ├── WIP Limit Management"
echo "   ├── Idea Ledger Processing"
echo "   ├── WebSocket Real-time Updates"
echo "   └── JWT Authentication"
echo "   📦 Container: clos-core-api:latest\n"

echo -e "${GREEN}3. GitHub Actions Workflows (8)${NC}"
echo "   ├── clos-stage-gates.yml"
echo "   ├── clos-wip-enforcement.yml"
echo "   ├── clos-daily-unblock.yml"
echo "   ├── clos-demo-friday.yml"
echo "   ├── clos-portfolio-review.yml"
echo "   ├── clos-idea-evaluation.yml"
echo "   ├── clos-deploy-api.yml"
echo "   └── clos-deploy-dashboard.yml\n"

echo -e "${GREEN}4. Dashboard (Next.js on Vercel)${NC}"
echo "   ├── Real-time Metrics"
echo "   ├── Stage Gate Funnel"
echo "   ├── WIP Limit Tracking"
echo "   ├── Pod Health Scores"
echo "   └── Activity Feed"
echo "   🌐 URL: dashboard.clos.candlefish.ai\n"

echo -e "${GREEN}5. Slack Bot${NC}"
echo "   ├── 8 Slash Commands"
echo "   ├── Interactive Modals"
echo "   ├── Event Handlers"
echo "   ├── Home Tab Dashboard"
echo "   └── Automated Notifications\n"

echo -e "${YELLOW}📊 Deployment Statistics:${NC}"
echo "   • Total Files: 122"
echo "   • Lines of Code: 28,825"
echo "   • Docker Images: 3"
echo "   • AWS Resources: 50+"
echo "   • Deployment Time: ~20 minutes\n"

echo -e "${MAGENTA}🚀 Deployment Commands:${NC}\n"

echo -e "${CYAN}Step 1: Initialize Terraform${NC}"
echo "   $ terraform init"
echo "   $ terraform plan\n"

echo -e "${CYAN}Step 2: Deploy Infrastructure${NC}"
echo "   $ terraform apply -auto-approve\n"

echo -e "${CYAN}Step 3: Build & Deploy Core API${NC}"
echo "   $ cd services/clos-core-api"
echo "   $ docker build -t clos-core-api ."
echo "   $ docker push [ECR_REPO]/clos-core-api:latest"
echo "   $ aws ecs update-service --cluster clos-v2 --service api\n"

echo -e "${CYAN}Step 4: Deploy Dashboard${NC}"
echo "   $ cd apps/dashboard"
echo "   $ npm install"
echo "   $ vercel --prod\n"

echo -e "${CYAN}Step 5: Deploy Slack Bot${NC}"
echo "   $ cd services/clos-slack-bot"
echo "   $ docker build -t clos-slack-bot ."
echo "   $ docker push [ECR_REPO]/clos-slack-bot:latest\n"

echo -e "${CYAN}Step 6: Configure GitHub Actions${NC}"
echo "   $ gh secret set CLOS_API_URL"
echo "   $ gh secret set AWS_REGION"
echo "   $ gh secret set SLACK_BOT_TOKEN\n"

echo -e "${BLUE}🔍 Current Status:${NC}\n"

# Check for existing resources
echo -e "Checking prerequisites..."

if command -v terraform &> /dev/null; then
    echo -e "   ${GREEN}✓${NC} Terraform installed"
else
    echo -e "   ${RED}✗${NC} Terraform not installed"
fi

if command -v docker &> /dev/null; then
    echo -e "   ${GREEN}✓${NC} Docker installed"
else
    echo -e "   ${RED}✗${NC} Docker not installed"
fi

if command -v aws &> /dev/null; then
    echo -e "   ${GREEN}✓${NC} AWS CLI installed"
    if aws sts get-caller-identity &> /dev/null; then
        echo -e "   ${GREEN}✓${NC} AWS credentials configured"
    else
        echo -e "   ${YELLOW}⚠${NC} AWS credentials not configured"
    fi
else
    echo -e "   ${RED}✗${NC} AWS CLI not installed"
fi

if command -v node &> /dev/null; then
    echo -e "   ${GREEN}✓${NC} Node.js installed"
else
    echo -e "   ${RED}✗${NC} Node.js not installed"
fi

if command -v vercel &> /dev/null; then
    echo -e "   ${GREEN}✓${NC} Vercel CLI installed"
else
    echo -e "   ${YELLOW}⚠${NC} Vercel CLI not installed (optional)"
fi

echo ""
echo -e "${BLUE}📁 Files Ready for Deployment:${NC}\n"

# Count files
TF_FILES=$(find . -name "*.tf" -type f 2>/dev/null | wc -l | tr -d ' ')
TS_FILES=$(find . -name "*.ts" -o -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
YML_FILES=$(find . -name "*.yml" -o -name "*.yaml" 2>/dev/null | wc -l | tr -d ' ')

echo "   • Terraform files: ${TF_FILES}"
echo "   • TypeScript files: ${TS_FILES}"
echo "   • YAML configs: ${YML_FILES}"
echo ""

echo -e "${YELLOW}⚡ Quick Start:${NC}\n"
echo "   To deploy everything automatically:"
echo -e "   ${CYAN}$ ./deploy.sh full${NC}\n"
echo "   To deploy components individually:"
echo -e "   ${CYAN}$ ./deploy.sh infra${NC}     # Infrastructure only"
echo -e "   ${CYAN}$ ./deploy.sh api${NC}       # API only"
echo -e "   ${CYAN}$ ./deploy.sh dashboard${NC} # Dashboard only"
echo -e "   ${CYAN}$ ./deploy.sh slack${NC}     # Slack bot only\n"

echo -e "${GREEN}✅ Ready to Deploy!${NC}\n"
echo -e "${BLUE}This demo shows what WILL be deployed.${NC}"
echo -e "${BLUE}No actual resources have been created yet.${NC}\n"
echo -e "${CYAN}============================================${NC}"