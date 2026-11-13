'use strict';
// Synchronisation Google Drive entre deux téléphones fictifs, avec un Google simulé (aucun vrai compte, données inventées).
// Lancer : node tests/test_sync.cjs        (CARD_BROWSER=webkit pour WebKit / Safari)
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.NODE_PATH || '/opt/npm-tools/node_modules', 'playwright')); }

const ROOT = path.resolve(__dirname, '..', 'app');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PASS = 'quatre mots pour tester';
const oauth = { posts: [] };

// Serveur de l'appli + fonction /api/google-oauth simulée (le vrai secret n'existe pas ici)
function serve() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/google-oauth') {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') return res.end(JSON.stringify({ ready: true, clientId: 'client-test.apps.googleusercontent.com' }));
      let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
        const b = JSON.parse(body || '{}'); oauth.posts.push(b.grant_type);
        if (b.grant_type === 'authorization_code' && b.code === 'code-ok' && b.code_verifier && b.redirect_uri.endsWith('/')) return res.end(JSON.stringify({ access_token: 'at-1', expires_in: 3600, refresh_token: 'rt-test' }));
        if (b.grant_type === 'refresh_token' && b.refresh_token === 'rt-test') return res.end(JSON.stringify({ access_token: 'at-2', expires_in: 3600 }));
        res.statusCode = 400; res.end(JSON.stringify({ error: 'invalid_grant' }));
      });
      return;
    }
    let p = u.pathname; if (p === '/') p = '/index.html';
    const f = path.resolve(ROOT, '.' + p);
    if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f)) { res.writeHead(404); return res.end('absent'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, base: 'http://localhost:' + server.address().port })));
}

// Drive simulé : dossier caché d'un seul compte Google, partagé par les deux téléphones
const drive = new Map(); let nextId = 1;
async function fakeGoogle(ctx, base) {
  await ctx.route('https://accounts.google.com/**', route => {
    const st = new URL(route.request().url()).searchParams.get('state');
    route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(base + '/?code=code-ok&state=')} + ${JSON.stringify(st)})</script>` });
  });
  await ctx.route('https://www.googleapis.com/**', async route => {
    const req = route.request(), u = new URL(req.url()), m = req.method();
    // Comme le vrai Google : réponses autorisées pour l'appli (CORS), y compris la requête préalable de Safari
    const cors = { 'Access-Control-Allow-Origin': req.headers()['origin'] || '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' };
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    if (!/^Bearer at-/.test(req.headers()['authorization'] || '')) return route.fulfill({ status: 401, headers: cors, body: '{}' });
    const send = (o, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: typeof o === 'string' ? o : JSON.stringify(o) });
    const meta = f => ({ id: f.id, name: f.name, version: String(f.version), modifiedTime: f.modifiedTime });
    if (m === 'GET' && u.pathname === '/drive/v3/files') {
      const q = u.searchParams.get('q') || ''; let l = [...drive.values()];
      const eq = q.match(/name='([^']+)'/), ct = q.match(/name contains '([^']+)'/);
      if (eq) l = l.filter(f => f.name === eq[1]); if (ct) l = l.filter(f => f.name.includes(ct[1]));
      return send({ files: l.map(meta) });
    }
    let mm = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (m === 'GET' && mm) { const f = drive.get(mm[1]); if (!f) return send({ error: { message: 'absent' } }, 404); return u.searchParams.get('alt') === 'media' ? send(f.content) : send(meta(f)); }
    mm = u.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
    if (m === 'PATCH' && mm) { const f = drive.get(mm[1]); f.content = req.postData(); f.version++; f.modifiedTime = new Date().toISOString(); return send(meta(f)); }
    if (m === 'POST' && u.pathname === '/upload/drive/v3/files') {
      const body = req.postData(), b = (req.headers()['content-type'].match(/boundary=(.+)$/) || [])[1];
      const parts = body.split('--' + b).filter(x => x.trim() && x.trim() !== '--').map(x => x.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''));
      const md = JSON.parse(parts[0]); assert.deepEqual(md.parents, ['appDataFolder'], 'toujours dans le dossier caché');
      const f = { id: 'f' + (nextId++), name: md.name, version: 1, content: parts[1], modifiedTime: new Date().toISOString() }; drive.set(f.id, f); return send(meta(f));
    }
    return send({ error: { message: 'non simulé ' + m + ' ' + u.pathname } }, 400);
  });
}
const IPHONE = { viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' };
const ANDROID = { viewport: { width: 412, height: 915 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' };
const name = process.env.CARD_BROWSER || 'chromium';
const blurFill = async (p, sel, v) => { await p.fill(sel, v); await p.locator(sel).blur(); await p.waitForTimeout(80); };
const until = async (fn, msg, ms = 8000) => { const t0 = Date.now(); for (;;) { if (await fn()) return; if (Date.now() - t0 > ms) throw new Error('Délai dépassé : ' + msg); await new Promise(r => setTimeout(r, 120)); } };
const mainFile = () => [...drive.values()].find(f => f.name === 'japon-2027-sync.json');

async function phone(browser, base, prof, errors, nom) {
  const ctx = await browser.newContext(prof); await fakeGoogle(ctx, base);
  await ctx.addInitScript(n => { window.__driveDelay = 150; if (!localStorage.getItem('japon-2027-local')) localStorage.setItem('japon-2027-local', JSON.stringify({ installVu: 1, appareil: n })); }, nom);
  const p = await ctx.newPage(); const journal = [];
  p.on('requestfailed', r => journal.push('échec ' + r.method() + ' ' + r.url().slice(0, 90) + ' ' + (r.failure() || {}).errorText));
  p.on('console', m => journal.push('console ' + m.type() + ' ' + m.text().slice(0, 160)));
  p.on('pageerror', e => errors.push(nom + ' : ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(base + '/'); await p.waitForSelector('nav#nav a');
  return { ctx, p, journal };
}
async function connect(ph, pass, nouvelle) {
  const p = ph.p;
  await p.goto(p.url().split('#')[0] + '#/reglages');
  await p.waitForSelector('[data-act="drv-connect"]:not([disabled])', { timeout: 8000 });
  const [popup] = await Promise.all([ph.ctx.waitForEvent('page'), p.click('[data-act="drv-connect"]')]);
  await popup.waitForEvent('close', { timeout: 8000 }).catch(() => {});
  await p.waitForSelector('#drvPass', { timeout: 8000 });
  if ((await p.locator('#drvPass2').count()) !== (nouvelle ? 1 : 0)) {
    const diag = await p.evaluate(() => ({ carte: (document.getElementById('drive-card') || {}).textContent, etat: DS(), distant: DRIVE.hasRemote, msg: DRIVE.msg }));
    throw new Error((nouvelle ? 'première fois : phrase à confirmer' : 'copie existante : une seule saisie') + ' — ' + JSON.stringify(diag) + ' — requêtes : ' + JSON.stringify(ph.journal.slice(-8)));
  }
  await p.fill('#drvPass', pass); if (nouvelle) await p.fill('#drvPass2', pass);
  await p.click('[data-act="drv-pass"]');
}

(async () => {
  const { server, base } = await serve();
  const browser = await pw[name].launch(); const errors = [];
  try {
    /* Téléphone A : quelques données, puis connexion (première fois) */
    const A = await phone(browser, base, IPHONE, errors, 'Téléphone A');
    await A.p.goto(base + '/#/reglages');
    await blurFill(A.p, '[data-set="debut"]', '2027-05-15');
    await blurFill(A.p, '[data-set="fin"]', '2027-05-29');
    await A.p.goto(base + '/#/idees');
    await A.p.fill('#pasteBox', 'https://vm.tiktok.com/ZMsync01/ et https://www.facebook.com/share/r/Sync02/');
    await A.p.click('text=Ranger dans les idées');
    await A.p.waitForSelector('#view .idee');
    await connect(A, PASS, true);
    await A.p.waitForSelector('text=Synchronisé', { timeout: 10000 });
    assert.ok(mainFile(), 'fichier principal créé dans le dossier caché');
    const enc = JSON.parse(mainFile().content);
    assert.equal(enc.app, 'japon-2027-sync'); assert.ok(!mainFile().content.includes('tiktok'), 'contenu chiffré : rien de lisible sur le Drive');

    // Billet avec une pièce jointe : envoyée à part, une seule fois
    await A.p.goto(base + '/#/billets');
    await A.p.click('text=+ Ajouter un billet');
    await A.p.waitForSelector('[data-f="titre"]');
    await blurFill(A.p, '[data-f="titre"]', 'Musée fictif');
    await A.p.setInputFiles('input[data-change="fichiers"]', { name: 'qr.png', mimeType: 'image/png', buffer: PNG });
    await A.p.waitForSelector('.thumbs img');
    await until(() => [...drive.values()].some(f => f.name.startsWith('pj-')), 'pièce jointe envoyée sur le Drive');

    /* Téléphone B : même compte Google, même phrase → tout arrive */
    const B = await phone(browser, base, ANDROID, errors, 'Téléphone B');
    await connect(B, PASS, false);
    await B.p.waitForSelector('text=Synchronisé', { timeout: 10000 });
    await B.p.goto(base + '/#/idees');
    await until(async () => (await B.p.locator('#view .idee').count()) === 2, 'idées reçues sur B');
    await B.p.goto(base + '/#/itineraire');
    assert.equal(await B.p.locator('a.jour').count(), 15, 'dates reçues');
    const bid = await B.p.evaluate(() => S.billets[0].id);
    await until(async () => { await B.p.goto(base + '/#/billet/' + bid); return (await B.p.locator('.thumbs img').count()) === 1; }, 'pièce jointe reçue et lisible sur B');

    /* B met une idée « À voir » : A la voit en couleur après sa synchro */
    await B.p.goto(base + '/#/idees');
    const v0 = mainFile().version;
    await B.p.locator('#view .idee', { hasText: 'facebook.com' }).locator('text=? À voir').click();
    await until(() => mainFile().version > v0, 'B envoie sa modification');
    await A.p.goto(base + '/#/idees');
    await A.p.evaluate(() => driveSync('test'));
    await until(async () => (await A.p.locator('#view .idee.avoir').count()) === 1, '« à voir » reçu sur A');
    assert.equal(await A.p.evaluate(() => DS().lastFrom), 'Téléphone B');

    /* Modifications des deux côtés : rien n'est perdu */
    await A.p.fill('#pasteBox', 'https://vm.tiktok.com/ZMsyncA3/'); await A.p.click('text=Ranger dans les idées');
    await B.p.fill('#pasteBox', 'https://vm.tiktok.com/ZMsyncB4/'); await B.p.click('text=Ranger dans les idées');
    await A.p.waitForTimeout(600);
    await A.p.evaluate(() => driveSync('test')); await B.p.evaluate(() => driveSync('test')); await A.p.evaluate(() => driveSync('test'));
    await A.p.goto(base + '/#/idees'); await B.p.goto(base + '/#/idees');
    await until(async () => (await A.p.locator('#view .idee').count()) === 4 && (await B.p.locator('#view .idee').count()) === 4, 'les 4 idées des deux côtés');

    /* Troisième appareil avec une mauvaise phrase : refusé, rien n'est touché */
    const C = await phone(browser, base, IPHONE, errors, 'Téléphone C');
    await connect(C, 'une autre phrase pas la bonne', false);
    await C.p.waitForSelector('text=Phrase secrète différente', { timeout: 8000 });
    assert.equal(await C.p.evaluate(() => S.idees.length), 0);

    /* Jeton renouvelé par la fonction Netlify (le secret n'est jamais dans le navigateur) */
    await A.p.evaluate(() => { DRIVE.access = null; return driveSync('test'); });
    assert.ok(oauth.posts.includes('refresh_token'), 'jeton renouvelé');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(!/client_secret/.test(html), 'aucun code secret dans l’appli');

    assert.deepEqual(errors, [], 'aucune erreur JavaScript');
    console.log('Synchronisation Google Drive OK (' + name + ')');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
