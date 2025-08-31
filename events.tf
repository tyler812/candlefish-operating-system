# Custom EventBridge Bus
resource "aws_cloudwatch_event_bus" "main" {
  name = "${var.project_name}-event-bus"

  tags = {
    Name = "${var.project_name}-event-bus"
  }
}

# SQS Queues for Event Processing

# Async Processing Queue
resource "aws_sqs_queue" "async_processing" {
  name                      = "${var.project_name}-async-processing-queue"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 1209600 # 14 days
  receive_wait_time_seconds = 10
  
  kms_master_key_id                 = aws_kms_key.clos.arn
  kms_data_key_reuse_period_seconds = 300

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.async_processing_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "${var.project_name}-async-processing-queue"
  }
}

# Dead Letter Queue for Async Processing
resource "aws_sqs_queue" "async_processing_dlq" {
  name                      = "${var.project_name}-async-processing-dlq"
  message_retention_seconds = 1209600 # 14 days
  
  kms_master_key_id                 = aws_kms_key.clos.arn
  kms_data_key_reuse_period_seconds = 300

  tags = {
    Name = "${var.project_name}-async-processing-dlq"
  }
}

# Stage Gate Processing Queue
resource "aws_sqs_queue" "stage_gate" {
  name                      = "${var.project_name}-stage-gate-queue"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 1209600
  receive_wait_time_seconds = 10
  
  kms_master_key_id                 = aws_kms_key.clos.arn
  kms_data_key_reuse_period_seconds = 300

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.stage_gate_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "${var.project_name}-stage-gate-queue"
  }
}

resource "aws_sqs_queue" "stage_gate_dlq" {
  name                      = "${var.project_name}-stage-gate-dlq"
  message_retention_seconds = 1209600
  
  kms_master_key_id                 = aws_kms_key.clos.arn
  kms_data_key_reuse_period_seconds = 300

  tags = {
    Name = "${var.project_name}-stage-gate-dlq"
  }
}

# WIP Limit Processing Queue
resource "aws_sqs_queue" "wip_limit" {
  name                      = "${var.project_name}-wip-limit-queue"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 1209600
  receive_wait_time_seconds = 10
  
  kms_master_key_id                 = aws_kms_key.clos.arn
  kms_data_key_reuse_period_seconds = 300

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.wip_limit_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "${var.project_name}-wip-limit-queue"
  }
}

resource "aws_sqs_queue" "wip_limit_dlq" {
  name                      = "${var.project_name}-wip-limit-dlq"
  message_retention_seconds = 1209600
  
  kms_master_key_id                 = aws_kms_key.clos.arn
  kms_data_key_reuse_period_seconds = 300

  tags = {
    Name = "${var.project_name}-wip-limit-dlq"
  }
}

# Lambda Functions for Event Processing

# Stage Gate Processor
resource "aws_lambda_function" "stage_gate_processor" {
  filename         = "stage-gate-processor.zip"
  function_name    = "${var.project_name}-stage-gate-processor"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.stage_gate_processor_zip.output_base64sha256
  runtime         = "python3.11"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      DYNAMODB_TABLE = aws_dynamodb_table.wip_locks.name
      RDS_ENDPOINT   = aws_rds_cluster.main.endpoint
      SECRET_ARN     = aws_secretsmanager_secret.db_credentials.arn
      EVENT_BUS_NAME = aws_cloudwatch_event_bus.main.name
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_cloudwatch_log_group.lambda_stage_gate,
  ]

  tags = {
    Name = "${var.project_name}-stage-gate-processor"
  }
}

# WIP Limit Processor
resource "aws_lambda_function" "wip_limit_processor" {
  filename         = "wip-limit-processor.zip"
  function_name    = "${var.project_name}-wip-limit-processor"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.wip_limit_processor_zip.output_base64sha256
  runtime         = "python3.11"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      DYNAMODB_TABLE = aws_dynamodb_table.wip_locks.name
      EVENT_BUS_NAME = aws_cloudwatch_event_bus.main.name
      SLACK_WEBHOOK  = var.slack_webhook_url
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_cloudwatch_log_group.lambda_wip_limit,
  ]

  tags = {
    Name = "${var.project_name}-wip-limit-processor"
  }
}

# GitHub Webhook Handler
resource "aws_lambda_function" "github_webhook" {
  filename         = "github-webhook.zip"
  function_name    = "${var.project_name}-github-webhook"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.github_webhook_zip.output_base64sha256
  runtime         = "python3.11"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size

  environment {
    variables = {
      EVENT_BUS_NAME = aws_cloudwatch_event_bus.main.name
      GITHUB_SECRET  = var.github_token
      QUEUE_URL      = aws_sqs_queue.stage_gate.url
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_cloudwatch_log_group.lambda_github,
  ]

  tags = {
    Name = "${var.project_name}-github-webhook"
  }
}

# Daily Unblock Scheduler
resource "aws_lambda_function" "daily_unblock" {
  filename         = "daily-unblock.zip"
  function_name    = "${var.project_name}-daily-unblock"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.daily_unblock_zip.output_base64sha256
  runtime         = "python3.11"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      RDS_ENDPOINT   = aws_rds_cluster.main.endpoint
      SECRET_ARN     = aws_secretsmanager_secret.db_credentials.arn
      SLACK_TOKEN    = var.slack_token
      EVENT_BUS_NAME = aws_cloudwatch_event_bus.main.name
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_cloudwatch_log_group.lambda_daily_unblock,
  ]

  tags = {
    Name = "${var.project_name}-daily-unblock"
  }
}

# CloudWatch Log Groups for Lambda Functions
resource "aws_cloudwatch_log_group" "lambda_stage_gate" {
  name              = "/aws/lambda/${var.project_name}-stage-gate-processor"
  retention_in_days = 14
  kms_key_id        = aws_kms_key.clos.arn

  tags = {
    Name = "${var.project_name}-stage-gate-logs"
  }
}

resource "aws_cloudwatch_log_group" "lambda_wip_limit" {
  name              = "/aws/lambda/${var.project_name}-wip-limit-processor"
  retention_in_days = 14
  kms_key_id        = aws_kms_key.clos.arn

  tags = {
    Name = "${var.project_name}-wip-limit-logs"
  }
}

resource "aws_cloudwatch_log_group" "lambda_github" {
  name              = "/aws/lambda/${var.project_name}-github-webhook"
  retention_in_days = 14
  kms_key_id        = aws_kms_key.clos.arn

  tags = {
    Name = "${var.project_name}-github-webhook-logs"
  }
}

resource "aws_cloudwatch_log_group" "lambda_daily_unblock" {
  name              = "/aws/lambda/${var.project_name}-daily-unblock"
  retention_in_days = 14
  kms_key_id        = aws_kms_key.clos.arn

  tags = {
    Name = "${var.project_name}-daily-unblock-logs"
  }
}

# Lambda Function Source Code Archives
data "archive_file" "stage_gate_processor_zip" {
  type        = "zip"
  output_path = "stage-gate-processor.zip"
  source {
    content = templatefile("${path.module}/lambda/stage-gate-processor.py", {
      project_name = var.project_name
    })
    filename = "index.py"
  }
}

data "archive_file" "wip_limit_processor_zip" {
  type        = "zip"
  output_path = "wip-limit-processor.zip"
  source {
    content = templatefile("${path.module}/lambda/wip-limit-processor.py", {
      project_name = var.project_name
    })
    filename = "index.py"
  }
}

data "archive_file" "github_webhook_zip" {
  type        = "zip"
  output_path = "github-webhook.zip"
  source {
    content = templatefile("${path.module}/lambda/github-webhook.py", {
      project_name = var.project_name
    })
    filename = "index.py"
  }
}

data "archive_file" "daily_unblock_zip" {
  type        = "zip"
  output_path = "daily-unblock.zip"
  source {
    content = templatefile("${path.module}/lambda/daily-unblock.py", {
      project_name = var.project_name
    })
    filename = "index.py"
  }
}

# SQS Event Source Mappings for Lambda
resource "aws_lambda_event_source_mapping" "stage_gate_processor" {
  event_source_arn = aws_sqs_queue.stage_gate.arn
  function_name    = aws_lambda_function.stage_gate_processor.arn
  batch_size       = 10
  maximum_batching_window_in_seconds = 5
}

resource "aws_lambda_event_source_mapping" "wip_limit_processor" {
  event_source_arn = aws_sqs_queue.wip_limit.arn
  function_name    = aws_lambda_function.wip_limit_processor.arn
  batch_size       = 10
  maximum_batching_window_in_seconds = 5
}

resource "aws_lambda_event_source_mapping" "async_processing" {
  event_source_arn = aws_sqs_queue.async_processing.arn
  function_name    = aws_lambda_function.stage_gate_processor.arn
  batch_size       = 10
  maximum_batching_window_in_seconds = 5
}

# EventBridge Rules

# GitHub Events Rule
resource "aws_cloudwatch_event_rule" "github_events" {
  name           = "${var.project_name}-github-events"
  description    = "Capture GitHub webhook events"
  event_bus_name = aws_cloudwatch_event_bus.main.name

  event_pattern = jsonencode({
    source      = ["github.webhook"]
    detail-type = ["Pull Request", "Push", "Deployment", "Issue"]
  })

  tags = {
    Name = "${var.project_name}-github-events"
  }
}

# Stage Gate Events Rule
resource "aws_cloudwatch_event_rule" "stage_gate_events" {
  name           = "${var.project_name}-stage-gate-events"
  description    = "Process stage gate transitions"
  event_bus_name = aws_cloudwatch_event_bus.main.name

  event_pattern = jsonencode({
    source      = ["clos.stage-gates"]
    detail-type = ["Stage Transition Request", "Stage Gate Approval", "Stage Gate Rejection"]
  })

  tags = {
    Name = "${var.project_name}-stage-gate-events"
  }
}

# WIP Limit Events Rule
resource "aws_cloudwatch_event_rule" "wip_limit_events" {
  name           = "${var.project_name}-wip-limit-events"
  description    = "Monitor and enforce WIP limits"
  event_bus_name = aws_cloudwatch_event_bus.main.name

  event_pattern = jsonencode({
    source      = ["clos.wip-limits"]
    detail-type = ["WIP Limit Exceeded", "WIP Lock Acquired", "WIP Lock Released"]
  })

  tags = {
    Name = "${var.project_name}-wip-limit-events"
  }
}

# Daily Unblock Schedule Rule
resource "aws_cloudwatch_event_rule" "daily_unblock" {
  name                = "${var.project_name}-daily-unblock-schedule"
  description         = "Trigger daily unblock process"
  schedule_expression = "cron(0 14 ? * MON-FRI *)" # 9 AM EST on weekdays

  tags = {
    Name = "${var.project_name}-daily-unblock-schedule"
  }
}

# Weekly Demo Schedule Rule
resource "aws_cloudwatch_event_rule" "weekly_demo" {
  name                = "${var.project_name}-weekly-demo-schedule"
  description         = "Trigger weekly demo preparation"
  schedule_expression = "cron(0 16 ? * FRI *)" # 11 AM EST on Fridays

  tags = {
    Name = "${var.project_name}-weekly-demo-schedule"
  }
}

# EventBridge Targets

# GitHub Events → SQS
resource "aws_cloudwatch_event_target" "github_events_to_sqs" {
  rule           = aws_cloudwatch_event_rule.github_events.name
  event_bus_name = aws_cloudwatch_event_bus.main.name
  target_id      = "GitHubEventsToSQS"
  arn            = aws_sqs_queue.stage_gate.arn
}

# Stage Gate Events → SQS
resource "aws_cloudwatch_event_target" "stage_gate_events_to_sqs" {
  rule           = aws_cloudwatch_event_rule.stage_gate_events.name
  event_bus_name = aws_cloudwatch_event_bus.main.name
  target_id      = "StageGateEventsToSQS"
  arn            = aws_sqs_queue.stage_gate.arn
}

# WIP Limit Events → SQS
resource "aws_cloudwatch_event_target" "wip_limit_events_to_sqs" {
  rule           = aws_cloudwatch_event_rule.wip_limit_events.name
  event_bus_name = aws_cloudwatch_event_bus.main.name
  target_id      = "WIPLimitEventsToSQS"
  arn            = aws_sqs_queue.wip_limit.arn
}

# Daily Unblock → Lambda
resource "aws_cloudwatch_event_target" "daily_unblock_to_lambda" {
  rule      = aws_cloudwatch_event_rule.daily_unblock.name
  target_id = "DailyUnblockToLambda"
  arn       = aws_lambda_function.daily_unblock.arn
}

# Weekly Demo → Lambda (uses same daily unblock function with different event)
resource "aws_cloudwatch_event_target" "weekly_demo_to_lambda" {
  rule      = aws_cloudwatch_event_rule.weekly_demo.name
  target_id = "WeeklyDemoToLambda"
  arn       = aws_lambda_function.daily_unblock.arn
  
  input = jsonencode({
    event_type = "weekly_demo"
  })
}

# Lambda Permissions for EventBridge
resource "aws_lambda_permission" "allow_eventbridge_daily_unblock" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.daily_unblock.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_unblock.arn
}

resource "aws_lambda_permission" "allow_eventbridge_weekly_demo" {
  statement_id  = "AllowExecutionFromEventBridgeWeekly"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.daily_unblock.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.weekly_demo.arn
}

# SQS Permissions for EventBridge
data "aws_iam_policy_document" "sqs_eventbridge_policy" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
    actions = ["sqs:SendMessage"]
    resources = [
      aws_sqs_queue.stage_gate.arn,
      aws_sqs_queue.wip_limit.arn,
      aws_sqs_queue.async_processing.arn
    ]
  }
}

resource "aws_sqs_queue_policy" "eventbridge_policy" {
  queue_url = aws_sqs_queue.stage_gate.url
  policy    = data.aws_iam_policy_document.sqs_eventbridge_policy.json
}

resource "aws_sqs_queue_policy" "eventbridge_policy_wip" {
  queue_url = aws_sqs_queue.wip_limit.url
  policy    = data.aws_iam_policy_document.sqs_eventbridge_policy.json
}

resource "aws_sqs_queue_policy" "eventbridge_policy_async" {
  queue_url = aws_sqs_queue.async_processing.url
  policy    = data.aws_iam_policy_document.sqs_eventbridge_policy.json
}

# API Gateway for GitHub Webhooks (optional external access)
resource "aws_api_gateway_rest_api" "webhooks" {
  name        = "${var.project_name}-webhooks-api"
  description = "API Gateway for external webhooks"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = {
    Name = "${var.project_name}-webhooks-api"
  }
}

resource "aws_api_gateway_resource" "github_webhook" {
  rest_api_id = aws_api_gateway_rest_api.webhooks.id
  parent_id   = aws_api_gateway_rest_api.webhooks.root_resource_id
  path_part   = "github"
}

resource "aws_api_gateway_method" "github_webhook_post" {
  rest_api_id   = aws_api_gateway_rest_api.webhooks.id
  resource_id   = aws_api_gateway_resource.github_webhook.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "github_webhook" {
  rest_api_id = aws_api_gateway_rest_api.webhooks.id
  resource_id = aws_api_gateway_method.github_webhook_post.resource_id
  http_method = aws_api_gateway_method.github_webhook_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.github_webhook.invoke_arn
}

resource "aws_api_gateway_deployment" "webhooks" {
  depends_on = [
    aws_api_gateway_integration.github_webhook,
  ]

  rest_api_id = aws_api_gateway_rest_api.webhooks.id
  stage_name  = var.environment
}

resource "aws_lambda_permission" "allow_api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.github_webhook.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.webhooks.execution_arn}/*/*"
}