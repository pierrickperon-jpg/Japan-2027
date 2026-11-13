'use strict';
// Contrôles sans navigateur : syntaxe du script, versions alignées, pièges iPhone, manifeste.
// Lancer : node tests/check_static.cjs
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { execFileSync } = require('node:child_process'), assert = require('node:assert/strict');
const app = path.resolve(__dirname, '..', 'app');
const html = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(app, 'service-worker.js'), 'utf8');

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert.equal(scripts.length, 1, 'un seul script intégré attendu');
const tmp = path.join(os.tmpdir(), 'japon-2027-script.js');
fs.writeFileSync(tmp, scripts[0]);
execFileSync(process.execPath, ['--check', tmp], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', path.join(app, 'service-worker.js')], { stdio: 'inherit' });

// iOS 15 : une seule assertion arrière casse toute l'appli.
assert.ok(!/\(\?<[=!]/.test(scripts[0]), 'assertion arrière interdite (iOS 15)');

const vApp = (html.match(/const APP_VERSION = '([^']+)'/) || [])[1];
const vSw = (sw.match(/const VERSION = '([^']+)'/) || [])[1];
assert.ok(vApp && vSw, 'versions introuvables');
assert.equal(vApp, vSw, 'APP_VERSION (index.html) et VERSION (service-worker.js) doivent être identiques');

const man = JSON.parse(fs.readFileSync(path.join(app, 'manifest.webmanifest'), 'utf8'));
assert.equal(man.share_target.action, './');
for (const i of man.icons) assert.ok(fs.existsSync(path.join(app, i.src)), 'icône absente : ' + i.src);
const files = (sw.match(/const FILES = \[([^\]]+)\]/) || [])[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
for (const f of files) if (f !== './') assert.ok(fs.existsSync(path.join(app, f)), 'fichier du cache absent : ' + f);

// Aucune donnée dans le dossier publié.
for (const f of fs.readdirSync(app)) assert.ok(!/\.(json|csv|xlsx?)$/i.test(f), 'fichier de données interdit dans app/ : ' + f);
console.log('Contrôles statiques OK — version', vApp);
