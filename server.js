#!/usr/bin/env node
// server.js — UI locale pour générer des prompts de site vitrine
// Sources : Google Maps (Places API) et/ou Instagram (scraper Apify)
// Usage : node server.js  (nécessite .env — voir README)

try { process.loadEnvFile(); } catch {}

const http     = require('node:http');
const fs       = require('node:fs');
const path     = require('node:path');
const { Readable } = require('node:stream');

const { buildZip }  = require('./lib/zip');
const { slugify }   = require('./lib/slug');
const { mergeRecords } = require('./lib/merge');
const { resolvePhotoUrl, photoFilename } = require('./lib/photos');

const google    = require('./lib/providers/google');
const instagram = require('./lib/providers/instagram');
const PROVIDERS = [instagram, google];   // instagram teste en premier : plus spécifique

const PORT = process.env.PORT || 3000;
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');

// Choisit la source : explicite si fournie, sinon déduite de l'entrée.
// Le texte libre sans URL retombe sur Google (recherche « Nom Ville »).
function pickProvider(input, explicit) {
  if (explicit) {
    const p = PROVIDERS.find(p => p.id === explicit);
    if (!p) throw new Error(`Source inconnue : ${explicit}`);
    return p;
  }
  return PROVIDERS.find(p => p.matches(input || '')) || google;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { reject(new Error('Requête trop volumineuse.')); req.destroy(); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function fetchPhoto(ref, width) {
  const url = resolvePhotoUrl(ref, width);
  return fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const parsed = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && parsed.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(HTML);
  }

  // ── Sources disponibles (l'UI grise celles sans clé) ─────────────────────
  if (req.method === 'GET' && parsed.pathname === '/api/sources') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(
      PROVIDERS.map(p => ({ id: p.id, label: p.label, configured: p.isConfigured() }))
    ));
  }

  // ── Récupération d'une fiche ─────────────────────────────────────────────
  // POST /api/fetch-place  { url? , query? , id? , source? , merge_with? }
  if (req.method === 'POST' && parsed.pathname === '/api/fetch-place') {
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
    };
    try {
      const { url, query, id, source, merge_with } = JSON.parse(await readBody(req));
      const provider = pickProvider(url || query || '', source);
      let record = await provider.fetchRecord({ url, query, id });
      if (merge_with) record = mergeRecords(merge_with, record);
      send(200, record);
    } catch (err) {
      send(400, { error: err.message });
    }
    return;
  }

  // ── Proxy photo ──────────────────────────────────────────────────────────
  // GET /api/photo?ref=<places/… | https://…cdninstagram.com/…>&w=400
  if (req.method === 'GET' && parsed.pathname === '/api/photo') {
    const ref = parsed.searchParams.get('ref') || parsed.searchParams.get('name') || '';
    const w   = Math.min(1200, parseInt(parsed.searchParams.get('w') || '800', 10) || 800);
    try {
      const pr = await fetchPhoto(ref, w);
      if (!pr.ok) { res.writeHead(pr.status); return res.end(); }
      res.writeHead(200, {
        'Content-Type' : pr.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      });
      Readable.fromWeb(pr.body).pipe(res);
    } catch (err) {
      res.writeHead(400); res.end(err.message);
    }
    return;
  }

  // ── Téléchargement des photos en ZIP ─────────────────────────────────────
  // POST /api/download-zip  { photos: [{source, ref}], nom }
  if (req.method === 'POST' && parsed.pathname === '/api/download-zip') {
    try {
      const { photos, nom } = JSON.parse(await readBody(req));
      if (!Array.isArray(photos) || !photos.length) {
        res.writeHead(400); return res.end('Aucune photo.');
      }

      // Numérotation par source : maps-1, maps-2, insta-1…
      const counters = {};
      const named = photos.map((photo) => {
        const source = photo?.source === 'instagram' ? 'instagram' : 'google';
        counters[source] = (counters[source] || 0) + 1;
        return { ref: photo?.ref, filename: photoFilename({ source }, counters[source] - 1) };
      });

      const buffers = await Promise.all(named.map(async ({ ref, filename }) => {
        try {
          const pr = await fetchPhoto(ref, 1200);
          if (!pr.ok) return null;
          return { filename, data: Buffer.from(await pr.arrayBuffer()) };
        } catch { return null; }
      }));
      const files = buffers.filter(Boolean);
      if (!files.length) { res.writeHead(502); return res.end('Aucune photo téléchargeable (liens expirés ?).'); }

      res.writeHead(200, {
        'Content-Type'       : 'application/zip',
        'Content-Disposition': `attachment; filename="${slugify(nom, 'photos')}-photos.zip"`,
      });
      res.end(buildZip(files));
    } catch (err) {
      if (!res.headersSent) { res.writeHead(500); res.end(err.message); }
    }
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  for (const p of PROVIDERS) {
    if (!p.isConfigured()) console.warn(`⚠  Source ${p.label} désactivée (clé absente du .env).`);
  }
  console.log(`✓  Vitrine Gen disponible sur \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
});
