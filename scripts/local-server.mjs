import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handler as searchBooks } from '../netlify/functions/search-books.mjs';
import { handler as holidays } from '../netlify/functions/holidays.mjs';

const root = fileURLToPath(new URL('../site', import.meta.url));
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 8888);
const host = process.env.HOST || '127.0.0.1';

await loadEnv();

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === '/api/search-books') {
      const result = await searchBooks({
        httpMethod: request.method,
        queryStringParameters: Object.fromEntries(url.searchParams.entries())
      });

      response.writeHead(result.statusCode, {
        'content-type': result.headers?.['content-type'] || 'application/json; charset=utf-8'
      });
      response.end(result.body);
      return;
    }

    if (url.pathname === '/api/holidays') {
      const result = await holidays({
        httpMethod: request.method,
        queryStringParameters: Object.fromEntries(url.searchParams.entries())
      });

      response.writeHead(result.statusCode, {
        'content-type': result.headers?.['content-type'] || 'application/json; charset=utf-8'
      });
      response.end(result.body);
      return;
    }

    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const filePath = join(root, safePath);
    const body = await readFile(filePath);
    response.writeHead(200, { 'content-type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(body);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(error.code === 'ENOENT' ? 'Not found' : error.message);
  }
});

server.listen(port, host, () => {
  console.log(`Local server: http://${host}:${port}`);
});

async function loadEnv() {
  try {
    const envPath = await findEnvFile();
    const envText = await readFile(envPath, 'utf8');

    envText.split('\n').forEach((line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }

      const separatorIndex = trimmed.indexOf('=');

      if (separatorIndex === -1) {
        return;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function findEnvFile() {
  const candidates = [
    join(projectRoot, 'naver-keys.env'),
    join(projectRoot, '.env')
  ];

  for (const candidate of candidates) {
    try {
      await readFile(candidate, 'utf8');
      return candidate;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return candidates[0];
}
