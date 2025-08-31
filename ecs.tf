# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"

  configuration {
    execute_command_configuration {
      kms_key_id = aws_kms_key.clos.arn
      logging    = "OVERRIDE"

      log_configuration {
        cloud_watch_encryption_enabled = true
        cloud_watch_log_group_name     = aws_cloudwatch_log_group.ecs_exec.name
        s3_bucket_name                 = aws_s3_bucket.artifacts.bucket
        s3_key_prefix                  = "ecs-exec-logs/"
      }
    }
  }

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${var.project_name}-cluster"
  }
}

# CloudWatch Log Group for ECS Exec
resource "aws_cloudwatch_log_group" "ecs_exec" {
  name              = "/aws/ecs/${var.project_name}-exec"
  retention_in_days = 7
  kms_key_id        = aws_kms_key.clos.arn

  tags = {
    Name = "${var.project_name}-ecs-exec-logs"
  }
}

# CloudWatch Log Groups for Services
resource "aws_cloudwatch_log_group" "core_api" {
  name              = "/aws/ecs/${var.project_name}-core-api"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.clos.arn

  tags = {
    Name = "${var.project_name}-core-api-logs"
  }
}

resource "aws_cloudwatch_log_group" "workflow_engine" {
  name              = "/aws/ecs/${var.project_name}-workflow-engine"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.clos.arn

  tags = {
    Name = "${var.project_name}-workflow-engine-logs"
  }
}

# ECR Repositories
resource "aws_ecr_repository" "core_api" {
  name                 = "${var.project_name}/core-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.clos.arn
  }

  tags = {
    Name = "${var.project_name}-core-api-repo"
  }
}

resource "aws_ecr_repository" "workflow_engine" {
  name                 = "${var.project_name}/workflow-engine"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.clos.arn
  }

  tags = {
    Name = "${var.project_name}-workflow-engine-repo"
  }
}

# ECR Lifecycle Policies
resource "aws_ecr_lifecycle_policy" "core_api" {
  repository = aws_ecr_repository.core_api.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_ecr_lifecycle_policy" "workflow_engine" {
  repository = aws_ecr_repository.workflow_engine.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# Target Groups
resource "aws_lb_target_group" "core_api" {
  name        = "${var.project_name}-core-api-tg"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name = "${var.project_name}-core-api-tg"
  }
}

resource "aws_lb_target_group" "workflow_engine" {
  name        = "${var.project_name}-workflow-engine-tg"
  port        = 8081
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name = "${var.project_name}-workflow-engine-tg"
  }
}

# ALB Listeners
resource "aws_lb_listener" "main" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = var.certificate_arn != "" ? var.certificate_arn : aws_acm_certificate.main[0].arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.core_api.arn
  }
}

# SSL Certificate (if domain name is provided)
resource "aws_acm_certificate" "main" {
  count = var.domain_name != "" && var.certificate_arn == "" ? 1 : 0
  
  domain_name               = "api.${var.domain_name}"
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project_name}-certificate"
  }
}

# ALB Listener Rules
resource "aws_lb_listener_rule" "core_api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.core_api.arn
  }

  condition {
    path_pattern {
      values = ["/api/*", "/graphql", "/health"]
    }
  }
}

resource "aws_lb_listener_rule" "workflow_engine" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 200

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.workflow_engine.arn
  }

  condition {
    path_pattern {
      values = ["/workflows/*", "/temporal/*"]
    }
  }
}

# ECS Task Definitions
resource "aws_ecs_task_definition" "core_api" {
  family                   = "${var.project_name}-core-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "core-api"
      image     = var.core_api_image
      essential = true
      
      portMappings = [
        {
          containerPort = 8080
          hostPort      = 8080
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "PORT"
          value = "8080"
        },
        {
          name  = "AWS_REGION"
          value = var.aws_region
        },
        {
          name  = "PROJECT_NAME"
          value = var.project_name
        }
      ]

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = aws_secretsmanager_secret.db_credentials.arn
        },
        {
          name      = "GITHUB_TOKEN"
          valueFrom = "${aws_secretsmanager_secret.api_keys.arn}:github_token::"
        },
        {
          name      = "SLACK_TOKEN"
          valueFrom = "${aws_secretsmanager_secret.api_keys.arn}:slack_token::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.core_api.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      stopTimeout = 30
    }
  ])

  tags = {
    Name = "${var.project_name}-core-api-task"
  }
}

resource "aws_ecs_task_definition" "workflow_engine" {
  family                   = "${var.project_name}-workflow-engine"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ecs_cpu
  memory                   = var.ecs_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "workflow-engine"
      image     = var.workflow_engine_image
      essential = true
      
      portMappings = [
        {
          containerPort = 8081
          hostPort      = 8081
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "PORT"
          value = "8081"
        },
        {
          name  = "AWS_REGION"
          value = var.aws_region
        },
        {
          name  = "PROJECT_NAME"
          value = var.project_name
        }
      ]

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = aws_secretsmanager_secret.db_credentials.arn
        },
        {
          name      = "TEMPORAL_ADDRESS"
          valueFrom = "${aws_secretsmanager_secret.api_keys.arn}:temporal_address::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.workflow_engine.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8081/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      stopTimeout = 30
    }
  ])

  tags = {
    Name = "${var.project_name}-workflow-engine-task"
  }
}

# ECS Services
resource "aws_ecs_service" "core_api" {
  name            = "${var.project_name}-core-api-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.core_api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"
  
  platform_version = "1.4.0"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.core_api.arn
    container_name   = "core-api"
    container_port   = 8080
  }

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 50
    
    deployment_circuit_breaker {
      enable   = true
      rollback = true
    }
  }

  enable_execute_command = true

  depends_on = [
    aws_lb_listener.https,
    aws_iam_role_policy.ecs_task_policy,
  ]

  tags = {
    Name = "${var.project_name}-core-api-service"
  }
}

resource "aws_ecs_service" "workflow_engine" {
  name            = "${var.project_name}-workflow-engine-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.workflow_engine.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"
  
  platform_version = "1.4.0"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.workflow_engine.arn
    container_name   = "workflow-engine"
    container_port   = 8081
  }

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 50
    
    deployment_circuit_breaker {
      enable   = true
      rollback = true
    }
  }

  enable_execute_command = true

  depends_on = [
    aws_lb_listener.https,
    aws_iam_role_policy.ecs_task_policy,
  ]

  tags = {
    Name = "${var.project_name}-workflow-engine-service"
  }
}

# Auto Scaling for Core API
resource "aws_appautoscaling_target" "core_api" {
  max_capacity       = var.max_capacity
  min_capacity       = var.desired_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.core_api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "core_api_cpu" {
  name               = "${var.project_name}-core-api-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.core_api.resource_id
  scalable_dimension = aws_appautoscaling_target.core_api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.core_api.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

resource "aws_appautoscaling_policy" "core_api_memory" {
  name               = "${var.project_name}-core-api-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.core_api.resource_id
  scalable_dimension = aws_appautoscaling_target.core_api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.core_api.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value = 80.0
  }
}

# Auto Scaling for Workflow Engine
resource "aws_appautoscaling_target" "workflow_engine" {
  max_capacity       = var.max_capacity
  min_capacity       = var.desired_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.workflow_engine.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "workflow_engine_cpu" {
  name               = "${var.project_name}-workflow-engine-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.workflow_engine.resource_id
  scalable_dimension = aws_appautoscaling_target.workflow_engine.scalable_dimension
  service_namespace  = aws_appautoscaling_target.workflow_engine.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

# Service Discovery
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${var.project_name}.local"
  description = "Service discovery namespace for CLOS v2"
  vpc         = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-service-discovery"
  }
}

resource "aws_service_discovery_service" "core_api" {
  name = "core-api"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_grace_period_seconds = 30

  tags = {
    Name = "${var.project_name}-core-api-discovery"
  }
}

resource "aws_service_discovery_service" "workflow_engine" {
  name = "workflow-engine"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_grace_period_seconds = 30

  tags = {
    Name = "${var.project_name}-workflow-engine-discovery"
  }
}