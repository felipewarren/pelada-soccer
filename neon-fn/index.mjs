// Neon Functions entry: runs the Express app on a local port inside the function and proxies fetch() Requests to it.
process.env.PG_DRIVER = process.env.PG_DRIVER || 'neon-ws';
import srv from '../server.js';
const { app, init } = srv;
let ready;
function start() {
  if (!ready) ready = init().then(() => new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s.address().port)); }));
  return ready;
}
async function handler(request) {
  const port = await start();
  const u = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.set('x-forwarded-host', u.host); headers.set('x-forwarded-proto', 'https');
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const res = await fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`, {
    method: request.method, headers, body: hasBody ? await request.arrayBuffer() : undefined, redirect: 'manual',
  });
  const h = new Headers(res.headers); h.delete('content-encoding'); h.delete('content-length'); h.delete('transfer-encoding');
  return new Response(request.method === 'HEAD' ? null : await res.arrayBuffer(), { status: res.status, headers: h });
}
export default { fetch: handler };
