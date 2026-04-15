<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent Cron Setup

## Cloudflare Workers Cron Job

Agents run automatically every minute via a Cloudflare Worker.

### Setup

1. **Deploy the worker:**
```bash
cd workers/ase-cron
npm install
wrangler deploy
```

2. **Configure secrets:**
```bash
wrangler secret put PAGES_FUNCTION_URL
# Enter: https://your-pages-site.com/api/cron/run-agents

wrangler secret put CRON_SECRET
# Enter: 9f3c2b7a1e8d4c6f0a2b9e7d1c4f8a6b
```

3. **Verify it's working:**
Check Cloudflare Dashboard > Workers > ase-cron > Logs

### Files

- `workers/ase-cron/wrangler.toml` - Worker config with cron schedule
- `workers/ase-cron/src/index.ts` - Cron handler
