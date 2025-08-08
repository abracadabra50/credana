#!/bin/bash

# Credana Complete System Startup Script

echo "🚀 Starting Credana System..."
echo "================================"

# Check if Redis is installed
if ! command -v redis-server &> /dev/null; then
    echo "❌ Redis not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install redis
    else
        echo "Please install Redis manually"
        exit 1
    fi
fi

# Start Redis in background
echo "1️⃣ Starting Redis..."
redis-server --daemonize yes
sleep 2

# Check if Redis is running
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is running"
else
    echo "❌ Redis failed to start"
    exit 1
fi

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "2️⃣ Creating .env file..."
    cat > .env << 'EOF'
# Lithic
LITHIC_API_KEY=52c3f4c0-3c59-40ef-a03b-e628cbb398db
LITHIC_WEBHOOK_SECRET=test_secret_123
LITHIC_OPERATING_ACCOUNT=acct_test_operating
LITHIC_ISSUING_ACCOUNT=acct_test_issuing

# Circle (placeholder - get from dashboard)
CIRCLE_API_KEY=test_circle_api_key
CIRCLE_USDC_WALLET_ID=wallet_usdc_test
CIRCLE_USD_WALLET_ID=wallet_usd_test
CIRCLE_BANK_BENEFICIARY_ID=ben_test

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet
PROGRAM_ID=BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4
TREASURY_WALLET=6xsZeTcpY1GLFcEJ6kqtxApgdVW8cXgZJztkc2tbn2pM

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Treasury
BANK_TIMEZONE=America/New_York
NODE_ENV=development
PORT=3001
EOF
    echo "✅ .env created (update with real values)"
fi

# Start backend
echo "3️⃣ Starting Backend API..."
npm run build 2>/dev/null || echo "No build script"

# Check if we have the production server
if [ -f "src/production-server.ts" ]; then
    echo "Starting production server..."
    npx tsx src/production-server.ts &
elif [ -f "test-server.js" ]; then
    echo "Starting test server..."
    node test-server.js &
else
    echo "Starting default server..."
    npm start &
fi

BACKEND_PID=$!
echo "✅ Backend started (PID: $BACKEND_PID)"

# Wait for backend to be ready
echo "Waiting for backend..."
for i in {1..10}; do
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        echo "✅ Backend is ready"
        break
    fi
    sleep 2
done

# Start frontend
echo "4️⃣ Starting Frontend..."
cd ../frontend

# Create frontend .env if needed
if [ ! -f .env.local ]; then
    cat > .env.local << 'EOF'
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4
EOF
fi

npm run dev &
FRONTEND_PID=$!
echo "✅ Frontend started (PID: $FRONTEND_PID)"

# Monitor Solana logs in new terminal
echo "5️⃣ Starting Solana monitor..."
osascript -e 'tell app "Terminal" to do script "solana logs BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4 -u devnet"' 2>/dev/null || \
    echo "Please run in new terminal: solana logs BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4 -u devnet"

echo ""
echo "================================"
echo "✅ CREDANA SYSTEM STARTED!"
echo "================================"
echo ""
echo "📊 Services:"
echo "  • Redis:    redis://localhost:6379"
echo "  • Backend:  http://localhost:3001"
echo "  • Frontend: http://localhost:3000"
echo "  • Health:   http://localhost:3001/health"
echo ""
echo "🛑 To stop all services:"
echo "  kill $BACKEND_PID $FRONTEND_PID && redis-cli shutdown"
echo ""
echo "📱 Open http://localhost:3000 to start testing!"
echo ""

# Keep script running
wait 