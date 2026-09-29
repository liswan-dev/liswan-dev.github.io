/*
 * Address of the publish API (Cloudflare Worker, see cloudflare-worker/publish-worker.js).
 * When set, /admin/ login and every "Publish" button go through it — the GitHub token
 * stays on the server. Leave empty to fall back to demo login + GitHub token mode.
 * Example: 'https://liswan-publish.<your-subdomain>.workers.dev'
 */
window.PUBLISH_API = '';
