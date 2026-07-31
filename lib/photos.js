// lib/photos.js — résolution d'une référence photo en URL réellement téléchargeable.
//
// Une référence est soit :
//   - un resource name Google Places : "places/ChIJ…/photos/AeJ…"
//   - une URL https du CDN Instagram/Meta
//
// Le serveur renvoie `Access-Control-Allow-Origin: *` : sans allowlist ce proxy
// deviendrait un proxy ouvert utilisable par n'importe quelle page web.
const ALLOWED_HOSTS = [
  /(^|\.)cdninstagram\.com$/,
  /(^|\.)fbcdn\.net$/,
];

function resolvePhotoUrl(ref, width = 1200) {
  if (typeof ref !== 'string' || !ref) throw new Error('Référence photo vide.');

  if (ref.startsWith('places/')) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) throw new Error('GOOGLE_MAPS_API_KEY non définie.');
    return `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=${width}&key=${key}`;
  }

  let u;
  try { u = new URL(ref); } catch { throw new Error('Référence photo invalide.'); }
  if (u.protocol !== 'https:') throw new Error('Protocole refusé.');
  if (!ALLOWED_HOSTS.some(re => re.test(u.hostname))) throw new Error('Hôte non autorisé.');
  return ref;   // le CDN Instagram sert une taille fixe, pas de paramètre de largeur
}

// Nom de fichier dans le ZIP : préfixé par source pour que le prompt puisse s'y référer.
function photoFilename(photo, index) {
  const prefix = photo.source === 'instagram' ? 'insta' : 'maps';
  return `${prefix}-${index + 1}.jpg`;
}

module.exports = { resolvePhotoUrl, photoFilename, ALLOWED_HOSTS };
