#!/bin/bash

# Pixel RPG - Deployment Script for Railway

set -e

echo "🚀 Building Pixel RPG..."
npm install

echo "📝 Type checking..."
npm run type-check

echo "📦 Compiling TypeScript..."
npm run build

echo "✅ Build complete!"
