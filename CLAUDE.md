# Japon 2027 : règles pour toute modification

Appli web installable (PWA) pour préparer puis vivre un voyage de deux semaines au Japon, sur un iPhone et un téléphone Android (et un PC pour préparer). Un seul fichier : `app/index.html` (HTML, CSS et JavaScript intégrés, aucune bibliothèque externe). Ce fichier sert de mémoire commune à Claude et à ChatGPT : le tenir à jour à chaque lot.

Les données vivent **uniquement** dans l'IndexedDB `japon-2027` de chaque téléphone (et quelques réglages propres à l'appareil dans `localStorage['japon-2027-local']`). Une mise à jour ne doit jamais les perdre.

## Règles de base

- Adresse de publication : **https://japan-27.netlify.app** (choisie par Pierrick le 13 novembre 2026). Ne jamais la changer : le navigateur range les données par adresse.
- Évolutions **additives uniquement** : ajouter un magasin (dans `STORES`, en montant `DB_VERSION`) ou un champ ; jamais supprimer, renommer ni changer le sens d'un champ. Une fiche ancienne sans le nouveau champ doit rester lisible.
- Suppression = `deleted: true` (`softDelete`), jamais d'effacement : la suppression voyage ainsi vers l'autre téléphone.
- À chaque version : changer `APP_VERSION` dans `app/index.html` **et** `VERSION` dans `app/service-worker.js` (identiques, vérifié par `tests/check_static.cjs`). Sinon les téléphones gardent l'ancienne version.
- Aucune donnée réelle (prénoms, adresses, réservations, liens) dans le code, les tests ou le README : le site est public, seul le dépôt est privé. Les tests fabriquent des données fictives.
- iOS 15 : pas d'assertion arrière dans les expressions régulières (`(?<=`, `(?<!`).
- Services extérieurs seulement sur un toucher et avec le strict nécessaire : titre d'une vidéo (oEmbed TikTok / YouTube, on n'envoie que le lien), taux du jour (Frankfurter, rien n'est envoyé). Cartes : liens vers Google Maps / Plans, ouverts sur un toucher.
- Textes de l'appli en français simple, sans jargon.

## Architecture (`app/index.html`)

- Magasins IndexedDB (clé `id`) : `idees`, `etapes`, `jours` (`id = 'j-AAAA-MM-JJ'`), `rappels`, `billets`, `depenses`, `meta` (fiche `settings`), `sauvegardes`.
- Mémoire vive : `S[magasin]` (tableaux), `SET` (réglages partagés), `LOC` (réglages de l'appareil). `saveRec(store, rec)` met à jour la mémoire puis écrit (file d'attente `persist`, dans l'ordre).
- Écrans par l'ancre (`ROUTES`) : `#/idees`, `#/idee/<id>`, `#/recu`, `#/itineraire`, `#/jour/<date>`, `#/etape/<id>`, `#/taxi/<id>`, `#/rappels`, `#/rappel/<id>`, `#/billets`, `#/billet/<id>`, `#/voir/<billet>/<fichier>`, `#/budget`, `#/depense/<id>`, `#/aujourdhui`, `#/plus`, `#/echange`, `#/sauvegardes`, `#/reglages`.
- Saisie enregistrée toute seule : champ `data-f="<champ>"` dans un conteneur `data-rec="<magasin>:<id>"` (événement `change`) ; `data-rerender` pour réafficher l'écran (à éviter sur les champs texte : ça ferait perdre le champ suivant touché). Réglages partagés : `data-set` ; réglages de l'appareil : `data-loc`. Actions : `data-act` (objet `ACTS`), fichiers : `data-change` (objet `CHG`).
- Réglages partagés (`SHARED_SETTINGS`) : `debut`, `fin` (premier et dernier jour sur place), `voyageurs` (prénoms), `taux` (yens pour 1 €), `tauxDate`, `budgetPrevu`. Réglages de l'appareil (`LOC`) : `mode` (`auto` | `prep` | `voyage`), `appareil` (nom, pour le fichier d'échange), filtres, choix en cours.
- Mode voyage (`isVoyage`) : automatique la veille du premier jour et pendant le séjour ; barre du bas Aujourd'hui · Itinéraire · Billets · Budget · Plus. Mode préparation : Idées · Itinéraire · Réserver · Billets · Plus.

## Idées (préparation seulement)

- Décision de Pierrick (13 novembre 2026) : les liens TikTok / Facebook que les deux voyageurs s'envoient servent **uniquement à la préparation**. On trie (`statut` : `a-trier`, `garde`, `ecarte`), on note l'essentiel (`titre`, `ville`, `note` : horaires, prix, astuce) et une idée gardée devient une étape (`idee.etapeId`, `etape.ideeId`). En mode voyage, les idées disparaissent de la barre du bas (toujours dans « Plus »), rien n'est effacé.
- Ajout : coller un lien ou tout un paquet de messages (`extractUrls`) ; doublons écartés par `normUrl` (hôte sans `www.`/`m.`, paramètres de pistage `TRACKING` retirés). Sans lien, le texte devient une idée `source: 'note'`.
- Android : `share_target` du manifeste (GET sur `./` avec `titre`, `texte`, `lien`) → écran `#/recu`. iPhone : Safari ne permet pas à une appli web d'apparaître dans le menu Partager → copier le lien puis « Coller ».
- Titre automatique (`titre-auto`) : oEmbed TikTok / YouTube sur un toucher ; s'il échoue (réseau, CORS), message simple et saisie à la main. Facebook : impossible sans clé.

## Itinéraire

- Journées = `tripDays()` de `SET.debut` à `SET.fin`. Une étape hors des dates (dates changées) reste visible dans « À placer » avec sa date : jamais perdue.
- Ordre : `etape.ordre` (flèches ↑ ↓) ; une étape avec une heure se range d'elle-même avant la première étape plus tardive (`placeByTime`).
- Champs de l'étape : `titre`, `jour`, `heure`, `ville`, `adresse`, `adresseJa` (montrée en grand au taxi, `#/taxi/<id>`, avec « この住所までお願いします。 »), `horaires`, `prix`, `reservation`, `lien`, `note`.
- Journée (`jours`) : `ville`, `nuit` (hôtel), `note`. « Carte du jour » : itinéraire Google Maps avec les étapes du jour (10 au plus).
- Décaler le voyage (`shiftTrip`, lot 2) : quand le premier jour change et qu'un itinéraire existe, l'appli propose de tout décaler de n jours : `etapes.jour`, `rappels.dateVisite`, journées (nouvelle fiche `j-<date+n>`, l'ancienne passe en `deleted` pour que l'échange suive) et `SET.fin` (durée gardée). Copie de sécurité avant, une seule transaction. Billets et dépenses ne bougent pas (vraies réservations, vrais achats). Refuser = seul le premier jour change.

## Réservations à ne pas rater (`MODELES`, `rappelCalc`)

Règles relevées le 13 novembre 2026 (site officiel Ghibli ; guides concordants pour les autres, sites officiels non consultés directement) : à revérifier chaque année.
- Musée Ghibli : Lawson Ticket international, le 10 du mois précédent la visite à 10 h (heure du Japon).
- Nintendo Museum : tirage au sort pendant le mois situé 3 mois avant la visite, résultats le 1er du mois suivant.
- Palais impérial (visite guidée) : inscription dès le 1er du mois précédent à 5 h (heure du Japon), jusqu'à 4 jours avant ; mardi au samedi, 10 h et 13 h 30.
- Shinkansen : un mois avant, 10 h (heure du Japon).
- Hôtels, Autre : date choisie à la main (`ouverture`).
- Jour de la visite : étape liée (`etapeId`) > `dateVisite` > premier jour du voyage (calcul provisoire signalé). Heures affichées en heure de Paris (`fmtParis`, fuseau `Europe/Paris`) ; heure du Japon = UTC+9 sans heure d'été (`jst`). « Ajouter à mon agenda » : fichier `.ics` (lignes de 75 octets au plus, rappels la veille et 30 min avant).
- `statut` : `a-faire`, `inscrit`, `reserve`, `abandon`. Pastille et bandeau quand une ouverture est dans les 30 jours ou en cours.

## Billets

- Champs : `titre`, `type` (`vol`, `train`, `visite`, `hotel`, `autre`), `date`, `heure`, `reference`, `note`, `fichiers` : `[{id, nom, type, data (data URL), w, h}]`. Photos réduites à 2000 px (JPEG 0,88) sauf PNG/JPEG déjà petits (QR codes nets) ; PDF gardés tels quels (25 Mo au plus).
- `fichiersRetires` : identifiants des pièces retirées exprès (pour qu'elles ne reviennent pas par l'échange). `fichiersOmis: true` : pièces restées sur l'autre téléphone (envoi sans billets).

## Budget

- Dépense : `montant`, `devise` (`JPY` | `EUR`), `cat` (`CATS`), `date`, `qui`, `note`, `taux` (taux du moment de la saisie, sinon `SET.taux`). Total en euros, par catégorie, par personne.

## Échange entre téléphones et sauvegardes

- Fichier `japon-2027-echange` (format 1) : `{format, version, app, exportedAt, appareil, avecBillets, settings, data: {idees, etapes, jours, rappels, billets, depenses}}`, fiches supprimées comprises. Envoi par la feuille de partage (WhatsApp, Messages, mail) ou téléchargement.
- Réception : `validatePayload` (format, identifiants `[A-Za-z0-9_-]`, pas de doublon, pièces jointes = photos ou PDF en base64 seulement) puis aperçu (`mergePlan`) puis, après clic, **copie de sécurité** (`createBackup`, 3 dernières gardées ; si elle échoue, rien n'est importé) et écriture en une seule transaction (`applyPlan`).
- Fusion : par fiche, la plus récente (`updatedAt`) l'emporte ; billets : pièces jointes des deux côtés réunies (`mergeFichiers`), sauf retirées. Réglages partagés : le bloc le plus récent l'emporte.
- `importExchange` futur : accepter tous les formats précédents ; un fichier d'une version plus récente est refusé avec le conseil de mettre l'appli à jour.
- Sauvegardes : `#/sauvegardes` (fichier complet, copies automatiques, restauration après copie de l'état actuel).

## Tests

- `node tests/check_static.cjs` : syntaxe, versions identiques, pas d'assertion arrière, manifeste et fichiers du cache présents, aucun fichier de données dans `app/`.
- `node tests/test_app.cjs` (Chromium, profil iPhone puis Android) et `CARD_BROWSER=webkit node tests/test_app.cjs` (WebKit, comme Safari) : parcours complet avec données fictives (réglages, idées, tri, étapes, taxi, réservations et dates calculées, budget, billet avec image, mode voyage, échange dans les deux sens, partage Android, sauvegarde, fichier refusé). Lancés par GitHub Actions à chaque envoi sur `main`.
- Sous automate (`navigator.webdriver`), l'export télécharge au lieu d'ouvrir la feuille de partage.

## Publication

- Netlify (projet `japan-27`) publie le dossier `app/` depuis `main` (pas de commande de construction). Regrouper les publications : chaque déploiement coûte des crédits Netlify.
- `netlify.toml` › `ignore` : un envoi qui ne touche ni `app/` ni `netlify.toml` (documentation, tests) ne republie pas le site.
- Avant de pousser : contrôles statiques, test complet, version changée.
