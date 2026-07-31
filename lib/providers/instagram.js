// lib/providers/instagram.js — source Instagram via un acteur Apify.
//
// Instagram n'expose pas d'API publique équivalente à Places : on passe par un
// scraper hébergé, appelé en REST (aucun SDK, aucune dépendance).

const APIFY_BASE  = 'https://api.apify.com/v2';
const MAX_POSTS   = 20;   // publications récupérées
const MAX_PHOTOS  = 20;   // photos retenues (photo de profil incluse)
const CAPTION_MAX = 400;  // troncature d'une caption dans le prompt
const TIMEOUT_MS  = 180_000;

// Segments d'URL qui ne sont pas des noms de compte.
const RESERVED = new Set([
  'p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts',
  'direct', 'about', 'developer', 'legal', 'privacy', 'web',
]);

const token = () => process.env.APIFY_TOKEN;
const actor = () => process.env.APIFY_ACTOR || 'apify~instagram-scraper';

function matches(input) {
  return /instagram\.com/i.test(input) || /^@[A-Za-z0-9._]+$/.test(input.trim());
}

function isConfigured() {
  return Boolean(token());
}

// « https://www.instagram.com/le.havane/reel/xyz », « @le.havane », « le.havane » → « le.havane »
function parseHandle(input) {
  const raw = (input || '').trim();
  if (!raw) throw new Error('Fournis un lien ou un nom de compte Instagram.');

  let handle = '';
  const m = raw.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (m) {
    handle = m[1];
  } else if (/^@?[A-Za-z0-9._]+$/.test(raw)) {
    handle = raw.replace(/^@/, '');
  }

  handle = handle.replace(/\/+$/, '');
  if (!handle || RESERVED.has(handle.toLowerCase())) {
    throw new Error("Lien Instagram non reconnu. Utilise l'URL du profil : instagram.com/nom_du_compte");
  }
  return handle;
}

async function runActor(handle) {
  const url = `${APIFY_BASE}/acts/${actor()}/run-sync-get-dataset-items?token=${encodeURIComponent(token())}`;
  const input = {
    directUrls   : [`https://www.instagram.com/${handle}/`],
    resultsType  : 'details',
    resultsLimit : MAX_POSTS,
    addParentData: false,
  };

  let res;
  try {
    res = await fetch(url, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify(input),
      signal : AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error("Le scraper Instagram n'a pas répondu à temps (3 min). Réessaie dans un instant.");
    }
    throw new Error(`Appel Apify impossible : ${err.message}`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error('APIFY_TOKEN invalide ou sans accès à cet acteur.');
  }
  if (res.status === 402) {
    throw new Error('Crédit Apify épuisé.');
  }
  if (res.status === 429) {
    throw new Error('Trop de requêtes Apify. Attends une minute avant de réessayer.');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Apify a renvoyé ${res.status}${detail ? ' : ' + detail.slice(0, 200) : ''}`);
  }

  const items = await res.json();
  if (!Array.isArray(items) || !items.length) {
    throw new Error(`Aucune donnée renvoyée pour @${handle}. Le compte existe-t-il et est-il public ?`);
  }

  // L'acteur peut renvoyer une entrée d'erreur au lieu du profil.
  const profile = items.find(it => it && (it.username || it.id)) || items[0];
  if (profile.error || profile.errorDescription) {
    throw new Error(profile.errorDescription || profile.error);
  }
  if (profile.private) {
    throw new Error(`Le compte @${handle} est privé : ses publications ne sont pas accessibles.`);
  }
  return profile;
}

function topHashtags(posts, limit = 8) {
  const counts = new Map();
  for (const p of posts) {
    for (const tag of p.hashtags || []) {
      const t = String(tag).replace(/^#/, '').toLowerCase();
      if (t) counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

function truncate(str, max) {
  const clean = String(str || '').replace(/\s*\n+\s*/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + '…' : clean;
}

function collectPhotos(profile, posts) {
  const photos = [];
  const seen   = new Set();

  const push = (ref, alt) => {
    if (!ref || seen.has(ref) || photos.length >= MAX_PHOTOS) return;
    seen.add(ref);
    photos.push({ source: 'instagram', ref, alt: alt || '' });
  };

  push(profile.profilePicUrlHD || profile.profilePicUrl, 'Photo de profil');

  for (const p of posts) {
    if (p.type === 'Video') continue;          // on ne garde que les images
    push(p.displayUrl, truncate(p.caption, 60));
    for (const child of p.childPosts || []) {  // carrousels
      if (child.type !== 'Video') push(child.displayUrl, truncate(p.caption, 60));
    }
  }
  return photos;
}

function shape(profile) {
  const posts = (profile.latestPosts || []).slice(0, MAX_POSTS);
  const handle = profile.username || '';

  const captions = posts
    .filter(p => (p.caption || '').trim())
    .map(p => ({
      texte      : truncate(p.caption, CAPTION_MAX),
      hashtags   : (p.hashtags || []).map(t => String(t).replace(/^#/, '')),
      likes      : p.likesCount > 0 ? p.likesCount : 0,
      commentaires: p.commentsCount > 0 ? p.commentsCount : 0,
      date       : p.timestamp || '',
    }));

  return {
    sources    : ['instagram'],
    place_id   : '',
    nom        : profile.fullName || handle,
    type       : profile.businessCategoryName || profile.categoryName || '',
    adresse    : '',                                   // pas d'équivalent Instagram
    telephone  : profile.publicPhoneNumber || profile.businessPhoneNumber || '',
    site_web   : profile.externalUrl || '',
    horaires   : [],                                   // pas d'équivalent Instagram
    description: profile.biography || '',
    coordonnees: null,
    lien_maps  : '',
    avis       : [],                                   // pas d'équivalent Instagram
    photos     : collectPhotos(profile, posts),
    instagram  : {
      handle,
      url         : profile.url || (handle ? `https://www.instagram.com/${handle}/` : ''),
      bio         : profile.biography || '',
      followers   : profile.followersCount || 0,
      posts_count : profile.postsCount || profile.igtvVideoCount || 0,
      categorie   : profile.businessCategoryName || profile.categoryName || '',
      verifie     : Boolean(profile.verified),
      lien_bio    : profile.externalUrl || '',
      email_pro   : profile.publicEmail || profile.businessEmail || '',
      tel_pro     : profile.publicPhoneNumber || profile.businessPhoneNumber || '',
      captions,
      hashtags_frequents: topHashtags(posts),
    },
  };
}

async function fetchRecord({ url, query }) {
  if (!isConfigured()) {
    throw new Error('Source Instagram indisponible : APIFY_TOKEN absent du .env.');
  }
  const handle = parseHandle(url || query);
  return shape(await runActor(handle));
}

module.exports = {
  id: 'instagram', label: 'Instagram',
  matches, isConfigured, fetchRecord, shape, parseHandle,
};
