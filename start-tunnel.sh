#!/bin/sh
# Public HTTPS via Cloudflare quick tunnel (needs outbound TCP/UDP 7844 – blocked on this box as of 2026-10-20)
npx pm2 start ~/bin/cloudflared --name pelada-tunnel -- tunnel --no-autoupdate --protocol http2 --url http://localhost:8787
sleep 10; grep -ho 'https://[a-z0-9-]*\.trycloudflare\.com' ~/.pm2/logs/pelada-tunnel-*.log | tail -1
