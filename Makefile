# Candlefish Operating System v2.0 - Terraform Makefile
# Simplifies common Terraform operations

.PHONY: help init plan apply destroy validate format check-vars build-images push-images deploy-full clean

# Default environment
ENV ?= prod

# Variables
TF_VAR_FILE = terraform.tfvars
STATE_BUCKET = candlefish-terraform-state
STATE_KEY = clos-v2/terraform.tfstate
AWS_REGION = us-east-1

help: ## Show this help message
	@echo "Candlefish Operating System v2.0 - Terraform Commands"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

init: ## Initialize Terraform backend and providers
	@echo "🔧 Initializing Terraform..."
	terraform init \
		-backend-config="bucket=$(STATE_BUCKET)" \
		-backend-config="key=$(STATE_KEY)" \
		-backend-config="region=$(AWS_REGION)"

check-vars: ## Validate that required variables file exists
	@if [ ! -f $(TF_VAR_FILE) ]; then \
		echo "❌ Error: $(TF_VAR_FILE) not found. Copy terraform.tfvars.example to $(TF_VAR_FILE) and customize it."; \
		exit 1; \
	fi
	@echo "✅ Variables file found: $(TF_VAR_FILE)"

validate: check-vars ## Validate Terraform configuration
	@echo "🔍 Validating Terraform configuration..."
	terraform validate

format: ## Format Terraform files
	@echo "🎨 Formatting Terraform files..."
	terraform fmt -recursive

plan: check-vars validate ## Show what Terraform will do
	@echo "📋 Planning Terraform changes..."
	terraform plan -var-file=$(TF_VAR_FILE) -out=tfplan

apply: check-vars validate ## Apply Terraform changes
	@echo "🚀 Applying Terraform changes..."
	terraform apply -var-file=$(TF_VAR_FILE) -auto-approve

apply-plan: ## Apply the saved plan
	@echo "🚀 Applying saved Terraform plan..."
	terraform apply tfplan

destroy: check-vars ## Destroy all Terraform resources (DANGEROUS!)
	@echo "💥 WARNING: This will destroy ALL resources!"
	@read -p "Are you sure? Type 'yes' to continue: " confirm && [ "$$confirm" = "yes" ]
	terraform destroy -var-file=$(TF_VAR_FILE)

output: ## Show Terraform outputs
	@echo "📤 Terraform outputs:"
	terraform output

output-json: ## Show Terraform outputs in JSON format
	terraform output -json

# Docker and ECR commands
build-images: ## Build Docker images for Core API and Workflow Engine
	@echo "🐳 Building Docker images..."
	@if [ -d "../services/core-api" ]; then \
		cd ../services/core-api && docker build -t clos-core-api:latest .; \
	else \
		echo "⚠️  Core API directory not found, skipping..."; \
	fi
	@if [ -d "../services/workflow-engine" ]; then \
		cd ../services/workflow-engine && docker build -t clos-workflow-engine:latest .; \
	else \
		echo "⚠️  Workflow Engine directory not found, skipping..."; \
	fi

push-images: ## Push Docker images to ECR
	@echo "📦 Pushing images to ECR..."
	@ECR_URI=$$(terraform output -raw ecr_core_api_repository_url 2>/dev/null) && \
	if [ ! -z "$$ECR_URI" ]; then \
		aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $$ECR_URI && \
		docker tag clos-core-api:latest $$ECR_URI:latest && \
		docker push $$ECR_URI:latest; \
	else \
		echo "❌ ECR repository URL not found. Run 'make apply' first."; \
	fi

# Deployment helpers
create-state-bucket: ## Create S3 bucket for Terraform state (one-time setup)
	@echo "🪣 Creating Terraform state bucket..."
	aws s3api create-bucket --bucket $(STATE_BUCKET) --region $(AWS_REGION) || true
	aws s3api put-bucket-versioning --bucket $(STATE_BUCKET) --versioning-configuration Status=Enabled
	aws dynamodb create-table \
		--table-name candlefish-terraform-locks \
		--attribute-definitions AttributeName=LockID,AttributeType=S \
		--key-schema AttributeName=LockID,KeyType=HASH \
		--provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
		--region $(AWS_REGION) || true
	@echo "✅ State bucket and lock table created"

deploy-full: init plan apply ## Full deployment: init, plan, and apply
	@echo "🎉 Full deployment completed!"
	@echo ""
	@echo "Next steps:"
	@echo "1. Build and push your Docker images: make build-images push-images"
	@echo "2. Update ECS task definitions with new image URIs"
	@echo "3. Configure DNS records if using custom domain"
	@echo "4. Test API endpoints"

# Monitoring and debugging
logs-core-api: ## View Core API logs
	@CLUSTER_NAME=$$(terraform output -raw ecs_cluster_name 2>/dev/null) && \
	SERVICE_NAME=$$(terraform output -raw core_api_service_name 2>/dev/null) && \
	if [ ! -z "$$CLUSTER_NAME" ] && [ ! -z "$$SERVICE_NAME" ]; then \
		aws logs tail /aws/ecs/clos-v2-core-api --follow --region $(AWS_REGION); \
	else \
		echo "❌ Service not found. Make sure infrastructure is deployed."; \
	fi

logs-workflow: ## View Workflow Engine logs
	@aws logs tail /aws/ecs/clos-v2-workflow-engine --follow --region $(AWS_REGION)

logs-lambda: ## View Lambda function logs
	@echo "Available Lambda log groups:"
	@aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/clos-v2" --region $(AWS_REGION) --query 'logGroups[].logGroupName' --output text

dashboard: ## Open CloudWatch dashboard
	@DASHBOARD_URL=$$(terraform output -raw cloudwatch_dashboard_url 2>/dev/null) && \
	if [ ! -z "$$DASHBOARD_URL" ]; then \
		echo "🔗 Opening CloudWatch Dashboard: $$DASHBOARD_URL"; \
		open "$$DASHBOARD_URL" || echo "Dashboard URL: $$DASHBOARD_URL"; \
	else \
		echo "❌ Dashboard URL not found. Make sure infrastructure is deployed."; \
	fi

health-check: ## Check API health endpoint
	@ALB_DNS=$$(terraform output -raw alb_dns_name 2>/dev/null) && \
	if [ ! -z "$$ALB_DNS" ]; then \
		echo "🔍 Checking API health..."; \
		curl -f "https://$$ALB_DNS/health" || curl -f "http://$$ALB_DNS/health"; \
	else \
		echo "❌ ALB DNS not found. Make sure infrastructure is deployed."; \
	fi

# Maintenance
clean: ## Clean temporary Terraform files
	@echo "🧹 Cleaning temporary files..."
	rm -f tfplan
	rm -f *.zip
	rm -rf .terraform/

backup-state: ## Backup Terraform state file
	@echo "💾 Backing up Terraform state..."
	@TIMESTAMP=$$(date +%Y%m%d_%H%M%S) && \
	aws s3 cp s3://$(STATE_BUCKET)/$(STATE_KEY) terraform.tfstate.backup.$$TIMESTAMP --region $(AWS_REGION) && \
	echo "✅ State backed up as terraform.tfstate.backup.$$TIMESTAMP"

# Database operations
db-migrate: ## Run database migrations (requires database to be accessible)
	@echo "🔄 Running database migrations..."
	@RDS_ENDPOINT=$$(terraform output -raw rds_endpoint 2>/dev/null) && \
	SECRET_ARN=$$(terraform output -raw db_credentials_secret_arn 2>/dev/null) && \
	if [ ! -z "$$RDS_ENDPOINT" ] && [ ! -z "$$SECRET_ARN" ]; then \
		echo "Database endpoint: $$RDS_ENDPOINT"; \
		echo "Credentials secret: $$SECRET_ARN"; \
		echo "Run your migration scripts here..."; \
	else \
		echo "❌ Database info not found. Make sure infrastructure is deployed."; \
	fi

# Security
rotate-secrets: ## Rotate database passwords and API keys
	@echo "🔐 Rotating secrets..."
	@echo "This should be implemented based on your security requirements"
	@echo "Consider using AWS Secrets Manager automatic rotation"

# Cost monitoring
cost-estimate: ## Show estimated monthly costs
	@terraform output -json estimated_monthly_cost 2>/dev/null | jq -r 'to_entries[] | "\(.key): \(.value)"' || \
	echo "❌ Cost estimate not available. Run 'make apply' first."

# Development helpers
dev-setup: ## Setup for development environment
	@echo "🛠️  Setting up development environment..."
	@cp terraform.tfvars.example terraform.tfvars.dev
	@echo "✅ Created terraform.tfvars.dev - customize it for development"

prod-check: ## Pre-production checklist
	@echo "🔍 Pre-production checklist:"
	@echo "✓ Backup retention period >= 7 days"
	@echo "✓ Multi-AZ enabled for RDS"
	@echo "✓ Encryption enabled"
	@echo "✓ WAF enabled"
	@echo "✓ Monitoring enabled"
	@echo "✓ SSL certificate configured"
	@echo "✓ Secrets rotated recently"
	@echo "✓ Cost alerts configured"
	@echo ""
	@echo "Review your terraform.tfvars file and ensure all production settings are correct."

# Emergency procedures
emergency-scale-down: ## Emergency scale down to minimum resources
	@echo "🚨 Emergency scale down..."
	terraform apply -var="desired_count=1" -var="max_capacity=2" -auto-approve

emergency-scale-up: ## Emergency scale up for high load
	@echo "🚀 Emergency scale up..."
	terraform apply -var="desired_count=4" -var="max_capacity=10" -auto-approve