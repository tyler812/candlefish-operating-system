# SNS Topic for Alerts
resource "aws_sns_topic" "alerts" {
  name              = "${var.project_name}-alerts"
  kms_master_key_id = aws_kms_key.clos.arn

  tags = {
    Name = "${var.project_name}-alerts"
  }
}

# SNS Subscription for Email Alerts
resource "aws_sns_topic_subscription" "email_alerts" {
  count = var.alert_email != "" ? 1 : 0
  
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ServiceName", aws_ecs_service.core_api.name, "ClusterName", aws_ecs_cluster.main.name],
            ["AWS/ECS", "MemoryUtilization", "ServiceName", aws_ecs_service.core_api.name, "ClusterName", aws_ecs_cluster.main.name],
            ["AWS/ECS", "CPUUtilization", "ServiceName", aws_ecs_service.workflow_engine.name, "ClusterName", aws_ecs_cluster.main.name],
            ["AWS/ECS", "MemoryUtilization", "ServiceName", aws_ecs_service.workflow_engine.name, "ClusterName", aws_ecs_cluster.main.name]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "ECS Service Resources"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.main.arn_suffix],
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.main.arn_suffix],
            ["AWS/ApplicationELB", "HTTPCode_Target_2XX_Count", "LoadBalancer", aws_lb.main.arn_suffix],
            ["AWS/ApplicationELB", "HTTPCode_Target_4XX_Count", "LoadBalancer", aws_lb.main.arn_suffix],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", aws_lb.main.arn_suffix]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "Load Balancer Metrics"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBClusterIdentifier", aws_rds_cluster.main.cluster_identifier],
            ["AWS/RDS", "DatabaseConnections", "DBClusterIdentifier", aws_rds_cluster.main.cluster_identifier],
            ["AWS/RDS", "ReadLatency", "DBClusterIdentifier", aws_rds_cluster.main.cluster_identifier],
            ["AWS/RDS", "WriteLatency", "DBClusterIdentifier", aws_rds_cluster.main.cluster_identifier]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "RDS Cluster Metrics"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", aws_dynamodb_table.real_time_metrics.name],
            ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", aws_dynamodb_table.real_time_metrics.name],
            ["AWS/DynamoDB", "ThrottledRequests", "TableName", aws_dynamodb_table.real_time_metrics.name],
            ["AWS/DynamoDB", "SuccessfulRequestLatency", "TableName", aws_dynamodb_table.real_time_metrics.name, "Operation", "Query"]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "DynamoDB Metrics"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.stage_gate_processor.function_name],
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.stage_gate_processor.function_name],
            ["AWS/Lambda", "Invocations", "FunctionName", aws_lambda_function.stage_gate_processor.function_name],
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.wip_limit_processor.function_name],
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.wip_limit_processor.function_name],
            ["AWS/Lambda", "Invocations", "FunctionName", aws_lambda_function.wip_limit_processor.function_name]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "Lambda Function Metrics"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/SQS", "NumberOfMessagesReceived", "QueueName", aws_sqs_queue.stage_gate.name],
            ["AWS/SQS", "NumberOfMessagesSent", "QueueName", aws_sqs_queue.stage_gate.name],
            ["AWS/SQS", "ApproximateNumberOfVisibleMessages", "QueueName", aws_sqs_queue.stage_gate.name],
            ["AWS/SQS", "NumberOfMessagesReceived", "QueueName", aws_sqs_queue.wip_limit.name],
            ["AWS/SQS", "NumberOfMessagesSent", "QueueName", aws_sqs_queue.wip_limit.name],
            ["AWS/SQS", "ApproximateNumberOfVisibleMessages", "QueueName", aws_sqs_queue.wip_limit.name]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "SQS Queue Metrics"
          period  = 300
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-dashboard"
  }
}

# CloudWatch Alarms

# ECS Service Alarms
resource "aws_cloudwatch_metric_alarm" "core_api_cpu_high" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-core-api-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors ECS Core API CPU utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    ServiceName = aws_ecs_service.core_api.name
    ClusterName = aws_ecs_cluster.main.name
  }

  tags = {
    Name = "${var.project_name}-core-api-cpu-high"
  }
}

resource "aws_cloudwatch_metric_alarm" "core_api_memory_high" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-core-api-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "85"
  alarm_description   = "This metric monitors ECS Core API memory utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    ServiceName = aws_ecs_service.core_api.name
    ClusterName = aws_ecs_cluster.main.name
  }

  tags = {
    Name = "${var.project_name}-core-api-memory-high"
  }
}

resource "aws_cloudwatch_metric_alarm" "workflow_engine_cpu_high" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-workflow-engine-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors ECS Workflow Engine CPU utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    ServiceName = aws_ecs_service.workflow_engine.name
    ClusterName = aws_ecs_cluster.main.name
  }

  tags = {
    Name = "${var.project_name}-workflow-engine-cpu-high"
  }
}

# ALB Alarms
resource "aws_cloudwatch_metric_alarm" "alb_response_time_high" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-alb-response-time-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Average"
  threshold           = "1.0"
  alarm_description   = "This metric monitors ALB response time"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  tags = {
    Name = "${var.project_name}-alb-response-time-high"
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx_errors" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-alb-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "This metric monitors ALB 5XX errors"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  tags = {
    Name = "${var.project_name}-alb-5xx-errors"
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-alb-unhealthy-hosts"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Average"
  threshold           = "0"
  alarm_description   = "This metric monitors unhealthy ALB targets"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    TargetGroup  = aws_lb_target_group.core_api.arn_suffix
    LoadBalancer = aws_lb.main.arn_suffix
  }

  tags = {
    Name = "${var.project_name}-alb-unhealthy-hosts"
  }
}

# RDS Alarms
resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors RDS CPU utilization"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBClusterIdentifier = aws_rds_cluster.main.cluster_identifier
  }

  tags = {
    Name = "${var.project_name}-rds-cpu-high"
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_connections_high" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-rds-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors RDS connection count"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBClusterIdentifier = aws_rds_cluster.main.cluster_identifier
  }

  tags = {
    Name = "${var.project_name}-rds-connections-high"
  }
}

# DynamoDB Alarms
resource "aws_cloudwatch_metric_alarm" "dynamodb_throttles" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-dynamodb-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "ThrottledRequests"
  namespace           = "AWS/DynamoDB"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "This metric monitors DynamoDB throttled requests"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = aws_dynamodb_table.real_time_metrics.name
  }

  tags = {
    Name = "${var.project_name}-dynamodb-throttles"
  }
}

# Lambda Alarms
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "This metric monitors Lambda function errors"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.stage_gate_processor.function_name
  }

  tags = {
    Name = "${var.project_name}-lambda-errors"
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_duration_high" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-lambda-duration-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Average"
  threshold           = "30000"  # 30 seconds
  alarm_description   = "This metric monitors Lambda function duration"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = aws_lambda_function.stage_gate_processor.function_name
  }

  tags = {
    Name = "${var.project_name}-lambda-duration-high"
  }
}

# SQS Alarms
resource "aws_cloudwatch_metric_alarm" "sqs_messages_visible" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-sqs-messages-visible"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ApproximateNumberOfVisibleMessages"
  namespace           = "AWS/SQS"
  period              = "300"
  statistic           = "Average"
  threshold           = "100"
  alarm_description   = "This metric monitors SQS queue depth"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    QueueName = aws_sqs_queue.stage_gate.name
  }

  tags = {
    Name = "${var.project_name}-sqs-messages-visible"
  }
}

resource "aws_cloudwatch_metric_alarm" "sqs_dlq_messages" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-sqs-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "ApproximateNumberOfVisibleMessages"
  namespace           = "AWS/SQS"
  period              = "300"
  statistic           = "Average"
  threshold           = "0"
  alarm_description   = "This metric monitors SQS dead letter queue"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    QueueName = aws_sqs_queue.stage_gate_dlq.name
  }

  tags = {
    Name = "${var.project_name}-sqs-dlq-messages"
  }
}

# Custom Metrics for CLOS-specific monitoring

# CloudWatch Log Metric Filters for Application Metrics
resource "aws_cloudwatch_log_metric_filter" "stage_gate_transitions" {
  name           = "${var.project_name}-stage-gate-transitions"
  log_group_name = aws_cloudwatch_log_group.core_api.name
  pattern        = "[timestamp, request_id, level=\"INFO\", message=\"stage_gate_approved\", ...]"

  metric_transformation {
    name      = "StageGateTransitions"
    namespace = "CLOS/StageGates"
    value     = "1"
  }
}

resource "aws_cloudwatch_log_metric_filter" "wip_limit_violations" {
  name           = "${var.project_name}-wip-limit-violations"
  log_group_name = aws_cloudwatch_log_group.lambda_wip_limit.name
  pattern        = "[timestamp, request_id, level=\"WARNING\", message=\"WIP limit exceeded\", ...]"

  metric_transformation {
    name      = "WIPLimitViolations"
    namespace = "CLOS/WIPLimits"
    value     = "1"
  }
}

resource "aws_cloudwatch_log_metric_filter" "api_errors" {
  name           = "${var.project_name}-api-errors"
  log_group_name = aws_cloudwatch_log_group.core_api.name
  pattern        = "[timestamp, request_id, level=\"ERROR\", ...]"

  metric_transformation {
    name      = "APIErrors"
    namespace = "CLOS/API"
    value     = "1"
  }
}

# Custom Alarms for CLOS Metrics
resource "aws_cloudwatch_metric_alarm" "stage_gate_transitions_low" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-stage-transitions-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "StageGateTransitions"
  namespace           = "CLOS/StageGates"
  period              = "86400"  # 24 hours
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "No stage gate transitions in 24 hours - possible system issue"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "breaching"

  tags = {
    Name = "${var.project_name}-stage-transitions-low"
  }
}

resource "aws_cloudwatch_metric_alarm" "wip_violations_high" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-wip-violations-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "WIPLimitViolations"
  namespace           = "CLOS/WIPLimits"
  period              = "3600"  # 1 hour
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "High number of WIP limit violations"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${var.project_name}-wip-violations-high"
  }
}

# CloudWatch Composite Alarms
resource "aws_cloudwatch_composite_alarm" "system_health" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name        = "${var.project_name}-system-health"
  alarm_description = "Overall system health composite alarm"
  
  actions_enabled = true
  alarm_actions   = [aws_sns_topic.alerts.arn]
  ok_actions      = [aws_sns_topic.alerts.arn]

  alarm_rule = join(" OR ", [
    "ALARM(${aws_cloudwatch_metric_alarm.core_api_cpu_high[0].alarm_name})",
    "ALARM(${aws_cloudwatch_metric_alarm.core_api_memory_high[0].alarm_name})",
    "ALARM(${aws_cloudwatch_metric_alarm.alb_5xx_errors[0].alarm_name})",
    "ALARM(${aws_cloudwatch_metric_alarm.rds_cpu_high[0].alarm_name})",
    "ALARM(${aws_cloudwatch_metric_alarm.lambda_errors[0].alarm_name})"
  ])

  tags = {
    Name = "${var.project_name}-system-health"
  }
}

# CloudWatch Insights Queries for troubleshooting
resource "aws_cloudwatch_query_definition" "error_analysis" {
  name = "${var.project_name}-error-analysis"

  log_group_names = [
    aws_cloudwatch_log_group.core_api.name,
    aws_cloudwatch_log_group.workflow_engine.name
  ]

  query_string = <<-EOT
    fields @timestamp, @message, @requestId, level
    | filter level = "ERROR"
    | sort @timestamp desc
    | limit 100
  EOT
}

resource "aws_cloudwatch_query_definition" "performance_analysis" {
  name = "${var.project_name}-performance-analysis"

  log_group_names = [
    aws_cloudwatch_log_group.core_api.name
  ]

  query_string = <<-EOT
    fields @timestamp, @duration, @requestId, @message
    | filter @message like /duration/
    | sort @duration desc
    | limit 50
  EOT
}

resource "aws_cloudwatch_query_definition" "stage_gate_analysis" {
  name = "${var.project_name}-stage-gate-analysis"

  log_group_names = [
    aws_cloudwatch_log_group.lambda_stage_gate.name
  ]

  query_string = <<-EOT
    fields @timestamp, @message, project_id, stage
    | filter @message like /stage_gate/
    | sort @timestamp desc
    | limit 100
  EOT
}

# X-Ray Tracing (if needed for detailed debugging)
resource "aws_xray_sampling_rule" "clos_sampling" {
  count = var.enable_monitoring ? 1 : 0

  rule_name      = "${var.project_name}-sampling-rule"
  priority       = 9000
  version        = 1
  reservoir_size = 1
  fixed_rate     = 0.1
  url_path       = "*"
  host           = "*"
  http_method    = "*"
  service_type   = "*"
  service_name   = "*"
  resource_arn   = "*"

  tags = {
    Name = "${var.project_name}-xray-sampling"
  }
}

# Cost Monitoring
resource "aws_budgets_budget" "monthly_cost" {
  count = var.enable_monitoring ? 1 : 0

  name     = "${var.project_name}-monthly-budget"
  time_unit = "MONTHLY"
  budget_type = "COST"

  limit_amount = "800"
  limit_unit   = "USD"

  cost_filters {
    tag {
      key = "Project"
      values = [var.project_name]
    }
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }

  tags = {
    Name = "${var.project_name}-budget"
  }
}

# CloudWatch Synthetics for external monitoring (API health checks)
resource "aws_synthetics_canary" "api_health_check" {
  count = var.enable_monitoring && var.domain_name != "" ? 1 : 0

  name                 = "${var.project_name}-api-health-check"
  artifact_s3_location = "s3://${aws_s3_bucket.artifacts.bucket}/synthetics/"
  execution_role_arn   = aws_iam_role.synthetics_role[0].arn
  handler              = "apiCanaryBlueprint.handler"
  zip_file             = data.archive_file.synthetics_zip[0].output_path
  runtime_version      = "syn-nodejs-puppeteer-3.9"

  schedule {
    expression = "rate(5 minutes)"
  }

  run_config {
    timeout_in_seconds = 60
  }

  failure_retention_period = 30
  success_retention_period = 30

  tags = {
    Name = "${var.project_name}-api-health-check"
  }
}

# IAM Role for Synthetics
resource "aws_iam_role" "synthetics_role" {
  count = var.enable_monitoring && var.domain_name != "" ? 1 : 0

  name = "${var.project_name}-synthetics-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "synthetics_role_policy" {
  count = var.enable_monitoring && var.domain_name != "" ? 1 : 0

  role       = aws_iam_role.synthetics_role[0].name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchSyntheticsExecutionRolePolicy"
}

# Synthetics script
data "archive_file" "synthetics_zip" {
  count = var.enable_monitoring && var.domain_name != "" ? 1 : 0

  type        = "zip"
  output_path = "synthetics-script.zip"
  source {
    content = templatefile("${path.module}/synthetics/api-health-check.js", {
      api_url = "https://api.${var.domain_name}"
    })
    filename = "nodejs/node_modules/apiCanaryBlueprint.js"
  }
}

# Create synthetics directory and script
resource "local_file" "synthetics_script" {
  count = var.enable_monitoring && var.domain_name != "" ? 1 : 0

  content = templatefile("${path.module}/synthetics/api-health-check.js", {
    api_url = var.domain_name != "" ? "https://api.${var.domain_name}" : "https://${aws_lb.main.dns_name}"
  })
  filename = "${path.module}/synthetics/api-health-check.js"
}