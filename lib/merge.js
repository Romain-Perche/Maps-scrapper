// lib/merge.js — fusion de deux enregistrements portant sur le même établissement.
//
// Règle : pour chaque type d'info, la source la plus fiable gagne ; on ne
// remplace jamais une valeur présente par une valeur vide.
//   Google Maps → les faits (adresse, horaires, avis, coordonnées)
//   Instagram   → l'identité de marque (bio, ton, photos, lien en bio)

const first = (...vals) => vals.find(v => v !== undefined && v !== null && v !== '') || '';

function mergeRecords(a, b) {
  if (!a) return b;
  if (!b) return a;

  const byId = { [a.sources?.[0] || 'google']: a, [b.sources?.[0] || 'google']: b };
  const g = byId.google    || {};
  const i = byId.instagram || {};

  // Ordre stable quel que soit le sens de la fusion.
  const seen = new Set([...(a.sources || []), ...(b.sources || [])]);
  const sources = ['google', 'instagram'].filter(s => seen.has(s));

  return {
    sources,
    place_id   : first(g.place_id, i.place_id),
    nom        : first(g.nom, i.nom),
    type       : first(g.type, i.type),
    adresse    : first(g.adresse, i.adresse),
    telephone  : first(g.telephone, i.telephone),
    // Le lien en bio Instagram est plus souvent le vrai site que le champ Maps.
    site_web   : first(i.site_web, g.site_web),
    horaires   : (g.horaires?.length ? g.horaires : i.horaires) || [],
    description: first(g.description, i.description),
    coordonnees: g.coordonnees || i.coordonnees || null,
    lien_maps  : first(g.lien_maps, i.lien_maps),
    avis       : (g.avis?.length ? g.avis : i.avis) || [],
    instagram  : i.instagram || g.instagram || null,
    // Instagram d'abord : ce sont les photos qui portent la charte de la marque.
    photos     : [...(i.photos || []), ...(g.photos || [])],
  };
}

module.exports = { mergeRecords };
