// A tiny local server for real-browser checks: serves public/ and runs the real Worker over an in-memory D1.
// Used by shots.mjs. Not part of `npm test`.
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';
import { makeDb } from '../helpers/d1.mjs';
import worker from '../../src/index.js';

const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));
export const SEEDS = ['questions-450.sql', 'seed-new-types.sql', 'seed-new-types-extra.sql'];
export const SECRETS = { teacher_user: 'admin', teacher_password: 'adminpw-123' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

export async function startServer(port = 0) {
  const { db, d1 } = makeDb({ seeds: SEEDS });
  const env = { DB: d1, ...SECRETS, ASSETS: { fetch: () => new Response('no', { status: 404 }) } };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/api/')) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        // The Worker shuffles questions with Math.random. Give it a steady sequence for the length of each call so
        // pictures come out the same every run (and put the real one back for the browser tooling).
        const real = Math.random;
        let seed = 987654321;
        Math.random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
        let r;
        try {
          r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env, { waitUntil() {} });
        } finally {
          Math.random = real;
        }
        res.writeHead(r.status, Object.fromEntries(r.headers));
        return res.end(Buffer.from(await r.arrayBuffer()));
      }
      let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
      if (p === '/' || p === '') p = '/index.html';
      const file = join(PUBLIC, p);
      if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { server, db, env, url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise((r) => server.close(r)) };
}
