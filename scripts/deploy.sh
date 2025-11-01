#!/bin/bash

# PPP Tracking Pixel - Safe Deployment Script
# Ensures database bindings are available and system is working

set -e

echo "🚀 PPP Tracking Pixel Deployment"
echo "================================="

# Deploy with production environment
echo "📦 Deploying with production environment..."
npx wrangler deploy --env production

echo ""
echo "⏳ Waiting for deployment to propagate..."
sleep 5

# Test database connection
echo "🔍 Testing database connection..."
RESPONSE=$(curl -s "https://pixel.salesmagic.us/api/track/debug/recent")

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "✅ Database connection working"
    
    # Show current stats
    echo "📊 Current system stats:"
    echo "$RESPONSE" | jq '.debug_info'
    
else
    echo "❌ Database connection failed!"
    echo "Response: $RESPONSE"
    exit 1
fi

# Test tracking endpoint
echo ""
echo "🧪 Testing tracking endpoint..."
TEST_RESPONSE=$(curl -s -X POST "https://pixel.salesmagic.us/api/track/track" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Deployment-Test" \
  -d '{
    "pixel_id": "pixel1-b76fcf0b-3e65-4e16-8788-925f20a5a8ce",
    "page_url": "https://www.preciouspicspro.com/test",
    "visitor_cookie": "pxl_1234567890abcdef",
    "utm_source": "deployment-test"
  }')

if echo "$TEST_RESPONSE" | grep -q '"success":true'; then
    echo "✅ Tracking endpoint working"
    TRACKING_ID=$(echo "$TEST_RESPONSE" | jq -r '.tracking_id')
    echo "   Test tracking ID: $TRACKING_ID"
else
    echo "❌ Tracking endpoint failed!"
    echo "Response: $TEST_RESPONSE"
    exit 1
fi

echo ""
echo "🎉 Deployment successful and validated!"
echo "💡 Monitor real-time: npx wrangler tail --format=pretty" 