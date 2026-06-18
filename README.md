# Vitrine Gen

Récupère les infos d'un établissement depuis Google Maps et génère un prompt prêt à coller dans Claude pour créer un site vitrine HTML.

## Démarrage

```bash
node server.js
```

Ouvre **http://localhost:3000**.

---

## Utilisation

### 1. Rechercher un établissement

Colle dans le champ de recherche :
- un lien court Maps : `https://maps.app.goo.gl/…`
- une URL complète Maps : `https://www.google.com/maps/place/…`
- un nom en texte libre : `Le Havane Vaucresson`

Appuie sur **Entrée** ou clique **Rechercher**.

### 2. Compléter les données

Les champs se remplissent automatiquement. Un seul est à renseigner manuellement : **Ambiance / style souhaité** (surligné en orange) — ex. `chaleureux et rustique`, `élégant et moderne`.

Tu peux modifier n'importe quel champ avant de copier le prompt.

### 3. Photos

Les photos de l'établissement s'affichent en vignettes. Clique sur une vignette pour l'agrandir.

Clique **Télécharger les X photos** pour les sauvegarder dans `photos/nom-etablissement/`. Le prompt se met alors à jour pour indiquer le dossier à joindre à Claude.

### 4. Copier le prompt

Le prompt se génère en temps réel dans le panneau de droite. Clique **Copier**, colle-le dans Claude — avec le dossier photos si tu l'as téléchargé.
