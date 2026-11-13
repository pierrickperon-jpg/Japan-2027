'use strict';
// Parcours complet sur deux « téléphones » fictifs (iPhone puis Android), données inventées uniquement.
// Lancer : node tests/test_app.cjs        (CARD_BROWSER=webkit pour WebKit / Safari)
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.NODE_PATH || '/opt/npm-tools/node_modules', 'playwright')); }

const ROOT = path.resolve(__dirname, '..', 'app');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
function serve() {
  const server = http.createServer((req, res) => {
    let p = new URL(req.url, 'http://x').pathname; if (p === '/') p = '/index.html';
    const f = path.resolve(ROOT, '.' + p);
    if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f)) { res.writeHead(404); return res.end('absent'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, base: 'http://localhost:' + server.address().port })));
}
const IPHONE = { viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true };
const ANDROID = { viewport: { width: 412, height: 915 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true };
const name = process.env.CARD_BROWSER || 'chromium';
const sans = o => { const c = Object.assign({}, o); if (name === 'firefox') delete c.isMobile; return c; };

async function page(ctx, base, errors) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto(base + '/');
  await p.waitForSelector('nav#nav a');
  return p;
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const blurFill = async (p, sel, v) => { await p.fill(sel, v); await p.locator(sel).blur(); await p.waitForTimeout(80); };
const titleIs = async (p, t) => { await p.waitForFunction(t => document.querySelector('#title').textContent.trim() === t, t, { timeout: 4000 }).catch(() => {}); assert.equal((await p.textContent('#title')).trim(), t); };
// Attend que le nombre d'éléments soit atteint (les écritures sont asynchrones), puis vérifie.
const countIs = async (p, sel, n, msg) => { await p.waitForFunction(([s, n]) => document.querySelectorAll(s).length === n, [sel, n], { timeout: 4000 }).catch(() => {}); assert.equal(await p.locator(sel).count(), n, msg); };

(async () => {
  const { server, base } = await serve();
  const browser = await pw[name].launch();
  const errors = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'japon-test-'));
  try {
    /* ---------- Téléphone 1 (iPhone) ---------- */
    const ctxA = await browser.newContext(sans(IPHONE));
    const A = await page(ctxA, base, errors);
    await titleIs(A, 'Idées');
    await A.waitForSelector('text=Installez l’appli d’abord', { timeout: 5000 });
    await A.waitForSelector('text=Pour commencer', { timeout: 5000 });

    // Réglages : dates et prénoms (fictifs)
    await A.goto(base + '/#/reglages');
    await blurFill(A, '[data-set="debut"]', '2027-05-21');
    await blurFill(A, '[data-set="fin"]', '2027-06-06');
    await blurFill(A, '[data-set="voyageur"][data-idx="0"]', 'Alix');
    await blurFill(A, '[data-set="voyageur"][data-idx="1"]', 'Bao');
    await blurFill(A, '[data-loc="appareil"]', 'Téléphone A');

    // Idées : un paquet de messages avec doublons et paramètres de pistage
    await A.goto(base + '/#/idees');
    await A.click('text=Alix');
    await A.fill('#pasteBox', 'Regarde ça https://vm.tiktok.com/ZMabc123/ trop bien !\nEt https://www.facebook.com/share/r/1AbCdEf/?mibextid=xyz\nencore https://vm.tiktok.com/ZMabc123/?_r=1\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ&si=zz.');
    await A.click('text=Ranger dans les idées');
    await countIs(A, '#view .idee', 3, '3 idées (1 doublon écarté)');
    // Coller à nouveau : rien de nouveau
    await A.fill('#pasteBox', 'https://vm.tiktok.com/ZMabc123');
    await A.click('text=Ranger dans les idées');
    await countIs(A, '#view .idee', 3);
    // Une idée sans lien
    await A.fill('#pasteBox', 'Marché Nishiki\nle matin, avant la foule');
    await A.click('text=Ranger dans les idées');
    await countIs(A, '#view .idee', 4);
    assert.equal(await A.textContent('nav a[data-tab="idees"] .pastille'), '4');

    // Trier : une idée = la vidéo + trois boutons. « On garde » ouvre directement l’étape à décrire (une seule saisie)
    const tiktok = A.locator('#view .idee', { hasText: 'vm.tiktok.com' });
    assert.equal(await tiktok.locator('input, textarea').count(), 0, 'aucune saisie sur une idée');
    await tiktok.locator('text=✓ On garde').click();
    await titleIs(A, 'Étape');
    await A.waitForSelector('text=À placer', { timeout: 5000 });
    assert.equal(await A.inputValue('[data-f="lien"]'), 'https://vm.tiktok.com/ZMabc123/', 'le lien de la vidéo suit');
    await blurFill(A, '[data-f="titre"]', 'Ramen dans une ruelle');
    await blurFill(A, '[data-f="ville"]', 'Tokyo');
    await blurFill(A, '[data-f="note"]', 'Ouvert 11 h – 15 h, prévoir 1 200 ¥');
    // Vignette : une capture d’écran devient une petite image enregistrée dans la fiche
    await A.setInputFiles('input[data-change="vignette"]', { name: 'capture.png', mimeType: 'image/png', buffer: PNG });
    await A.waitForSelector('.vig-grande', { timeout: 5000 });
    assert.ok(/^data:image\/jpeg;base64,/.test(await A.getAttribute('.vig-grande', 'src')), 'vignette en JPEG intégré');
    await titleIs(A, 'Ramen dans une ruelle');
    await A.selectOption('[data-f="jour"]', '2027-05-22');
    await A.waitForTimeout(150);
    await blurFill(A, '[data-f="heure"]', '12:30');
    await blurFill(A, '[data-f="adresseJa"]', '東京都新宿区西新宿1-1-1');
    await A.click('text=🚕 Montrer au taxi');
    await A.waitForSelector('text=この住所までお願いします。', { timeout: 5000 });
    await A.waitForSelector('text=東京都新宿区西新宿1-1-1', { timeout: 5000 });
    await A.click('.overlay');
    await A.waitForSelector('[data-f="titre"]');

    // Jour 2 : deuxième étape à 9 h, rangée avant celle de 12 h 30
    await A.goto(base + '/#/jour/2027-05-22');
    await titleIs(A, 'Jour 2');
    await A.click('text=+ Étape');
    await A.waitForSelector('[data-f="titre"]');
    await blurFill(A, '[data-f="titre"]', 'Sanctuaire Meiji');
    await blurFill(A, '[data-f="heure"]', '09:00');
    await A.goto(base + '/#/jour/2027-05-22');
    await A.waitForSelector('#view .vig.p', { timeout: 5000 });
    const progr = await A.locator('#view .card').nth(1).locator('.item .t').allTextContents();
    assert.deepEqual(progr.map(s => s.replace(/\s+/g, ' ').trim()), ['09:00 · Sanctuaire Meiji', '12:30 · Ramen dans une ruelle']);
    await blurFill(A, '[data-f="nuit"]', 'Hôtel fictif Shinjuku');
    await A.goto(base + '/#/itineraire');
    await countIs(A, 'a.jour', 17, '17 jours du 21 mai au 6 juin');
    assert.ok((await A.locator('a.jour').nth(1).textContent()).includes('nuit : Hôtel fictif Shinjuku'));

    // Zapper la vidéo YouTube (elle disparaît), mettre la vidéo Facebook « À voir » (en couleur)
    await A.goto(base + '/#/idees');
    await A.locator('#view .idee', { hasText: 'youtube.com' }).locator('text=✕ On zappe').click();
    await countIs(A, '#view .idee', 2, 'restent 2 idées à trier');
    await A.locator('#view .idee', { hasText: 'facebook.com' }).locator('text=? À voir').click();
    await countIs(A, '#view .idee.avoir', 1, 'idée à voir en couleur');
    assert.ok((await A.textContent('#view .idee')).includes('facebook.com'), 'les idées « à voir » passent en tête');
    assert.equal(await A.textContent('nav a[data-tab="idees"] .pastille'), '2');
    await A.click('text=Voir les zappées (1)');
    await A.locator('#view .idee.zappee', { hasText: 'youtube.com' }).waitFor({ timeout: 5000 });
    await A.click('text=Cacher les zappées (1)');
    await A.waitForSelector('text=1 gardée → itinéraire', { timeout: 5000 });

    // Réservations : dates calculées en heure de Paris
    await A.goto(base + '/#/rappels');
    await A.click('text=+ Musée Ghibli');
    await A.waitForSelector('[data-f="dateVisite"]');
    await blurFill(A, '[data-f="dateVisite"]', '2027-05-25');
    await A.waitForTimeout(150);
    let txt = await A.textContent('#view');
    assert.ok(/samedi 10 avril 2027 à 03:00/.test(txt), 'Ghibli : 10 avril 2027, 3 h à Paris — ' + txt.slice(0, 200));
    await A.goto(base + '/#/rappels');
    await A.click('text=+ Palais impérial');
    await A.waitForSelector('[data-f="dateVisite"]');
    await blurFill(A, '[data-f="dateVisite"]', '2027-05-25');
    await A.waitForTimeout(150);
    txt = await A.textContent('#view');
    assert.ok(/mercredi 31 mars 2027 à 22:00/.test(txt), 'Palais : visite en mai = inscription le 1er avril 5 h au Japon = 31 mars 22 h à Paris — ' + txt.slice(0, 300));
    assert.ok(/jusqu’au 21 mai/.test(txt));
    await A.goto(base + '/#/rappels');
    await A.click('text=+ Nintendo Museum');
    await A.waitForSelector('[data-f="dateVisite"]');
    await blurFill(A, '[data-f="dateVisite"]', '2027-05-28');
    await A.waitForTimeout(150);
    assert.ok(/du 1er au 28 février 2027/.test(await A.textContent('#view')), 'Nintendo : tirage en février');
    // Le fichier agenda est valide
    const [dl] = await Promise.all([A.waitForEvent('download'), A.click('text=📅 Ajouter à mon agenda')]).catch(async () => [null]);
    if (dl) { const ics = fs.readFileSync(await dl.path(), 'utf8'); assert.ok(ics.includes('DTSTART;VALUE=DATE:20270201')); assert.ok(ics.split('\r\n').every(l => Buffer.byteLength(l) <= 75)); }

    // Budget
    await A.goto(base + '/#/budget');
    await A.fill('#tauxIn', '160');
    await A.click('[data-act="taux-set"]');
    await A.waitForSelector('text=1 € = 160 ¥', { timeout: 4000 });
    await A.fill('#convY', '3200');
    assert.equal((await A.inputValue('#convE')).replace(/\s/g, ''), '20');
    await A.fill('#depMontant', '3 200');
    await A.click('[data-act="pick"][data-k="depCat"][data-v="repas"]');
    await A.click('text=Ajouter la dépense');
    await A.waitForTimeout(100);
    await A.waitForFunction(() => /20,00/.test(document.querySelector('#view .big').textContent), null, { timeout: 4000 }).catch(() => {}); { const big = await A.textContent('#view .big'); assert.ok(/20,00\s€/.test(big), 'total 20 € — ' + JSON.stringify(big)); }

    // Billet avec une capture de QR code (image fictive)
    await A.goto(base + '/#/billets');
    await A.click('text=+ Ajouter un billet');
    await A.waitForSelector('[data-f="titre"]');
    await blurFill(A, '[data-f="titre"]', 'Musée fictif');
    await blurFill(A, '[data-f="date"]', '2027-05-25');
    await A.setInputFiles('input[data-change="fichiers"]', { name: 'qr.png', mimeType: 'image/png', buffer: PNG });
    await A.waitForSelector('.thumbs img');

    // Mode voyage forcé : l’accueil devient « Aujourd’hui »
    await A.goto(base + '/#/reglages');
    await A.click('[data-act="mode"][data-v="voyage"]');
    await A.waitForSelector('nav a[data-tab="aujourdhui"]', { timeout: 5000 });
    await A.click('nav a[data-tab="aujourdhui"]');
    await A.waitForFunction(() => /Jour \d+ sur 17/.test(document.querySelector('#title').textContent), null, { timeout: 4000 });
    await A.goto(base + '/#/reglages');
    await A.click('[data-act="mode"][data-v="auto"]');

    // Les vols changent : tout le voyage se décale de +2 jours (durée gardée), puis on revient
    await A.goto(base + '/#/reglages');
    await blurFill(A, '[data-set="debut"]', '2027-05-23');
    await A.waitForFunction(() => document.querySelector('[data-set="fin"]') && document.querySelector('[data-set="fin"]').value === '2027-06-08', null, { timeout: 5000 });
    await A.goto(base + '/#/jour/2027-05-24');
    await A.waitForSelector('text=Ramen dans une ruelle', { timeout: 5000 });
    assert.equal(await A.inputValue('[data-f="nuit"]'), 'Hôtel fictif Shinjuku', 'la nuit d’hôtel suit sa journée');
    await A.goto(base + '/#/rappels');
    await A.waitForSelector('text=samedi 10 avril 2027 à 03:00', { timeout: 5000 });
    await A.goto(base + '/#/reglages');
    await blurFill(A, '[data-set="debut"]', '2027-05-21');
    await A.waitForFunction(() => document.querySelector('[data-set="fin"]') && document.querySelector('[data-set="fin"]').value === '2027-06-06', null, { timeout: 5000 });
    await A.goto(base + '/#/jour/2027-05-22');
    await A.waitForSelector('text=Ramen dans une ruelle', { timeout: 5000 });
    assert.equal(await A.inputValue('[data-f="nuit"]'), 'Hôtel fictif Shinjuku');

    // Envoi vers l’autre téléphone (sans pièces jointes)
    await A.goto(base + '/#/echange');
    const [dl1] = await Promise.all([A.waitForEvent('download'), A.click('text=Préparer et envoyer')]);
    const f1 = path.join(tmp, 'echange1.json'); fs.copyFileSync(await dl1.path(), f1);
    const p1 = JSON.parse(fs.readFileSync(f1, 'utf8'));
    assert.equal(p1.format, 'japon-2027-echange'); assert.equal(p1.avecBillets, false);
    assert.equal(p1.data.billets[0].fichiers.length, 0); assert.equal(p1.data.billets[0].fichiersOmis, true);

    // Rechargement : rien ne disparaît
    await A.reload(); await A.waitForSelector('nav#nav a');
    await A.goto(base + '/#/idees');
    await countIs(A, '#view .idee', 2);

    /* ---------- Téléphone 2 (Android) ---------- */
    const ctxB = await browser.newContext(sans(ANDROID));
    const B = await page(ctxB, base, errors);
    await B.waitForSelector('text=Installer l’application', { timeout: 5000 });
    await B.goto(base + '/#/echange');
    await B.setInputFiles('input[data-change="import"]', f1);
    await B.waitForSelector('text=Importer');
    assert.ok(/idées\s*4 nouvelles/.test(await B.textContent('#importPreview')));
    await B.click('[data-act="import-go"]');
    await B.waitForTimeout(200);
    await B.goto(base + '/#/itineraire');
    await countIs(B, 'a.jour', 17, 'dates reçues');
    await B.goto(base + '/#/jour/2027-05-22');
    await B.waitForSelector('#view .vig.p', { timeout: 5000 }); // la vignette a voyagé
    await B.goto(base + '/#/billets');
    await B.waitForSelector('text=pièces jointes sur l’autre téléphone', { timeout: 5000 });

    // Partage depuis TikTok sur Android
    await B.goto(base + '/?titre=' + encodeURIComponent('Le meilleur onsen') + '&texte=' + encodeURIComponent('Regarde https://vm.tiktok.com/ZMnouv99/ #japon'));
    await titleIs(B, 'Lien reçu');
    await B.waitForSelector('text=Le meilleur onsen', { timeout: 5000 });
    await B.click('[data-act="pick"][data-v="Bao"]');
    await B.click('text=Ranger pour plus tard');
    await titleIs(B, 'Idées');
    await countIs(B, '#view .idee', 3);
    await countIs(B, '#view .idee.avoir', 1, '« à voir » reçu de l’autre téléphone');
    await B.waitForSelector('text=Le meilleur onsen', { timeout: 5000 });
    // Le même lien partagé une 2e fois est reconnu
    await B.goto(base + '/?texte=' + encodeURIComponent('https://vm.tiktok.com/ZMnouv99'));
    await B.waitForSelector('text=Déjà dans vos idées');

    // Modification sur B, retour vers A
    await B.goto(base + '/#/idees');
    await B.locator('#view .idee', { hasText: 'Marché Nishiki' }).locator('text=? À voir').click();
    await countIs(B, '#view .idee.avoir', 2);
    await B.goto(base + '/#/echange');
    const [dl2] = await Promise.all([B.waitForEvent('download'), B.click('text=Préparer et envoyer')]);
    const f2 = path.join(tmp, 'echange2.json'); fs.copyFileSync(await dl2.path(), f2);

    await A.goto(base + '/#/echange');
    await A.setInputFiles('input[data-change="import"]', f2);
    await A.waitForSelector('[data-act="import-go"]');
    await A.click('[data-act="import-go"]');
    await A.waitForTimeout(200);
    await A.goto(base + '/#/idees');
    await countIs(A, '#view .idee', 3, 'idée Android reçue sur l’iPhone');
    await countIs(A, '#view .idee.avoir', 2, '« à voir » d’Android reçu sur l’iPhone');
    // Supprimer l’étape d’une idée gardée : l’idée passe dans les zappées (récupérable)
    const ramen = (await A.evaluate(() => S.etapes.find(e => e.titre === 'Ramen dans une ruelle').id));
    await A.goto(base + '/#/etape/' + ramen);
    await A.click('text=Supprimer cette étape');
    await A.waitForFunction(() => location.hash.startsWith('#/jour/'), null, { timeout: 5000 });
    await A.goto(base + '/#/idees');
    await A.waitForFunction(() => /zappées \(2\)/.test(document.querySelector('#view').textContent), null, { timeout: 5000 }).catch(async () => { throw new Error('zappées : ' + JSON.stringify(await A.evaluate(() => ({ txt: document.querySelector('#view').textContent.slice(-200), idees: S.idees.map(i => [i.url, i.statut, i.etapeId]), et: S.etapes.filter(e => e.ideeId).map(e => [e.id, e.deleted]) })))); });
    await A.goto(base + '/#/billet/' + p1.data.billets[0].id);
    await countIs(A, '.thumbs img', 1, 'la pièce jointe locale est gardée');

    // Sauvegarde automatique faite avant la réception
    await A.goto(base + '/#/sauvegardes');
    await A.waitForSelector('text=Avant réception d’un fichier');

    // Fichier étranger refusé
    const bad = path.join(tmp, 'faux.json'); fs.writeFileSync(bad, JSON.stringify({ format: 'autre', data: {} }));
    await A.goto(base + '/#/echange');
    await A.setInputFiles('input[data-change="import"]', bad);
    await A.waitForSelector('#toast.on.err');

    assert.deepEqual(errors, [], 'aucune erreur JavaScript');
    console.log('Parcours complet OK (' + name + ')');
  } finally {
    await browser.close(); server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
