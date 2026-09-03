# Melomania 🎧

> **Plateforme sociale de partage, d’annotation et de discussion musicale**  
> *Partagez une musique ou une playlist, commentez à un timecode précis, mentionnez vos proches et exportez vers Spotify / Apple Music.*

---

## ✨ Fonctionnalités principales

1. **Partage Musical fluide** :
   - Import direct depuis des liens **YouTube** et **YouTube Music** (morceaux individuels ou playlists).
   - Prévisualisation instantanée des métadonnées (titre, artiste, pochette, durée estimée).
   - Options de visibilité (`Public` / `Privé`) et support des tags.

2. **Annotations temporelles & Commentaires précis** :
   - **Commentaire ancré à un timecode précis** (ex: `1:32`).
   - Clic sur un commentaire ou un marqueur de la timeline pour **repositionner instantanément le lecteur**.
   - Réponses imbriquées, réactions emojis (`🔥`, `❤️`, `🎷`, `🎸`, `✨`).
   - Modification et suppression de ses propres commentaires.

3. **Système de Mentions `@`** :
   - Déclenchement de l'autocomplétion en tapant `@` dans les commentaires.
   - Suggestions en temps réel pour les **utilisateurs**, **morceaux** et **playlists**.
   - Badges cliquables redirigeant vers les profils et fiches de morceaux.

4. **Correspondance et Export vers Spotify & Apple Music** :
   - Moteur de calcul de confiance (Score de 0 à 100%) basé sur la similarité textuelle, la durée et la détection de version (*Radio Edit, Live, Remix, Acoustique, Album*).
   - Interface de désambiguïsation visuelle avec seuils configurables (`≥90% automatique`, `70-89% confirmation`, `<70% incertain`).
   - Création de playlists externes et rapport d'exportation avec lien direct.

5. **Interface Premium & Responsive (Desktop & Mobile)** :
   - Thème sombre soigné avec contrastes accessibles, glassmorphism et touches néon violettes/turquoises.
   - Layout 3 panneaux sur grand écran (Navigation | Fil | Lecteur Contextuel).
   - Barre de navigation tactile inférieure et design mobile-first sans perte de fonctionnalités.

6. **Sécurité & Modération** :
   - Chiffrement côté serveur en **AES-256** de tous les tokens d'accès OAuth (jamais exposés au client).
   - Centre de modération administratif pour traiter les signalements de la communauté.
   - Sélecteur de profils démo instantané pour tester les interactions multi-utilisateurs.

---

## 🚀 Démarrage rapide

### 1. Installation des dépendances
```bash
npm install
```

### 2. Lancement en développement
```bash
npm run dev
```
Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur.

### 3. Exécution des tests unitaires
```bash
npm test
```

### 4. Build de production
```bash
npm run build
```

---

## 👥 Comptes de démonstration pré-configurés

Pour faciliter vos tests et la navigation, plusieurs profils avec historique et commentaires sont inclus :

| Utilisateur | Identifiant | Rôle | Spécialité |
| :--- | :--- | :--- | :--- |
| **Marie Laurent** | `marie` | Administrateur | French Touch, Synthpop, curatrice de playlists |
| **Thomas Dubois** | `thomas` | Utilisateur | Groove, Funk, analyse de mixage |
| **Clara Moreau** | `clara` | Utilisateur | Musiques de films & mélodies émotionnelles |
| **Paul V.** | `paul` | Administrateur | Curateur Melomania |

*Le mot de passe par défaut pour tous les comptes démo est `password123`.*  
*Vous pouvez également changer d'utilisateur en 1 clic via le menu profil en haut à droite.*

---

## 🌐 Déploiement

> ⚠️ **Persistance (important)** : sans base externe, les données (comptes,
> shares, commentaires, likes) vivent dans `.melomania-db.json`, un fichier
> **gitignoré sur un filesystem éphémère** : chaque déploiement Vercel repart
> d'une base vide. La prod **doit** définir `DATABASE_URL` (Neon Postgres) —
> voir ci-dessous. En dev local sans `DATABASE_URL`, le fichier JSON continue
> de fonctionner comme avant.

### Base durable sur Vercel + Neon (prod)
1. Crée un projet sur [Neon](https://neon.tech) et copie la **pooled connection string**.
2. Sur [Vercel](https://vercel.com) → Settings → Environment Variables, ajoute
   `DATABASE_URL` (Production + Preview), ainsi que `SESSION_SECRET`,
   `ADMIN_INITIAL_PASSWORD_HASH` et `TURNSTILE_SECRET`.
3. Poussez le dépôt et déployez (Framework Preset : **Next.js**).
4. (Optionnel, pour restaurer une copie locale) :
   ```bash
   DATABASE_URL="postgresql://..." npm run db:push
   ```

### Déploiement sur Netlify

### Déploiement sur Netlify
1. Connectez le dépôt sur [Netlify](https://netlify.com).
2. Build command : `npm run build`
3. Publish directory : `.next` (avec le plugin `@netlify/plugin-nextjs`).

### Déploiement sur Render
1. Créez un nouveau **Web Service** sur [Render](https://render.com).
2. Environment : `Node`.
3. Build Command : `npm install && npm run build`
4. Start Command : `npm start`

---

## ⚙️ Variables d'environnement facultatives

```env
# Clé de chiffrement AES-256 pour les tokens OAuth
ENCRYPTION_KEY=votre-cle-secrete-de-32-caracteres-min

# (Optionnel) Identifiants Spotify API pour le live search
SPOTIFY_CLIENT_ID=votre_spotify_client_id
SPOTIFY_CLIENT_SECRET=votre_spotify_client_secret
```

---

## 🎵 Architecture des Adaptateurs

Melomania utilise une architecture modulaire basée sur `MusicProviderAdapter` :
- `YouTubeAdapter` : parsing d'URL, extraction de métadonnées oEmbed, lecture IFrame synchronisée.
- `SpotifyAdapter` : recherche dans le catalogue, matching pondéré, création et export de playlists.
- `AppleMusicAdapter` : recherche et export vers Apple Music.
- `DeezerAdapter` : prêt pour les versions ultérieures.