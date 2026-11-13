// Connexion Google de l'appli Japon 2027 : échange du code (ou du jeton durable) contre un jeton d'accès,
// sans jamais montrer le code secret de l'appli Google au navigateur.
// Variables Netlify (Project configuration › Environment variables, portée Functions) :
//   GOOGLE_OAUTH_CLIENT_ID      identifiant du client Web Google (public)
//   GOOGLE_OAUTH_CLIENT_SECRET  code secret du client (marqué « secret »)
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default async (req) => {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID || '', secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
  if (req.method === 'GET') return json({ ready: !!(id && secret), clientId: id });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const self = new URL(req.url).origin, origin = req.headers.get('origin');
  if (origin && origin !== self) return json({ error: 'origin' }, 403);
  if (!id || !secret) return json({ error: 'not_configured' }, 503);
  let b;
  try { const t = await req.text(); if (t.length > 4000) throw new Error('trop long'); b = JSON.parse(t); } catch (e) { return json({ error: 'bad_request' }, 400); }
  const p = new URLSearchParams({ client_id: id, client_secret: secret });
  if (b && b.grant_type === 'authorization_code' && typeof b.code === 'string' && typeof b.code_verifier === 'string' && b.redirect_uri === self + '/') {
    p.set('grant_type', 'authorization_code'); p.set('code', b.code); p.set('code_verifier', b.code_verifier); p.set('redirect_uri', b.redirect_uri);
  } else if (b && b.grant_type === 'refresh_token' && typeof b.refresh_token === 'string') {
    p.set('grant_type', 'refresh_token'); p.set('refresh_token', b.refresh_token);
  } else return json({ error: 'unsupported_grant_type' }, 400);
  let r, j;
  try { r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p }); j = await r.json().catch(() => ({})); }
  catch (e) { return json({ error: 'google_unreachable' }, 502); }
  const out = {}; for (const k of ['access_token', 'expires_in', 'refresh_token', 'scope', 'token_type', 'error', 'error_description']) if (j[k] !== undefined) out[k] = j[k];
  return json(out, r.status);
};

export const config = { path: '/api/google-oauth' };
