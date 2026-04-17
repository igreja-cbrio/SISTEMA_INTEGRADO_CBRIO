/**
 * Script one-time para gerar o Refresh Token do YouTube Analytics OAuth2.
 * Uso: node scripts/get-youtube-token.js
 */
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

const CLIENT_ID = process.env.YT_CLIENT_ID || '';
const CLIENT_SECRET = process.env.YT_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://localhost:3000/oauth/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
].join(' ');

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Defina YT_CLIENT_ID e YT_CLIENT_SECRET antes de rodar:');
  console.error('  YT_CLIENT_ID=... YT_CLIENT_SECRET=... node scripts/get-youtube-token.js');
  process.exit(1);
}

console.log('\n=== YouTube OAuth2 Token Generator ===\n');
console.log('Abrindo navegador para autorizar...\n');

try { execSync(`open "${authUrl}"`); } catch (_) {
  console.log('Abra manualmente no navegador:\n', authUrl, '\n');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');
  if (url.pathname !== '/oauth/callback') { res.end('ok'); return; }

  const code = url.searchParams.get('code');
  if (!code) {
    res.end('Erro: sem code na URL');
    server.close();
    return;
  }

  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  }).toString();

  const tokenRes = await new Promise((resolve) => {
    const req2 = https.request(
      { hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } },
      (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(JSON.parse(d))); }
    );
    req2.write(body);
    req2.end();
  });

  if (tokenRes.refresh_token) {
    console.log('\n✅ SUCESSO!\n');
    console.log('=== Adicione estas variáveis no Vercel ===\n');
    console.log(`YOUTUBE_CLIENT_ID=${CLIENT_ID}`);
    console.log(`YOUTUBE_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`YOUTUBE_REFRESH_TOKEN=${tokenRes.refresh_token}`);
    console.log('\n==========================================\n');
    res.end('<h2>Autorizado! Verifique o terminal.</h2>');
  } else {
    console.error('\n❌ Erro ao obter token:', tokenRes);
    res.end('<h2>Erro. Verifique o terminal.</h2>');
  }
  server.close();
});

server.listen(3000, () => {
  console.log('Servidor aguardando callback em http://localhost:3000 ...\n');
});
