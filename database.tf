# RDS Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

# RDS Parameter Group
resource "aws_rds_cluster_parameter_group" "main" {
  family = "aurora-postgresql15"
  name   = "${var.project_name}-cluster-pg"

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,auto_explain"
  }

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "auto_explain.log_min_duration"
    value = "1000"
  }

  parameter {
    name  = "auto_explain.log_analyze"
    value = "1"
  }

  tags = {
    Name = "${var.project_name}-cluster-parameter-group"
  }
}

# RDS Aurora Cluster
resource "aws_rds_cluster" "main" {
  cluster_identifier      = "${var.project_name}-db-cluster"
  engine                 = "aurora-postgresql"
  engine_version         = "15.4"
  database_name          = "clos"
  master_username        = var.db_username
  manage_master_user_password = true
  master_user_secret_kms_key_id = aws_kms_key.clos.arn
  
  backup_retention_period   = var.backup_retention_period
  preferred_backup_window   = "03:00-04:00"
  preferred_maintenance_window = "sun:04:00-sun:05:00"
  
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.main.name
  db_subnet_group_name           = aws_db_subnet_group.main.name
  vpc_security_group_ids         = [aws_security_group.rds.id]
  
  storage_encrypted   = var.enable_encryption
  kms_key_id         = var.enable_encryption ? aws_kms_key.clos.arn : null
  
  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${var.project_name}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null
  
  enabled_cloudwatch_logs_exports = ["postgresql"]
  
  # Enable backtrack for Aurora MySQL (not available for PostgreSQL)
  # backtrack_window = 72
  
  copy_tags_to_snapshot = true
  deletion_protection   = var.environment == "prod"
  
  tags = {
    Name = "${var.project_name}-db-cluster"
  }

  depends_on = [
    aws_cloudwatch_log_group.rds
  ]
}

# RDS Cluster Instances
resource "aws_rds_cluster_instance" "cluster_instances" {
  count              = var.enable_multi_az ? 2 : 1
  identifier         = "${var.project_name}-db-${count.index}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = var.db_instance_class
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
  
  performance_insights_enabled = true
  performance_insights_kms_key_id = aws_kms_key.clos.arn
  performance_insights_retention_period = 7
  
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_enhanced_monitoring.arn
  
  copy_tags_to_snapshot = true
  
  tags = {
    Name = "${var.project_name}-db-instance-${count.index}"
  }
}

# IAM Role for RDS Enhanced Monitoring
resource "aws_iam_role" "rds_enhanced_monitoring" {
  name = "${var.project_name}-rds-enhanced-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "rds_enhanced_monitoring" {
  role       = aws_iam_role.rds_enhanced_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# CloudWatch Log Group for RDS
resource "aws_cloudwatch_log_group" "rds" {
  name              = "/aws/rds/cluster/${var.project_name}-db-cluster/postgresql"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.clos.arn

  tags = {
    Name = "${var.project_name}-rds-logs"
  }
}

# DynamoDB Tables

# Real-time Metrics Table
resource "aws_dynamodb_table" "real_time_metrics" {
  name           = "${var.project_name}-real-time-metrics"
  billing_mode   = var.dynamodb_billing_mode
  hash_key       = "pod_id"
  range_key      = "timestamp"
  
  # Only set capacity if using PROVISIONED billing
  read_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_read_capacity : null
  write_capacity = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_write_capacity : null
  
  attribute {
    name = "pod_id"
    type = "S"
  }
  
  attribute {
    name = "timestamp"
    type = "N"
  }
  
  attribute {
    name = "metric_type"
    type = "S"
  }
  
  # Global Secondary Index for querying by metric type
  global_secondary_index {
    name     = "MetricTypeIndex"
    hash_key = "metric_type"
    range_key = "timestamp"
    
    read_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? 5 : null
    write_capacity = var.dynamodb_billing_mode == "PROVISIONED" ? 5 : null
    
    projection_type = "ALL"
  }
  
  # TTL for automatic cleanup
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
  
  # Point-in-time recovery
  point_in_time_recovery {
    enabled = var.enable_backup
  }
  
  # Server-side encryption
  server_side_encryption {
    enabled     = var.enable_encryption
    kms_key_arn = var.enable_encryption ? aws_kms_key.clos.arn : null
  }
  
  # DynamoDB Streams for real-time processing
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"
  
  tags = {
    Name = "${var.project_name}-real-time-metrics"
  }
}

# User Sessions Table
resource "aws_dynamodb_table" "user_sessions" {
  name           = "${var.project_name}-user-sessions"
  billing_mode   = var.dynamodb_billing_mode
  hash_key       = "user_id"
  range_key      = "session_id"
  
  read_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_read_capacity : null
  write_capacity = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_write_capacity : null
  
  attribute {
    name = "user_id"
    type = "S"
  }
  
  attribute {
    name = "session_id"
    type = "S"
  }
  
  # TTL for session expiration
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
  
  point_in_time_recovery {
    enabled = var.enable_backup
  }
  
  server_side_encryption {
    enabled     = var.enable_encryption
    kms_key_arn = var.enable_encryption ? aws_kms_key.clos.arn : null
  }
  
  tags = {
    Name = "${var.project_name}-user-sessions"
  }
}

# Event Stream Table
resource "aws_dynamodb_table" "event_stream" {
  name           = "${var.project_name}-event-stream"
  billing_mode   = var.dynamodb_billing_mode
  hash_key       = "event_type"
  range_key      = "timestamp"
  
  read_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_read_capacity : null
  write_capacity = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_write_capacity : null
  
  attribute {
    name = "event_type"
    type = "S"
  }
  
  attribute {
    name = "timestamp"
    type = "N"
  }
  
  attribute {
    name = "processed"
    type = "S"
  }
  
  # GSI for querying unprocessed events
  global_secondary_index {
    name     = "ProcessedIndex"
    hash_key = "processed"
    range_key = "timestamp"
    
    read_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? 5 : null
    write_capacity = var.dynamodb_billing_mode == "PROVISIONED" ? 5 : null
    
    projection_type = "ALL"
  }
  
  # DynamoDB Streams for event processing
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"
  
  # TTL for event cleanup (30 days)
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
  
  point_in_time_recovery {
    enabled = var.enable_backup
  }
  
  server_side_encryption {
    enabled     = var.enable_encryption
    kms_key_arn = var.enable_encryption ? aws_kms_key.clos.arn : null
  }
  
  tags = {
    Name = "${var.project_name}-event-stream"
  }
}

# WIP Locks Table
resource "aws_dynamodb_table" "wip_locks" {
  name           = "${var.project_name}-wip-locks"
  billing_mode   = var.dynamodb_billing_mode
  hash_key       = "pod_id"
  range_key      = "item_id"
  
  read_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_read_capacity : null
  write_capacity = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_write_capacity : null
  
  attribute {
    name = "pod_id"
    type = "S"
  }
  
  attribute {
    name = "item_id"
    type = "S"
  }
  
  attribute {
    name = "lock_type"
    type = "S"
  }
  
  # GSI for querying by lock type
  global_secondary_index {
    name     = "LockTypeIndex"
    hash_key = "lock_type"
    range_key = "pod_id"
    
    read_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? 5 : null
    write_capacity = var.dynamodb_billing_mode == "PROVISIONED" ? 5 : null
    
    projection_type = "ALL"
  }
  
  # TTL for automatic lock expiration
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
  
  point_in_time_recovery {
    enabled = var.enable_backup
  }
  
  server_side_encryption {
    enabled     = var.enable_encryption
    kms_key_arn = var.enable_encryption ? aws_kms_key.clos.arn : null
  }
  
  tags = {
    Name = "${var.project_name}-wip-locks"
  }
}

# Ideas Table
resource "aws_dynamodb_table" "ideas" {
  name           = "${var.project_name}-ideas"
  billing_mode   = var.dynamodb_billing_mode
  hash_key       = "idea_id"
  
  read_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_read_capacity : null
  write_capacity = var.dynamodb_billing_mode == "PROVISIONED" ? var.dynamodb_write_capacity : null
  
  attribute {
    name = "idea_id"
    type = "S"
  }
  
  attribute {
    name = "status"
    type = "S"
  }
  
  attribute {
    name = "submitted_at"
    type = "N"
  }
  
  attribute {
    name = "evaluation_score"
    type = "N"
  }
  
  # GSI for querying by status
  global_secondary_index {
    name     = "StatusIndex"
    hash_key = "status"
    range_key = "submitted_at"
    
    read_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? 5 : null
    write_capacity = var.dynamodb_billing_mode == "PROVISIONED" ? 5 : null
    
    projection_type = "ALL"
  }
  
  # GSI for querying by evaluation score
  global_secondary_index {
    name     = "ScoreIndex"
    hash_key = "status"
    range_key = "evaluation_score"
    
    read_capacity  = var.dynamodb_billing_mode == "PROVISIONED" ? 5 : null
    write_capacity = var.dynamodb_billing_mode == "PROVISIONED" ? 5 : null
    
    projection_type = "ALL"
  }
  
  point_in_time_recovery {
    enabled = var.enable_backup
  }
  
  server_side_encryption {
    enabled     = var.enable_encryption
    kms_key_arn = var.enable_encryption ? aws_kms_key.clos.arn : null
  }
  
  tags = {
    Name = "${var.project_name}-ideas"
  }
}

# Cross-region backup for disaster recovery (if enabled)
resource "aws_dynamodb_table" "real_time_metrics_backup" {
  count = var.enable_cross_region_backup ? 1 : 0
  
  provider = aws.backup_region
  
  name           = "${var.project_name}-real-time-metrics-backup"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "pod_id"
  range_key      = "timestamp"
  
  attribute {
    name = "pod_id"
    type = "S"
  }
  
  attribute {
    name = "timestamp"
    type = "N"
  }
  
  # Replicate the main table structure
  replica {
    region_name = var.aws_region
  }
  
  server_side_encryption {
    enabled = true
  }
  
  tags = {
    Name = "${var.project_name}-real-time-metrics-backup"
  }
}

# Define backup region provider
provider "aws" {
  alias  = "backup_region"
  region = var.backup_region
}

# Database initialization Lambda function
resource "aws_lambda_function" "db_init" {
  filename         = "db-init.zip"
  function_name    = "${var.project_name}-db-init"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.db_init_zip.output_base64sha256
  runtime         = "python3.11"
  timeout         = 300

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      DATABASE_HOST = aws_rds_cluster.main.endpoint
      DATABASE_NAME = aws_rds_cluster.main.database_name
      SECRET_ARN    = aws_rds_cluster.main.master_user_secret[0].secret_arn
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_cloudwatch_log_group.lambda_logs,
  ]

  tags = {
    Name = "${var.project_name}-db-init"
  }
}

# Create the deployment package for the database initialization function
data "archive_file" "db_init_zip" {
  type        = "zip"
  output_path = "db-init.zip"
  source {
    content = templatefile("${path.module}/lambda/db-init.py", {
      project_name = var.project_name
    })
    filename = "index.py"
  }
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${var.project_name}-db-init"
  retention_in_days = 14
  kms_key_id        = aws_kms_key.clos.arn

  tags = {
    Name = "${var.project_name}-lambda-logs"
  }
}

# Trigger the database initialization function
resource "aws_lambda_invocation" "db_init" {
  function_name = aws_lambda_function.db_init.function_name
  
  input = jsonencode({
    operation = "initialize"
  })

  depends_on = [
    aws_rds_cluster_instance.cluster_instances,
    aws_dynamodb_table.real_time_metrics,
    aws_dynamodb_table.user_sessions,
    aws_dynamodb_table.event_stream,
    aws_dynamodb_table.wip_locks,
    aws_dynamodb_table.ideas
  ]
}