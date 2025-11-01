#!/bin/bash
set -e

echo "🚀 Setting up git repository and pushing to GitHub..."

# Initialize git if not already initialized
if [ ! -d .git ]; then
    echo "📦 Initializing git repository..."
    git init
fi

# Add all files (respecting .gitignore)
echo "📝 Adding files to git..."
git add .

# Check if there are any changes to commit
if git diff --cached --quiet; then
    echo "⚠️  No changes to commit. Creating initial commit..."
    git commit --allow-empty -m "Initial commit: PPP SalesMagic Connector tracking pixel system"
else
    echo "💾 Committing changes..."
    git commit -m "Initial commit: PPP SalesMagic Connector tracking pixel system

- Production-grade Cloudflare Worker tracking pixel
- D1 database integration
- Pipedrive CRM integration with delayed sync
- Comprehensive security and rate limiting
- Production logging configured
- All tests passing"
fi

# Create repository on GitHub (if it doesn't exist)
echo "🔗 Setting up GitHub remote..."
REPO_URL="https://github.com/timrecursify/ppp-salesmagic-connector.git"

# Check if remote already exists
if git remote get-url origin >/dev/null 2>&1; then
    echo "📡 Remote 'origin' already exists. Updating URL..."
    git remote set-url origin $REPO_URL
else
    echo "➕ Adding remote 'origin'..."
    git remote add origin $REPO_URL
fi

# Create repository on GitHub using gh CLI if available, otherwise provide instructions
if command -v gh &> /dev/null; then
    echo "🌐 Creating repository on GitHub..."
    gh repo create timrecursify/ppp-salesmagic-connector --public --source=. --remote=origin --push || {
        echo "⚠️  Repository might already exist or gh CLI not authenticated"
        echo "📤 Pushing to existing repository..."
        git push -u origin master || git push -u origin main
    }
else
    echo "⚠️  GitHub CLI (gh) not found. Please create the repository manually:"
    echo ""
    echo "   1. Go to: https://github.com/new"
    echo "   2. Repository name: ppp-salesmagic-connector"
    echo "   3. Set to Public (or Private if preferred)"
    echo "   4. DO NOT initialize with README, .gitignore, or license"
    echo "   5. Click 'Create repository'"
    echo ""
    echo "Then run:"
    echo "   git push -u origin master"
    echo "   (or 'git push -u origin main' if default branch is main)"
    echo ""
    read -p "Press Enter after creating the repository to continue..."
    git push -u origin master || git push -u origin main
fi

echo ""
echo "✅ Repository setup complete!"
echo "🔗 Repository URL: $REPO_URL"

