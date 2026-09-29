/*
 * liswan.dev publish API — Cloudflare Worker.
 *
 * Lets the admin panel (a static site on GitHub Pages) commit content edits to the
 * repo without a GitHub token ever reaching the browser:
 *
 *   POST /login   {email, password}              -> {token, exp, name}   (12-hour session)
 *   GET  /get?path=data/content.json             -> file content (fresh from the branch)
 *   POST /put     {path, base64, message}         -> commits the file     (Bearer session)
 *   GET  /ping                                    -> {ok:true}
 *
 * Settings (Cloudflare dashboard -> Worker -> Settings -> Variables and Secrets):
 *   GITHUB_TOKEN    secret  fine-grained token: this repo only, Contents = Read and write
 *   ADMIN_EMAIL     text    email used to log in to /admin/
 *   ADMIN_PASSWORD  secret  password used to log in to /admin/
 *   SESSION_SECRET  secret  any long random string (signs login sessions)
 *   ADMIN_NAME      text    optional, shown in the admin header (default "Admin")
 *   GITHUB_OWNER / GITHUB_REPO / GITHUB_BRANCH   optional, defaults below
 *   ALLOWED_ORIGINS optional, comma-separated (default https://liswan.dev + localhost)
 *
 * Only data/*.json and uploads/* can be written — the Worker cannot touch site code.
 */
const DEFAULTS = {
  GITHUB_OWNER: 'liswan-dev',
  GITHUB_REPO: 'liswan-dev.github.io',
  GITHUB_BRANCH: 'main',
  ALLOWED_ORIGINS: 'https://liswan.dev,https://www.liswan.dev,https://liswan-dev.github.io,http://localhost:8080,http://localhost:8081,http://127.0.0.1:8080'
};
const WRITABLE = /^(data\/[a-z0-9_-]+\.json|uploads\/[a-z0-9._-]+\.(webp|png|jpe?g|gif|svg))$/i;
const SESSION_HOURS = 12;
const MAX_BYTES = 15 * 1024 * 1024;

const enc = new TextEncoder();
const cfg = (env, k) => (env[k] || DEFAULTS[k] || '').trim();

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
// constant-time string comparison (compares HMACs so lengths never leak)
async function safeEqual(a, b, secret) {
  const [x, y] = await Promise.all([hmac(secret, String(a)), hmac(secret, String(b))]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function makeSession(env, email) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const body = b64url(enc.encode(JSON.stringify({ sub: email, exp })));
  const sig = b64url(await hmac(env.SESSION_SECRET, body));
  return { token: body + '.' + sig, exp };
}
async function checkSession(env, request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;
  const expected = b64url(await hmac(env.SESSION_SECRET, body));
  if (!(await safeEqual(sig, expected, env.SESSION_SECRET))) return false;
  try {
    const data = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    return data.exp > Date.now();
  } catch (e) { return false; }
}

function github(env, path, init = {}) {
  return fetch('https://api.github.com/repos/' + cfg(env, 'GITHUB_OWNER') + '/' + cfg(env, 'GITHUB_REPO') + path, {
    ...init,
    headers: {
      'Authorization': 'Bearer ' + env.GITHUB_TOKEN,
      'Accept': init.accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'liswan-dev-publish-worker',
      'Content-Type': 'application/json'
    }
  });
}
async function githubError(res) {
  const j = await res.json().catch(() => ({}));
  return 'GitHub ' + res.status + ': ' + (j.message || 'error');
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = cfg(env, 'ALLOWED_ORIGINS').split(',').map(s => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (origin && !allowed.includes(origin)) return json(403, { error: 'Origin tidak diizinkan' });
    for (const k of ['GITHUB_TOKEN', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'SESSION_SECRET']) {
      if (!env[k]) return json(500, { error: 'Worker belum lengkap: variabel ' + k + ' belum diisi' });
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === '/ping') return json(200, { ok: true });

      if (url.pathname === '/login' && request.method === 'POST') {
        const { email = '', password = '' } = await request.json().catch(() => ({}));
        const okEmail = await safeEqual(String(email).trim().toLowerCase(), cfg(env, 'ADMIN_EMAIL').toLowerCase(), env.SESSION_SECRET);
        const okPass = await safeEqual(password, env.ADMIN_PASSWORD, env.SESSION_SECRET);
        if (!okEmail || !okPass) {
          await new Promise(r => setTimeout(r, 1200)); // slow down password guessing
          return json(401, { error: 'Email atau password salah' });
        }
        const s = await makeSession(env, cfg(env, 'ADMIN_EMAIL'));
        return json(200, { ...s, name: cfg(env, 'ADMIN_NAME') || 'Admin', email: cfg(env, 'ADMIN_EMAIL') });
      }

      if (!(await checkSession(env, request))) return json(401, { error: 'Sesi login habis — silakan login ulang' });
      const branch = encodeURIComponent(cfg(env, 'GITHUB_BRANCH'));

      if (url.pathname === '/get' && request.method === 'GET') {
        const path = url.searchParams.get('path') || '';
        if (!WRITABLE.test(path)) return json(400, { error: 'Path tidak diizinkan: ' + path });
        const res = await github(env, '/contents/' + path + '?ref=' + branch, { accept: 'application/vnd.github.raw+json' });
        if (res.status === 404) return json(404, { error: 'File belum ada' });
        if (!res.ok) return json(502, { error: await githubError(res) });
        return new Response(await res.text(), { status: 200, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }

      if (url.pathname === '/put' && request.method === 'POST') {
        const { path = '', base64 = '', message = '' } = await request.json().catch(() => ({}));
        if (!WRITABLE.test(path)) return json(400, { error: 'Path tidak diizinkan: ' + path });
        if (!base64 || base64.length > MAX_BYTES * 1.4) return json(413, { error: 'File kosong atau terlalu besar' });
        const existing = await github(env, '/contents/' + path + '?ref=' + branch);
        let sha;
        if (existing.ok) sha = (await existing.json()).sha;
        else if (existing.status !== 404) return json(502, { error: await githubError(existing) });
        const res = await github(env, '/contents/' + path, {
          method: 'PUT',
          body: JSON.stringify({ message: message || 'Update ' + path + ' via admin', content: base64, branch: cfg(env, 'GITHUB_BRANCH'), sha })
        });
        if (!res.ok) return json(502, { error: await githubError(res) });
        return json(200, { ok: true, path: '/' + path });
      }

      return json(404, { error: 'Not found' });
    } catch (e) {
      return json(500, { error: String(e && e.message || e) });
    }
  }
};
