import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const PORT = Number(process.env.PORT ?? 8787);
let cache = { expiresAt: 0, items: [] };

async function loadEnv() {
  const values = {};
  const text = await readFile('.env', 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  }
  return values;
}

async function getDoctorEaseServices() {
  if (Date.now() < cache.expiresAt) return cache.items;
  const env = await loadEnv();
  if (!env.DOCTOREASE_API_KEY) throw new Error('DOCTOREASE_API_KEY is not configured');
  const items = [];
  let offset = 0;
  do {
    const url = new URL(env.DOCTOREASE_PRODUCTS_PATH ?? '/api/v1/public/services', env.DOCTOREASE_BASE_URL);
    url.searchParams.set('limit', '500');
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, { headers: { 'X-API-Key': env.DOCTOREASE_API_KEY } });
    if (!response.ok) throw new Error(`DoctorEase API returned ${response.status}`);
    const payload = await response.json();
    items.push(...(payload.items ?? []).map((item) => ({ code: item.code, price: item.price, updatedAt: item.updated_at ?? null })));
    if (!payload.pagination?.has_more) break;
    offset = payload.pagination.next_offset;
  } while (offset !== null && offset !== undefined);
  cache = { items, expiresAt: Date.now() + 15 * 60 * 1000 };
  return items;
}

createServer(async (request, response) => {
  if (request.method !== 'GET' || request.url !== '/api/doctorease/services') {
    response.writeHead(404).end(); return;
  }
  try {
    const items = await getDoctorEaseServices();
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ items }));
  } catch (error) {
    response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'DoctorEase request failed' }));
  }
}).listen(PORT, () => console.log(`DoctorEase proxy listening on http://localhost:${PORT}`));
