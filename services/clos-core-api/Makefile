# CLOS Core API Makefile

.PHONY: help install dev build start test lint clean docker-build docker-up docker-down migrate seed

# Variables
DOCKER_IMAGE_NAME = clos-core-api
DOCKER_TAG = latest

# Default target
help: ## Show this help message
	@echo "CLOS Core API - Available commands:"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Development
install: ## Install dependencies
	npm ci

dev: ## Start development server with hot reload
	npm run dev

build: ## Build for production
	npm run build

start: ## Start production server
	npm start

# Database
migrate: ## Run database migrations
	npm run db:migrate

migrate-prod: ## Run database migrations in production
	npm run db:migrate:prod

seed: ## Seed database with sample data
	npm run db:seed

db-reset: ## Reset database (drop, migrate, seed)
	docker-compose exec postgres psql -U clos_user -d clos_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
	$(MAKE) migrate
	$(MAKE) seed

# Testing
test: ## Run all tests
	npm test

test-watch: ## Run tests in watch mode
	npm run test:watch

test-coverage: ## Run tests with coverage report
	npm run test:coverage

test-e2e: ## Run end-to-end tests
	npm run test:e2e

# Code Quality
lint: ## Run ESLint
	npm run lint

lint-fix: ## Run ESLint with auto-fix
	npm run lint:fix

format: ## Format code with Prettier
	npm run format

typecheck: ## Run TypeScript type checking
	npm run typecheck

# Docker
docker-build: ## Build Docker image
	docker build -t $(DOCKER_IMAGE_NAME):$(DOCKER_TAG) .

docker-build-prod: ## Build production Docker image
	docker build -t $(DOCKER_IMAGE_NAME):$(DOCKER_TAG) --target production .

docker-up: ## Start all Docker services
	docker-compose up -d

docker-down: ## Stop all Docker services
	docker-compose down

docker-logs: ## Show Docker logs
	docker-compose logs -f clos-api

docker-shell: ## Shell into running container
	docker-compose exec clos-api /bin/sh

# Infrastructure
infra-up: ## Start infrastructure services only (postgres, redis, localstack)
	docker-compose up -d postgres redis localstack

infra-down: ## Stop infrastructure services
	docker-compose stop postgres redis localstack

# Prisma
prisma-generate: ## Generate Prisma client
	npm run db:generate

prisma-studio: ## Open Prisma Studio
	npx prisma studio

prisma-reset: ## Reset Prisma database
	npx prisma migrate reset --force

# Utilities
clean: ## Clean build artifacts and node_modules
	rm -rf node_modules dist coverage .nyc_output

clean-docker: ## Clean Docker containers and images
	docker-compose down --rmi all --volumes

logs: ## Show application logs
	npm run logs

health: ## Check service health
	curl -f http://localhost:4000/health || echo "Service not healthy"

# Production
prod-build: ## Build for production deployment
	npm run build
	$(MAKE) docker-build-prod

prod-deploy: ## Deploy to production (placeholder)
	@echo "Production deployment would be handled by CI/CD pipeline"

# Development helpers
setup: ## Initial project setup
	$(MAKE) install
	cp .env.example .env
	$(MAKE) docker-up
	sleep 10  # Wait for services to start
	$(MAKE) migrate
	$(MAKE) seed
	@echo ""
	@echo "✅ Setup complete! API available at:"
	@echo "   GraphQL: http://localhost:4000/graphql"
	@echo "   Health:  http://localhost:4000/health"

reset: ## Reset everything and start fresh
	$(MAKE) docker-down
	$(MAKE) clean
	$(MAKE) setup

# Monitoring
monitor: ## Start monitoring dashboard (development)
	@echo "Starting monitoring services..."
	docker-compose up -d pgadmin redis-commander
	@echo "Available at:"
	@echo "  pgAdmin:         http://localhost:5050"
	@echo "  Redis Commander: http://localhost:8081"

# Security
security-scan: ## Run security audit
	npm audit
	npm audit fix --dry-run

# Performance
perf-test: ## Run basic performance test
	@echo "Running basic performance test..."
	curl -X POST http://localhost:4000/graphql \
		-H "Content-Type: application/json" \
		-d '{"query": "query { health }"}'

# Documentation
docs: ## Generate documentation
	npm run codegen
	@echo "GraphQL schema documentation generated"