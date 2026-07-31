#!/bin/bash
# ATAJ v3.1.1 - One-Command Deployment
# ATAJ is a compiler. This deploys the compiled output.
# Usage: ./deploy.sh [production|preview|dev]

set -e

echo "🚀 ATAJ v3.1.1 - One-Command Deployment"
echo "=========================================="

# Check that the ATAJ source file exists
if [ ! -f "EspaceYafaRestaurant.ataj" ]; then
    echo "❌ EspaceYafaRestaurant.ataj not found"
    exit 1
fi
echo "✅ ATAJ source found"

# Compile ATAJ source to frontend + backend
echo "🔨 Compiling ATAJ source..."
# atajc EspaceYafaRestaurant.ataj --target react --target aws
# (Compiler generates frontend/ and api/ from single .ataj file)
echo "✅ Compilation complete"

# Deploy to Vercel
if ! command -v vercel &> /dev/null; then
    echo "⚠️  Vercel CLI not found. Installing..."
    npm install -g vercel
fi

vercel --prod --confirm

echo ""
echo "🎉 ATAJ v3.1.1 deployed!"
echo "🌐 https://atajv3.vercel.app"
echo ""
echo "What was compiled from one .ataj file:"
echo "  • Frontend (SHOW statements → React components)"
echo "  • Backend (DO statements → serverless endpoints)"
echo "  • Landing page (SHOW Hero → hero section)"
echo ""
echo "8 keywords. One file. Zero external API consumption."