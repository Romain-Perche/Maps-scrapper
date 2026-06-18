#!/usr/bin/env node
// server.js — UI locale pour générer des prompts de site vitrine depuis Google Maps
// Usage : node server.js  (nécessite .env avec GOOGLE_MAPS_API_KEY)

try { process.loadEnvFile(); } catch {}

const http     = require('node:http');
const fs       = require('node:fs');
const fsp      = require('node:fs/promises');
const path     = require('node:path');
const { Readable } = require('node:stream');

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const BASE    = 'https://places.googleapis.com/v1';
const PORT    = process.env.PORT || 3000;

const DETAILS_FIELDS = [
  'id', 'displayName', 'formattedAddress',
  'internationalPhoneNumber', 'nationalPhoneNumber',
  'regularOpeningHours',
  'websiteUri', 'googleMapsUri', 'location',
  'primaryTypeDisplayName', 'editorialSummary',
  'photos', 'reviews',
].join(',');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');

async function queryFromShortLink(shortUrl) {
  const res      = await fetch(shortUrl, { redirect: 'follow' });
  const finalUrl = decodeURIComponent(res.url);
  const nameMatch  = finalUrl.match(/\/place\/([^/@?]+)/);
  const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const name = nameMatch ? nameMatch[1].replace(/\+/g, ' ').trim() : '';
  if (!name) throw new Error("Impossible d'extraire le nom depuis ce lien. Essaie une recherche textuelle : « Nom Ville ».");
  return {
    query: name,
    coords: coordMatch ? { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) } : null,
  };
}

async function searchPlaceId(textQuery, coords) {
  const body = { textQuery };
  if (coords) {
    body.locationBias = {
      circle: { center: { latitude: coords.lat, longitude: coords.lng }, radius: 1000 },
    };
  }
  const res = await fetch(`${BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Text Search : ${data.error?.message || res.status}`);
  if (!data.places?.length) throw new Error(`Aucun lieu trouvé pour « ${textQuery} ».`);
  return data.places[0].id;
}

async function getPlaceDetails(placeId) {
  const res = await fetch(`${BASE}/places/${placeId}?languageCode=fr`, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': DETAILS_FIELDS,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Place Details : ${data.error?.message || res.status}`);
  return data;
}

function shape(place) {
  return {
    place_id  : place.id,
    nom       : place.displayName?.text || '',
    type      : place.primaryTypeDisplayName?.text || '',
    adresse   : place.formattedAddress || '',
    telephone : place.internationalPhoneNumber || place.nationalPhoneNumber || '',
    site_web  : place.websiteUri || '',
    horaires  : place.regularOpeningHours?.weekdayDescriptions || [],
    description: place.editorialSummary?.text || '',
    coordonnees: place.location || null,
    lien_maps : place.googleMapsUri || '',
    photos    : (place.photos || []).slice(0, 10).map(p => p.name),
    avis      : (place.reviews || [])
      .filter(r => (r.rating || 0) >= 4)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 3)
      .map(r => ({
      auteur: r.authorAttribution?.displayName || 'Anonyme',
      note  : r.rating || 5,
      texte : (r.text?.text || '').replace(/\n+/g, ' '),
    })),
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(HTML);
  }

  if (req.method === 'POST' && req.url === '/api/fetch-place') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const send = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(obj));
      };
      try {
        const { url: inputUrl, query: inputQuery, id: inputId } = JSON.parse(body);
        let placeId = inputId || null;

        if (!placeId && inputUrl) {
          const isShort = /maps\.app\.goo\.gl|goo\.gl\/maps/.test(inputUrl);
          let query, coords;
          if (isShort) {
            ({ query, coords } = await queryFromShortLink(inputUrl));
          } else {
            const decoded = decodeURIComponent(inputUrl);
            const nm = decoded.match(/\/place\/([^/@?]+)/);
            const cm = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
            if (!nm) throw new Error("URL Google Maps non reconnue. Essaie une recherche textuelle : « Nom Ville ».");
            query  = nm[1].replace(/\+/g, ' ').trim();
            coords = cm ? { lat: parseFloat(cm[1]), lng: parseFloat(cm[2]) } : null;
          }
          placeId = await searchPlaceId(query, coords);
        } else if (!placeId && inputQuery) {
          placeId = await searchPlaceId(inputQuery, null);
        }

        if (!placeId) throw new Error('Fournis une URL Google Maps, une requête textuelle ou un place_id.');
        send(200, shape(await getPlaceDetails(placeId)));
      } catch (err) {
        send(400, { error: err.message });
      }
    });
    return;
  }

  // ── Proxy photo ──────────────────────────────────────────────────────────
  // GET /api/photo?name=places/…/photos/…&w=400
  const parsed = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && parsed.pathname === '/api/photo') {
    const name = parsed.searchParams.get('name') || '';
    const w    = Math.min(1200, parseInt(parsed.searchParams.get('w') || '800', 10));
    if (!name.startsWith('places/')) { res.writeHead(400); return res.end('Invalid name'); }
    try {
      const pr = await fetch(`${BASE}/${name}/media?maxWidthPx=${w}&key=${API_KEY}`, { redirect: 'follow' });
      if (!pr.ok) { res.writeHead(pr.status); return res.end(); }
      res.writeHead(200, {
        'Content-Type': pr.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      });
      Readable.fromWeb(pr.body).pipe(res);
    } catch (err) { res.writeHead(500); res.end(err.message); }
    return;
  }

  // ── Download photos to disk ───────────────────────────────────────────────
  // POST /api/download-photos  body: { photos: [names], nom: string }
  if (req.method === 'POST' && req.url === '/api/download-photos') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const send = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(obj));
      };
      try {
        const { photos, nom, folder_path } = JSON.parse(body);
        if (!Array.isArray(photos) || !photos.length) throw new Error('Aucune photo à télécharger.');

        let folder;
        if (folder_path && folder_path.trim()) {
          folder = path.isAbsolute(folder_path.trim())
            ? folder_path.trim()
            : path.resolve(__dirname, folder_path.trim());
        } else {
          const slug = (nom || 'etablissement')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          folder = path.join(__dirname, 'photos', slug);
        }
        await fsp.mkdir(folder, { recursive: true });

        let saved = 0;
        await Promise.all(photos.map(async (name, i) => {
          if (!name.startsWith('places/')) return;
          const pr = await fetch(`${BASE}/${name}/media?maxWidthPx=1200&key=${API_KEY}`, { redirect: 'follow' });
          if (!pr.ok) return;
          const buf = Buffer.from(await pr.arrayBuffer());
          await fsp.writeFile(path.join(folder, `photo-${i + 1}.jpg`), buf);
          saved++;
        }));

        send(200, { folder, count: saved });
      } catch (err) {
        send(400, { error: err.message });
      }
    });
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  if (!API_KEY) console.warn('⚠  GOOGLE_MAPS_API_KEY non définie dans .env — les appels API échoueront.');
  console.log(`✓  Vitrine Gen disponible sur \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
});
