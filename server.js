// Локальный просмотр сайта: node server.js → http://localhost:3000
// База данных — в Supabase (см. supabase.sql и config.js), этот сервер только отдаёт файлы.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 3000;
const FILES = new Set(['index.html', 'admin.html', 'style.css', 'script.js', 'admin.js', 'config.js']);
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

http.createServer((req, res) => {
  const file = new URL(req.url, 'http://x').pathname.slice(1) || 'index.html';
  if (!FILES.has(file)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] + '; charset=utf-8' });
  fs.createReadStream(path.join(__dirname, file)).pipe(res);
}).listen(PORT, () => console.log(`NOIR COFFEE: http://localhost:${PORT}  (персонал: /admin.html)`));
