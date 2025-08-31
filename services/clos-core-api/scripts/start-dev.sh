#!/bin/bash

# CLOS Core API Development Startup Script

set -e

echo "🚀 Starting CLOS Core API Development Environment"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop."
    exit 1
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env from example..."
    cp .env.example .env
    echo "⚠️  Please update .env with your configuration before running again"
    exit 1
fi

# Start infrastructure services
echo "🔧 Starting infrastructure services..."
docker-compose up -d postgres redis localstack

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check if database is ready
echo "🗄️  Checking database connection..."
until docker-compose exec -T postgres pg_isready -U clos_user -d clos_db > /dev/null 2>&1; do
    echo "   Waiting for database..."
    sleep 2
done

# Run migrations
echo "🔄 Running database migrations..."
npm run db:migrate

# Check if database has data
IDEA_COUNT=$(docker-compose exec -T postgres psql -U clos_user -d clos_db -t -c "SELECT COUNT(*) FROM ideas;" 2>/dev/null | xargs || echo "0")

if [ "$IDEA_COUNT" -eq "0" ]; then
    echo "🌱 Seeding database with sample data..."
    npm run db:seed
else
    echo "✅ Database already has data ($IDEA_COUNT ideas)"
fi

# Start the development server
echo "🏃 Starting development server..."
echo "   GraphQL API: http://localhost:4000/graphql"
echo "   WebSocket:   ws://localhost:4001"
echo "   Health:      http://localhost:4000/health"
echo ""
echo "   pgAdmin:     http://localhost:5050 (admin@candlefish.ai / admin123)"
echo "   Redis UI:    http://localhost:8081"
echo ""

npm run dev