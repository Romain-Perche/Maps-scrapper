# Vitrine Gen

Récupère les infos d'un établissement depuis **Google Maps** et/ou **Instagram**, et génère un prompt prêt à coller dans Claude pour créer un site vitrine HTML.

Les deux sources sont complémentaires : Maps donne les faits (adresse, horaires, avis), Instagram donne l'identité de marque (bio, ton de voix, prestations réelles, photos). On peut partir de l'une, de l'autre, ou combiner les deux pour le même établissement.

## Configuration

Crée un fichier `.env` à la racine :

```
GOOGLE_MAPS_API_KEY=…    # source Google Maps — Places API (New) activée
APIFY_TOKEN=…            # source Instagram — jeton Apify (console.apify.com → Settings → API tokens)
APIFY_ACTOR=apify~instagram-scraper   # optionnel, pour changer d'acteur
```

Chaque source fonctionne indépendamment : sans `APIFY_TOKEN` l'outil reste utilisable en mode Google Maps seul, et inversement. Les sources désactivées sont signalées au démarrage et dans l'interface.

> Le scraping Instagram passe par un acteur Apify facturé à l'usage (quelques centimes par profil). Instagram n'expose pas d'API publique équivalente à Places.

## Démarrage

```bash
node server.js
```

Ouvre **http://localhost:3000**. Aucune dépendance à installer (Node ≥ 20.12).

---

## Utilisation

### 1. Rechercher un établissement

Colle dans le champ de recherche — la source est détectée automatiquement :

| Entrée | Source |
|---|---|
| `https://maps.app.goo.gl/…` | Google Maps |
| `https://www.google.com/maps/place/…` | Google Maps |
| `Le Havane Vaucresson` (texte libre) | Google Maps |
| `https://www.instagram.com/le.havane/` | Instagram |
| `@le.havane` | Instagram |

Appuie sur **Entrée** ou clique **Rechercher**. Le scraping Instagram prend généralement 30 s à 2 min.

### 2. Combiner les deux sources

Une fois une fiche chargée, un second champ apparaît : **＋ Enrichir avec …**. Colle-y le lien de l'autre source pour le même établissement.

Les deux fiches fusionnent : Maps garde la main sur l'adresse, les horaires et les avis ; Instagram apporte la bio, le ton et les photos ; le lien en bio l'emporte comme site web. **Les champs que tu as modifiés à la main ne sont jamais écrasés.**

### 3. Compléter les données

Les champs se remplissent automatiquement. Un seul est à renseigner manuellement : **Ambiance / style souhaité** (surligné en orange) — ex. `chaleureux et rustique`, `élégant et moderne`.

Tu peux modifier n'importe quel champ avant de copier le prompt.

### 4. Photos

Les photos s'affichent en vignettes (badge `IG` / `Maps` quand les deux sources sont présentes). Clique sur une vignette pour l'agrandir.

**Télécharger les photos** produit un ZIP `nom-etablissement-photos.zip` contenant `insta-1.jpg…` et `maps-1.jpg…`. Le prompt se met alors à jour pour indiquer le dossier à joindre à Claude, et précise quelles photos portent l'identité visuelle.

> ⚠ Les URLs du CDN Instagram sont signées et expirent au bout de quelques jours : télécharge le ZIP pendant la session, pas plus tard.

### 5. Copier le prompt

Le prompt se génère en temps réel dans le panneau de droite et s'adapte aux données disponibles : sans adresse, il n'y a ni carte Maps ni `LocalBusiness` ; avec Instagram, il ajoute une section compte, un CTA « Suivre » et une consigne d'identité visuelle.

Clique **Copier**, colle-le dans Claude — avec le dossier photos si tu l'as téléchargé.

---

## Structure

```
server.js                    routeur HTTP
lib/providers/google.js      Google Places API (New)
lib/providers/instagram.js   scraper Instagram via Apify
lib/merge.js                 fusion des deux sources
lib/photos.js                résolution des URLs photo + allowlist du proxy
lib/zip.js                   écriture ZIP (méthode STORED)
lib/slug.js                  slug ASCII
index.html                   interface + constructeur de prompt
```

Ajouter une source revient à écrire un module exposant `matches()`, `isConfigured()` et `fetchRecord()` renvoyant le même objet normalisé, puis à l'ajouter à `PROVIDERS` dans `server.js`.
