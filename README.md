# Japon 2027

En ligne : https://japan-27.netlify.app

Petite appli pour préparer puis vivre le voyage au Japon, sur iPhone et Android (et PC pour préparer) :

- **Idées** : les liens TikTok, Facebook… qu'on s'envoie, triés (on garde / on laisse) avec l'essentiel noté ; une idée gardée devient une étape.
- **Itinéraire** jour par jour : étapes, heures, adresses, adresse en japonais à montrer au taxi, carte du jour.
- **Réservations à ne pas rater** : Musée Ghibli, Nintendo Museum, palais impérial, Shinkansen… avec la date d'ouverture calculée en heure de Paris et un rappel pour l'agenda.
- **Billets** : confirmations, QR codes, PDF, lisibles sans réseau.
- **Budget** : dépenses en yens, convertisseur, total en euros.
- **Mode voyage** : la journée du jour, les billets et le budget, automatiquement pendant le séjour.

**Toutes les données restent sur les téléphones** (stockage du navigateur). Le site ne contient que l'appli vide. Les deux téléphones se synchronisent par le Google Drive (copie chiffrée dans le dossier caché de l'appli, même compte Google sur les deux téléphones), ou par un fichier envoyé par WhatsApp, Messages ou mail (Plus › Échanger par fichier).

## Contenu

| Fichier | Rôle |
|---|---|
| `app/index.html` | L'application complète (aucune bibliothèque externe, fonctionne hors connexion) |
| `app/service-worker.js` | Mise en cache pour le hors connexion |
| `app/manifest.webmanifest`, `app/icon-*.png` | Installation sur l'écran d'accueil, menu Partager d'Android |
| `netlify.toml` | Publication Netlify : seul le dossier `app` est mis en ligne |
| `netlify/functions/google-oauth.mjs` | Connexion Google : garde le code secret de l'appli Google côté Netlify |
| `tests/` | Contrôles et parcours complet avec données fictives |
| `tools/icons.py` | Fabrique les icônes |

## Installer sur un téléphone

- **iPhone** : ouvrir le lien dans Safari, bouton Partager › « Sur l'écran d'accueil ». Ouvrir ensuite l'appli depuis son icône (elle ne voit pas ce qui a été saisi dans Safari).
- **Android** : ouvrir le lien dans Chrome, menu ⋮ › « Installer l'application ». L'appli apparaît alors dans le menu Partager de TikTok et Facebook.

## Connexion Google (une seule fois)

1. Google Cloud › Google Auth Platform › Clients › Créer un client « Application Web » : origine `https://japan-27.netlify.app`, URI de redirection `https://japan-27.netlify.app/`.
2. Netlify › projet `japan-27` › Project configuration › Environment variables : `GOOGLE_OAUTH_CLIENT_ID` et `GOOGLE_OAUTH_CLIENT_SECRET` (secret, portée Functions), puis republier.

## Publier une mise à jour

1. Modifier `app/index.html`.
2. Changer `APP_VERSION` dans `app/index.html` et `VERSION` dans `app/service-worker.js` (la même valeur).
3. `node tests/check_static.cjs` puis `node tests/test_app.cjs` (Playwright requis : `npm i --no-save playwright`).
4. Pousser sur `main` : Netlify republie. Sur les téléphones, un bandeau « Nouvelle version disponible » propose la mise à jour.
