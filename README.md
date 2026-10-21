# Soccer 2026 (Pelada) – PWA
Node + Express + Postgres (Neon, via `pg`). SPA in /public (vanilla JS, i18n in public/i18n/{pt,en,fr}.json, default pt).

## Config (env vars, or a local `.env` – never committed)
- `DATABASE_URL` – Neon **pooled** connection string (required).
- `MANAGER_PIN` – 4–8 digits; on first boot it is stored as a salted scrypt hash (can be changed later in the app).
- `PORT` – defaults to 8787.
- `PG_DRIVER=neon-ws` – optional: use Neon's pg-compatible WebSocket driver (port 443) on networks that block outbound 5432. Not needed on Render.

Schema migrations (`CREATE TABLE IF NOT EXISTS`) and the demo seed (30 fake players) run automatically on startup.
Player photos are stored in the database as data URLs; nothing depends on the local disk.

## Run
- Local: `npx pm2 start server.js --name pelada` (or `npm start`). Health check: `GET /healthz`.
- Tests: `node test/teams.test.js` (generator), `node test/api.test.js` (needs a running server; use a separate Neon branch, e.g. `test`).
- Demo history: `npm run demo:history` (3 past games + teams for the next Thursday). Delete demo players in app: Players > Delete demo.
- Legacy import: `npm run import:sqlite` copies data/pelada.db into an empty Postgres DB.
- Screens: `node tools-screens.js` -> screens/

## Deploy (Render free plan)
`render.yaml` blueprint: web service, node runtime, free plan, virginia. Set `DATABASE_URL` and `MANAGER_PIN` in the dashboard (sync: false).
