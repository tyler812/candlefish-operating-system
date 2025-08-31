# Core Infrastructure Outputs
output "project_name" {
  description = "Name of the project"
  value       = var.project_name
}

output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

output "account_id" {
  description = "AWS Account ID"
  value       = data.aws_caller_identity.current.account_id
}

# VPC and Networking Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "nat_gateway_ips" {
  description = "Elastic IPs of the NAT Gateways"
  value       = aws_eip.nat[*].public_ip
}

# Load Balancer Outputs
output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer"
  value       = aws_lb.main.zone_id
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = aws_lb.main.arn
}

# ECS Outputs
output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

output "core_api_service_name" {
  description = "Name of the Core API ECS service"
  value       = aws_ecs_service.core_api.name
}

output "workflow_engine_service_name" {
  description = "Name of the Workflow Engine ECS service"
  value       = aws_ecs_service.workflow_engine.name
}

# Database Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_rds_cluster.main.endpoint
  sensitive   = true
}

output "rds_reader_endpoint" {
  description = "RDS cluster reader endpoint"
  value       = aws_rds_cluster.main.reader_endpoint
  sensitive   = true
}

output "rds_database_name" {
  description = "RDS database name"
  value       = aws_rds_cluster.main.database_name
}

output "rds_port" {
  description = "RDS instance port"
  value       = aws_rds_cluster.main.port
}

# DynamoDB Outputs
output "dynamodb_metrics_table_name" {
  description = "Name of the DynamoDB metrics table"
  value       = aws_dynamodb_table.real_time_metrics.name
}

output "dynamodb_metrics_table_arn" {
  description = "ARN of the DynamoDB metrics table"
  value       = aws_dynamodb_table.real_time_metrics.arn
}

output "dynamodb_sessions_table_name" {
  description = "Name of the DynamoDB sessions table"
  value       = aws_dynamodb_table.user_sessions.name
}

output "dynamodb_events_table_name" {
  description = "Name of the DynamoDB events table"
  value       = aws_dynamodb_table.event_stream.name
}

# EventBridge Outputs
output "eventbridge_bus_name" {
  description = "Name of the custom EventBridge bus"
  value       = aws_cloudwatch_event_bus.main.name
}

output "eventbridge_bus_arn" {
  description = "ARN of the custom EventBridge bus"
  value       = aws_cloudwatch_event_bus.main.arn
}

# SQS Outputs
output "async_processing_queue_url" {
  description = "URL of the async processing SQS queue"
  value       = aws_sqs_queue.async_processing.url
}

output "async_processing_queue_arn" {
  description = "ARN of the async processing SQS queue"
  value       = aws_sqs_queue.async_processing.arn
}

output "stage_gate_queue_url" {
  description = "URL of the stage gate SQS queue"
  value       = aws_sqs_queue.stage_gate.url
}

output "wip_limit_queue_url" {
  description = "URL of the WIP limit SQS queue"
  value       = aws_sqs_queue.wip_limit.url
}

# Lambda Outputs
output "stage_gate_lambda_arn" {
  description = "ARN of the Stage Gate Lambda function"
  value       = aws_lambda_function.stage_gate_processor.arn
}

output "wip_limit_lambda_arn" {
  description = "ARN of the WIP Limit Lambda function"
  value       = aws_lambda_function.wip_limit_processor.arn
}

output "github_webhook_lambda_arn" {
  description = "ARN of the GitHub webhook Lambda function"
  value       = aws_lambda_function.github_webhook.arn
}

output "daily_unblock_lambda_arn" {
  description = "ARN of the Daily Unblock Lambda function"
  value       = aws_lambda_function.daily_unblock.arn
}

# S3 Outputs
output "artifacts_bucket_name" {
  description = "Name of the S3 artifacts bucket"
  value       = aws_s3_bucket.artifacts.bucket
}

output "artifacts_bucket_arn" {
  description = "ARN of the S3 artifacts bucket"
  value       = aws_s3_bucket.artifacts.arn
}

# Secrets Manager Outputs
output "db_credentials_secret_arn" {
  description = "ARN of the database credentials secret"
  value       = aws_secretsmanager_secret.db_credentials.arn
  sensitive   = true
}

output "api_keys_secret_arn" {
  description = "ARN of the API keys secret"
  value       = aws_secretsmanager_secret.api_keys.arn
  sensitive   = true
}

# KMS Outputs
output "kms_key_id" {
  description = "ID of the KMS key"
  value       = aws_kms_key.clos.key_id
}

output "kms_key_arn" {
  description = "ARN of the KMS key"
  value       = aws_kms_key.clos.arn
}

# CloudWatch Outputs
output "log_group_names" {
  description = "Names of CloudWatch log groups"
  value = {
    core_api        = aws_cloudwatch_log_group.core_api.name
    workflow_engine = aws_cloudwatch_log_group.workflow_engine.name
    lambda_logs     = aws_cloudwatch_log_group.lambda_logs.name
  }
}

output "cloudwatch_dashboard_url" {
  description = "URL of the CloudWatch dashboard"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}

# SNS Outputs
output "alerts_topic_arn" {
  description = "ARN of the alerts SNS topic"
  value       = aws_sns_topic.alerts.arn
}

# Application URLs (when domain is configured)
output "api_base_url" {
  description = "Base URL for the API"
  value       = var.domain_name != "" ? "https://api.${var.domain_name}" : "https://${aws_lb.main.dns_name}"
}

output "dashboard_url" {
  description = "URL for the dashboard (to be deployed on Vercel)"
  value       = var.domain_name != "" ? "https://dashboard.${var.domain_name}" : "https://dashboard.clos.candlefish.ai"
}

# Security Group IDs
output "alb_security_group_id" {
  description = "ID of the ALB security group"
  value       = aws_security_group.alb.id
}

output "ecs_security_group_id" {
  description = "ID of the ECS security group"
  value       = aws_security_group.ecs_tasks.id
}

output "rds_security_group_id" {
  description = "ID of the RDS security group"
  value       = aws_security_group.rds.id
}

# IAM Role ARNs
output "ecs_task_execution_role_arn" {
  description = "ARN of the ECS task execution role"
  value       = aws_iam_role.ecs_task_execution_role.arn
}

output "ecs_task_role_arn" {
  description = "ARN of the ECS task role"
  value       = aws_iam_role.ecs_task_role.arn
}

output "lambda_execution_role_arn" {
  description = "ARN of the Lambda execution role"
  value       = aws_iam_role.lambda_execution_role.arn
}

# Cost Optimization Outputs
output "estimated_monthly_cost" {
  description = "Estimated monthly cost breakdown"
  value = {
    ecs_fargate    = "~$${200 * var.desired_count / 2}"
    rds_cluster    = "~$150"
    dynamodb       = "~$50"
    eventbridge    = "~$20"
    lambda         = "~$30"
    s3_storage     = "~$10"
    data_transfer  = "~$20"
    cloudwatch     = "~$15"
    total_estimate = "~$${495 + (200 * var.desired_count / 2)}"
  }
}

# Environment-specific outputs
output "environment_config" {
  description = "Environment-specific configuration"
  value = {
    environment           = var.environment
    multi_az_enabled     = var.enable_multi_az
    backup_retention     = var.backup_retention_period
    monitoring_enabled   = var.enable_monitoring
    encryption_enabled   = var.enable_encryption
    waf_enabled         = var.enable_waf
  }
}

# Quick Start Information
output "quick_start_info" {
  description = "Quick start information for deployment"
  value = {
    next_steps = [
      "1. Note down the database endpoint and update your application configuration",
      "2. Deploy your Docker images to ECR",
      "3. Update ECS task definitions with your image URIs",
      "4. Configure DNS records if using custom domain",
      "5. Deploy your frontend to Vercel with the API endpoint",
      "6. Test the complete infrastructure"
    ]
    important_arns = {
      secrets_manager = {
        db_credentials = aws_secretsmanager_secret.db_credentials.arn
        api_keys      = aws_secretsmanager_secret.api_keys.arn
      }
      kms_key = aws_kms_key.clos.arn
      eventbus = aws_cloudwatch_event_bus.main.arn
    }
  }
}