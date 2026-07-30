#!/bin/bash
# ATAJ v3.1.1 Automatic Deployment Script
# Deploys ATAJ apps to Vercel automatically from any git branch or tag
# Usage: ./deploy.sh [environment]
#   environments: production (default), preview, dev

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ENVIRONMENT="${1:-production}"
CONFIG_FILE="${SCRIPT_DIR}/vercel.json"

echo "🚀 ATAJ v3.1.1 - Automatic Deployment"
echo "======================================"
echo "Environment: $ENVIRONMENT"
echo "Config: $CONFIG_FILE"
echo ""

# Verify build artifacts exist
echo "🔍 Verifying build artifacts..."
if [ ! -f "api/ataj-runtime.js" ]; then
    echo "❌ ataj-runtime.js not found"
    exit 1
fi
echo "✅ Runtime found"

if [ ! -d "frontend" ]; then
    echo "❌ frontend/ directory not found"
    exit 1
fi
echo "✅ Frontend found"

if [ ! -f "vercel.json" ]; then
    echo "❌ vercel.json not found"
    echo "💡 Run './deploy.sh init' to generate configuration files"
    exit 1
fi
echo "✅ Vercel config found"

if [ ! -f "package.json" ]; then
    echo "❌ package.json not found"
    exit 1
fi
echo "✅ Package config found"

# Check for Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "⚠️  Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Deploy based on environment
case "$ENVIRONMENT" in
    production)
        echo ""
        echo "📦 Deploying to PRODUCTION..."
        vercel --prod --confirm
        echo ""
        echo "✅ Production deployment complete!"
        echo "💡 Visit https://atajv3.vercel.app to verify"
        ;;
    preview)
        echo ""
        echo "📦 Deploying to PREVIEW..."
        vercel --preview --confirm
        echo ""
        echo "✅ Preview deployment complete!"
        ;;
    dev)
        echo ""
        echo "📦 Deploying to DEV..."
        vercel dev
        ;;
    init)
        echo "📦 Initializing ATAJ project configuration..."
        if [ ! -f "vercel.json" ]; then
            cat > vercel.json << 'EOF'
{
  "version": 2,
  "builds": [
    { "src": "api/ataj-runtime.js", "use": "@vercel/node" },
    { "src": "frontend/**", "use": "@vercel/static" },
    { "src": "examples/**", "use": "@vercel/static" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/ataj-runtime.js" },
    { "src": "/api", "dest": "/api/ataj-runtime.js" },
    { "src": "/(.*)", "dest": "/frontend/$1" },
    { "src": "/", "dest": "/frontend/index.html" }
  ]
}
EOF
            echo "✅ vercel.json created"
        fi
        
        if [ ! -f "package.json" ]; then
            cat > package.json << 'EOF'
{
  "name": "ataj-app",
  "version": "3.1.1",
  "description": "ATAJ v3.1.1 - The 8-Keyword Language That Survives 80 Apocalypses",
  "main": "api/ataj-runtime.js",
  "scripts": {
    "dev": "vercel dev",
    "build": "echo 'ATAJ build complete'",
    "start": "node api/ataj-runtime.js",
    "deploy": "./deploy.sh production",
    "deploy:preview": "./deploy.sh preview",
    "deploy:dev": "./deploy.sh dev",
    "test": "./stress-test.sh",
    "audit": "curl https://$VERCEL_URL/api/audit"
  },
  "keywords": ["ataj", "v3", "luxury", "ecommerce", "multi-cloud"],
  "license": "MIT",
  "dependencies": {},
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF
            echo "✅ package.json created"
        fi
        
        if [ ! -f ".vercelignore" ]; then
            cat > .vercelignore << 'EOF'
# ATAJ - Ignore non-essential files for deployment
.git/*
node_modules/*
compiler/src/*.rs
compiler/Cargo.toml
compiler/Cargo.lock
tests/
docs/
*.md
!.vercel/
EOF
            echo "✅ .vercelignore created"
        fi
        
        echo ""
        echo "✅ Initialization complete!"
        echo "💡 Run './deploy.sh production' to deploy"
        ;;
    status)
        echo ""
        echo "📋 ATAJ Deployment Status"
        echo "========================"
        echo "Runtime: ataj-runtime.js - $(wc -c < api/ataj-runtime.js) bytes"
        echo "Frontend: frontend/ - $(ls frontend/ | wc -l) files"
        echo "ATAJ Sources: $(ls api/*.ataj 2>/dev/null | wc -l) files"
        echo "Vercel Config: $(test -f vercel.json && echo '✅ present' || echo '❌ missing')"
        echo "Package Config: $(test -f package.json && echo '✅ present' || echo '❌ missing')"
        echo ""
        echo "💡 Run './deploy.sh production' to deploy"
        ;;
    *)
        echo "❌ Unknown environment: $ENVIRONMENT"
        echo "Valid environments: production, preview, dev, init, status"
        exit 1
        ;;
esac

echo ""
echo "🎉 ATAJ deployment complete!"
echo "   Language: 8 keywords forever frozen"
echo "   Status: Production-ready"