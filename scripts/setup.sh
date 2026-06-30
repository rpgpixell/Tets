#!/bin/bash

# Setup script for local development

set -e

echo "🎮 Setting up Pixel RPG development environment..."

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node 18+ required"
    exit 1
fi

echo "✅ Node version: $(node -v)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Copy .env
if [ ! -f .env ]; then
    echo "📋 Copying .env.example to .env"
    cp .env.example .env
    echo "⚠️  Please edit .env with your credentials"
else
    echo "✅ .env already exists"
fi

# Run type check
echo "📝 Running type check..."
npm run type-check

echo ""
echo "✅ Setup complete!"
echo "🚀 Start development with: npm run dev"
echo "📚 Documentation: README.md"
