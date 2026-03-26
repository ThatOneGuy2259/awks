#!/bin/bash

# Start script for awks3 application
# Runs frontend, backend, and required services

set -e

echo "🚀 Starting awks3 application..."

# Function to cleanup background processes
cleanup() {
    echo "🛑 Shutting down services..."
    jobs -p | xargs -r kill
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start Docker services (PostgreSQL and Redis)
echo "📦 Starting Docker services..."
docker-compose up -d

# Wait a moment for services to be ready
sleep 3

# Start backend
echo "🔧 Starting Go backend..."
cd backend
go run cmd/server/main.go &
BACKEND_PID=$!
cd ..

# Start frontend
echo "🎨 Starting Vite frontend..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo "✅ All services started!"
echo "📱 Frontend: http://localhost:5173"
echo "🔌 Backend: http://localhost:8080"
echo "📊 PostgreSQL: localhost:5432"
echo "🗃️  Redis: localhost:6379"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for any background process to finish
wait
