# Candlefish Operating System v2.0 - Terraform Infrastructure

This directory contains the complete production-ready Terraform configuration for deploying the Candlefish Operating System v2.0 infrastructure on AWS.

## Architecture Overview

The infrastructure includes:

- **Compute**: ECS Fargate cluster running Core API and Workflow Engine services
- **Database**: RDS Aurora PostgreSQL cluster with Multi-AZ support
- **Storage**: DynamoDB tables for real-time metrics and session data
- **Events**: EventBridge custom bus with SQS queues for event processing
- **Functions**: Lambda functions for stage gates, WIP limits, and automation
- **Networking**: VPC with public/private subnets, NAT gateways, and load balancer
- **Monitoring**: CloudWatch dashboards, alarms, and Synthetics health checks
- **Security**: KMS encryption, Secrets Manager, WAF, and IAM roles

## Quick Start

### Prerequisites

1. **AWS CLI configured** with appropriate permissions
2. **Terraform >= 1.5** installed
3. **Make** installed (optional, for using Makefile commands)

### Initial Setup

1. **Create the Terraform state infrastructure** (one-time setup):
   ```bash
   make create-state-bucket
   ```

2. **Copy and customize the variables file**:
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your specific values
   ```

3. **Deploy the infrastructure**:
   ```bash
   make deploy-full
   ```

### Manual Deployment

If you prefer not to use the Makefile:

```bash
# Initialize Terraform
terraform init

# Review the plan
terraform plan -var-file=terraform.tfvars

# Apply the changes
terraform apply -var-file=terraform.tfvars
```

## File Structure

```
.
├── main.tf              # Core provider config and shared resources
├── variables.tf         # Input variables with validation
├── outputs.tf          # Resource outputs and connection info
├── networking.tf       # VPC, subnets, security groups, load balancer
├── database.tf         # RDS Aurora and DynamoDB tables
├── ecs.tf             # ECS cluster, services, and auto-scaling
├── events.tf          # EventBridge, SQS, Lambda functions
├── monitoring.tf      # CloudWatch dashboards, alarms, Synthetics
├── terraform.tfvars.example  # Example configuration file
├── Makefile           # Deployment automation commands
├── lambda/            # Lambda function source code
│   ├── db-init.py
│   ├── stage-gate-processor.py
│   ├── wip-limit-processor.py
│   ├── github-webhook.py
│   └── daily-unblock.py
└── synthetics/        # CloudWatch Synthetics scripts
    └── api-health-check.js
```

## Configuration

### Essential Variables

Edit `terraform.tfvars` with your specific values:

```hcl
# Core Configuration
project_name = "clos-v2"
environment  = "prod"
aws_region   = "us-east-1"
owner_email  = "your-email@example.com"

# Database
db_username = "clos_admin"
enable_multi_az = true

# API Keys (store securely)
github_token = "your_github_token"
slack_token = "your_slack_token"
auth0_client_secret = "your_auth0_secret"

# Domain (optional)
domain_name = "your-domain.com"
```

### Environment-Specific Settings

**Production**:
```hcl
environment = "prod"
enable_multi_az = true
backup_retention_period = 14
db_instance_class = "db.r5.large"
desired_count = 3
enable_encryption = true
enable_waf = true
```

**Development**:
```hcl
environment = "dev"
enable_multi_az = false
backup_retention_period = 1
db_instance_class = "db.t3.micro"
desired_count = 1
enable_auto_shutdown = true
```

## Deployment Workflow

### 1. Infrastructure Deployment

```bash
# Deploy core infrastructure
make deploy-full

# Check outputs
make output
```

### 2. Application Deployment

After infrastructure is deployed:

```bash
# Build Docker images
make build-images

# Push to ECR
make push-images

# Update ECS services with new images
aws ecs update-service --cluster clos-v2-cluster --service clos-v2-core-api-service --force-new-deployment
```

### 3. DNS Configuration

If using a custom domain:

1. Create DNS records pointing to the ALB:
   ```
   api.your-domain.com -> ALB DNS Name
   ```

2. Update certificate validation records if using ACM.

### 4. Verification

```bash
# Check API health
make health-check

# View logs
make logs-core-api

# Open monitoring dashboard
make dashboard
```

## Monitoring & Operations

### CloudWatch Dashboard

The deployment creates a comprehensive CloudWatch dashboard with:

- ECS service metrics (CPU, memory, task count)
- Load balancer metrics (response time, error rates)
- Database metrics (connections, latency)
- Lambda function metrics (duration, errors)
- SQS queue metrics (message counts)

Access via: `make dashboard`

### Alarms and Notifications

Automated alerts for:

- High CPU/memory usage
- Elevated error rates
- Database connection issues
- Lambda function failures
- SQS queue backlog
- WIP limit violations

Configure `alert_email` in `terraform.tfvars` to receive notifications.

### Log Analysis

Use CloudWatch Insights queries for troubleshooting:

```bash
# View application errors
make logs-core-api

# Check Lambda function logs
make logs-lambda
```

### Health Monitoring

Synthetics canaries automatically test:

- API health endpoint
- Stage gate functionality
- WIP limit enforcement

## Security

### Encryption

- **At Rest**: KMS encryption for RDS, DynamoDB, S3, and CloudWatch Logs
- **In Transit**: TLS 1.2+ for all API communication
- **Secrets**: AWS Secrets Manager with automatic rotation capability

### Network Security

- **VPC**: Isolated network environment with private subnets
- **Security Groups**: Principle of least privilege access
- **WAF**: Web Application Firewall protecting the ALB
- **NACLs**: Network-level access control lists

### Access Control

- **IAM**: Least privilege roles for all services
- **MFA**: Recommended for administrative access
- **Audit**: CloudTrail logging enabled by default

### Secret Management

Store sensitive values in AWS Secrets Manager:

```bash
# Update API keys
aws secretsmanager update-secret --secret-id clos-v2/api-keys --secret-string '{
  "github_token": "new_token",
  "slack_token": "new_token",
  "auth0_secret": "new_secret"
}'
```

## Cost Optimization

### Estimated Monthly Costs (us-east-1)

| Service | Configuration | Est. Cost |
|---------|--------------|-----------|
| ECS Fargate | 2 services, 2 tasks each | ~$200 |
| RDS Aurora | db.t3.medium, Multi-AZ | ~$150 |
| DynamoDB | Pay-per-request | ~$50 |
| EventBridge | 1M events/month | ~$20 |
| Lambda | 1M executions | ~$30 |
| Load Balancer | Application LB | ~$25 |
| NAT Gateway | 3 AZs | ~$90 |
| Data Transfer | Typical usage | ~$20 |
| CloudWatch | Logs & metrics | ~$15 |
| **Total** | | **~$600/month** |

### Cost Reduction Tips

1. **Use Reserved Instances** for production RDS
2. **Enable auto-scaling** to reduce over-provisioning
3. **Use VPC endpoints** to minimize data transfer costs
4. **Implement lifecycle policies** for S3 storage
5. **Monitor with AWS Cost Explorer** and set up billing alerts

```bash
# Check current cost estimate
make cost-estimate
```

## Disaster Recovery

### Backup Strategy

- **RDS**: Automated daily backups with point-in-time recovery
- **DynamoDB**: Point-in-time recovery enabled
- **Cross-region**: Optional cross-region backup for critical data

### Recovery Procedures

1. **Database Recovery**:
   ```bash
   aws rds restore-db-cluster-to-point-in-time \
     --source-db-cluster-identifier clos-v2-db-cluster \
     --db-cluster-identifier clos-v2-db-cluster-restored \
     --restore-to-time 2024-01-01T12:00:00.000Z
   ```

2. **Application Recovery**:
   ```bash
   # Scale up to previous capacity
   make emergency-scale-up
   ```

3. **State Recovery**:
   ```bash
   # Restore Terraform state from backup
   make backup-state
   ```

## Troubleshooting

### Common Issues

**1. ECS Tasks Not Starting**

Check logs and task definition:
```bash
make logs-core-api
aws ecs describe-services --cluster clos-v2-cluster --services clos-v2-core-api-service
```

**2. Database Connection Failures**

Verify security groups and network connectivity:
```bash
aws rds describe-db-clusters --db-cluster-identifier clos-v2-db-cluster
```

**3. Lambda Function Timeouts**

Check function configuration and VPC settings:
```bash
aws logs tail /aws/lambda/clos-v2-stage-gate-processor --follow
```

**4. High Costs**

Monitor resource utilization:
```bash
make cost-estimate
aws ce get-cost-and-usage --time-period Start=2024-01-01,End=2024-01-31 --granularity MONTHLY --metrics BlendedCost
```

### Emergency Procedures

**Scale Down for Cost Savings**:
```bash
make emergency-scale-down
```

**Scale Up for High Load**:
```bash
make emergency-scale-up
```

**Complete Teardown** (⚠️ DESTRUCTIVE):
```bash
make destroy
```

## Development & Testing

### Local Development

For local development, use the development configuration:

```bash
make dev-setup
# Edit terraform.tfvars.dev
terraform workspace new dev
terraform apply -var-file=terraform.tfvars.dev
```

### Testing Infrastructure

Use Terraform's testing capabilities:

```bash
# Validate configuration
make validate

# Check formatting
make format

# Plan without applying
make plan
```

## Support & Maintenance

### Regular Maintenance Tasks

1. **Monthly**:
   - Review CloudWatch costs and usage
   - Rotate API keys and secrets
   - Review security group rules
   - Update container images

2. **Quarterly**:
   - Review and update Terraform modules
   - Audit IAM permissions
   - Test disaster recovery procedures
   - Review monitoring and alerting

3. **Annually**:
   - Security audit and penetration testing
   - Architecture review and optimization
   - Cost optimization review
   - Documentation updates

### Getting Help

1. Check the [troubleshooting section](#troubleshooting)
2. Review AWS service health dashboards
3. Check Terraform documentation for specific resources
4. Contact the infrastructure team with specific error messages and logs

## Contributing

When modifying the infrastructure:

1. **Follow naming conventions**: Use `${var.project_name}-resource-type` format
2. **Add proper tagging**: Include environment, owner, and purpose tags
3. **Document changes**: Update this README and add comments to complex resources
4. **Test thoroughly**: Use development environment before applying to production
5. **Follow security best practices**: Encrypt data, use least privilege access

## License

This infrastructure configuration is part of the Candlefish Operating System project.