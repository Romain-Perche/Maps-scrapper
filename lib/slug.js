// lib/slug.js — slug ASCII kebab-case, partagé serveur / client.

function slugify(str, fallback = 'etablissement') {
  const slug = (str || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')   // marques combinantes issues de la décomposition NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || fallback;
}

module.exports = { slugify };
