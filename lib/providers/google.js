// lib/providers/google.js — source Google Maps (Places API v1 « New »).

const BASE = 'https://places.googleapis.com/v1';

const DETAILS_FIELDS = [
  'id', 'displayName', 'formattedAddress',
  'internationalPhoneNumber', 'nationalPhoneNumber',
  'regularOpeningHours',
  'websiteUri', 'googleMapsUri', 'location',
  'primaryTypeDisplayName', 'editorialSummary',
  'photos', 'reviews',
].join(',');

const apiKey = () => process.env.GOOGLE_MAPS_API_KEY;

// Cette source sait-elle traiter cette entrée ?
function matches(input) {
  return /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/.test(input);
}

function isConfigured() {
  return Boolean(apiKey());
}

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
      'X-Goog-Api-Key': apiKey(),
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
      'X-Goog-Api-Key': apiKey(),
      'X-Goog-FieldMask': DETAILS_FIELDS,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Place Details : ${data.error?.message || res.status}`);
  return data;
}

function shape(place) {
  return {
    sources    : ['google'],
    place_id   : place.id,
    nom        : place.displayName?.text || '',
    type       : place.primaryTypeDisplayName?.text || '',
    adresse    : place.formattedAddress || '',
    telephone  : place.internationalPhoneNumber || place.nationalPhoneNumber || '',
    site_web   : place.websiteUri || '',
    horaires   : place.regularOpeningHours?.weekdayDescriptions || [],
    description: place.editorialSummary?.text || '',
    coordonnees: place.location || null,
    lien_maps  : place.googleMapsUri || '',
    instagram  : null,
    photos     : (place.photos || []).slice(0, 20).map(p => ({
      source: 'google',
      ref   : p.name,
      alt   : '',
    })),
    avis: (place.reviews || [])
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

// Point d'entrée unique : { url } | { query } | { id } → enregistrement normalisé.
async function fetchRecord({ url, query, id }) {
  if (!isConfigured()) {
    throw new Error('Source Google Maps indisponible : GOOGLE_MAPS_API_KEY absente du .env.');
  }

  let placeId = id || null;

  if (!placeId && url) {
    const isShort = /maps\.app\.goo\.gl|goo\.gl\/maps/.test(url);
    let q, coords;
    if (isShort) {
      ({ query: q, coords } = await queryFromShortLink(url));
    } else {
      const decoded = decodeURIComponent(url);
      const nm = decoded.match(/\/place\/([^/@?]+)/);
      const cm = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (!nm) throw new Error("URL Google Maps non reconnue. Essaie une recherche textuelle : « Nom Ville ».");
      q      = nm[1].replace(/\+/g, ' ').trim();
      coords = cm ? { lat: parseFloat(cm[1]), lng: parseFloat(cm[2]) } : null;
    }
    placeId = await searchPlaceId(q, coords);
  } else if (!placeId && query) {
    placeId = await searchPlaceId(query, null);
  }

  if (!placeId) throw new Error('Fournis une URL Google Maps, une requête textuelle ou un place_id.');
  return shape(await getPlaceDetails(placeId));
}

module.exports = { id: 'google', label: 'Google Maps', matches, isConfigured, fetchRecord, shape };
