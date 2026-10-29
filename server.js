/**
 * Servidor Web Local para o Dashboard de Ponto e Vale Alimentação (V4)
 * Não requer nenhuma dependência externa (Zero npm dependencies)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Proxy de requisições /api/ diretamente para o motor de automação NGPonto (porta 3050)
  if (req.url.startsWith('/api/')) {
    const proxyReq = http.request({
      host: '127.0.0.1',
      port: 3050,
      path: req.url,
      method: req.method,
      headers: req.headers
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, erro: 'Motor de automação (porta 3050) indisponível: ' + err.message }));
    });
    req.pipe(proxyReq);
    return;
  }

  let reqUrl = req.url.split('?')[0];
  if (reqUrl === '/' || reqUrl === '') {
    reqUrl = '/index.html';
  }

  const safePath = path.normalize(reqUrl).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end('<h1>404 Não Encontrado</h1><p>Arquivo não encontrado no servidor local.</p>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const url = `http://localhost:${PORT}`;
    console.log(`Porta ${PORT} já está em uso pelo Motor Integrado. Abrindo navegador...`);
    if (process.platform === 'win32') {
      exec(`start ${url}`);
    }
    setTimeout(() => process.exit(0), 1000);
  } else {
    console.error('Erro no servidor web local:', err);
  }
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log('================================================================');
  console.log('   DASHBOARD DE PONTO E VALE ALIMENTAÇÃO (V4) - SERVIDOR LOCAL   ');
  console.log('================================================================');
  console.log(` Servidor ativo e pronto em: ${url}`);
  console.log(' Pressione Ctrl+C para encerrar o servidor.');
  console.log('================================================================');

  // Abrir automaticamente no navegador padrão do Windows
  if (process.platform === 'win32') {
    exec(`start ${url}`);
  }
});
