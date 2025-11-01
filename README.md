# PPP Tracking Pixel System

## 🚨 CRITICAL DEPLOYMENT INSTRUCTIONS

**ALWAYS deploy with the production environment:**

```bash
# ✅ CORRECT - Includes database binding
npx wrangler deploy --env production

# ❌ WRONG - Missing database binding
npx wrangler deploy
```

**Verify deployment includes bindings:**
- D1 Databases: `DB: ppp-tracking-db`
- KV Namespaces: `CACHE`
- Durable Objects: `RATE_LIMITER`

**Test after deployment:**
```bash
curl -s "https://pixel.salesmagic.us/api/track/debug/recent" | jq '.debug_info'
```

---

# Pixel Tracking System

Production-grade website tracking pixel system for PPP (Precious Pics Pro) project.

## Architecture
- Docker-based containerized system
- Node.js 18 API server
- PostgreSQL 15 database
- Redis caching
- nginx reverse proxy with SSL

## Quick Start
```bash
# Set environment variables
cp .env.example .env
# Edit .env with production values

# Start services
docker-compose up -d

# Check status
docker-compose ps
```

## Components
- **API**: Node.js tracking endpoints
- **Database**: PostgreSQL with automated backups
- **Proxy**: nginx with SSL termination
- **Pixel**: Lightweight JavaScript tracking script

## Domain
- Production: https://pixel.precioupicspro.com
- Webhook: https://hooks.zapier.com/hooks/catch/1243246/uo53jk3/ 