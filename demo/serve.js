#!/usr/bin/env node
/* ---------------------------------------------------------------------------
 * serve.js — static server for demo development
 *
 *   node demo/serve.js [port]
 *
 * ES modules cannot be imported over file://, so the unbundled source in
 * demo/ needs an HTTP origin to run from. This is that, in one file with no
 * dependencies, so `npm install` is never required to work on this.
 *
 * For showing the demo, prefer the built single file at the repo root — it
 * needs no server at all. See demo/build.js.
 * ------------------------------------------------------------------------- */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'Content-Type',
    }).end();
    return;
  }

  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const file = path.join(ROOT, rel);

  // Refuse to serve anything outside demo/, even via a crafted path.
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found: ' + rel);
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      // Allow the demo to be embedded from another local development origin.
      'access-control-allow-origin': '*',
      // Never cache during development, or an edit appears not to have landed.
      'cache-control': 'no-store',
    }).end(body);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  SatQuery AI — demo (development)`);
  console.log(`  http://127.0.0.1:${PORT}\n`);
  console.log(`  Ctrl+C to stop. For the offline single file: node demo/build.js\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`port ${PORT} is busy — try: node demo/serve.js ${PORT + 1}`);
    process.exit(1);
  }
  throw err;
});
