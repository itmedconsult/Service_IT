const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type DoctorEaseItem = {
  code: string;
  price: number;
  updatedAt: string | null;
};

let cache: { expiresAt: number; items: DoctorEaseItem[] } = { expiresAt: 0, items: [] };

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);

  try {
    if (Date.now() < cache.expiresAt) return response({ items: cache.items });

    const apiKey = Deno.env.get('DOCTOREASE_API_KEY');
    const baseUrl = Deno.env.get('DOCTOREASE_BASE_URL') ?? Deno.env.get('DOCTOREASE_API_BASE_URL');
    const servicesPath = Deno.env.get('DOCTOREASE_PRODUCTS_PATH') ?? '/api/v1/public/services';
    if (!apiKey || !baseUrl) return response({ error: 'DoctorEase secrets are not configured' }, 500);

    const items: DoctorEaseItem[] = [];
    let offset = 0;
    do {
      const url = new URL(servicesPath, baseUrl);
      url.searchParams.set('limit', '500');
      url.searchParams.set('offset', String(offset));
      const doctorEaseResponse = await fetch(url, { headers: { 'X-API-Key': apiKey } });
      if (!doctorEaseResponse.ok) return response({ error: `DoctorEase API returned ${doctorEaseResponse.status}` }, 502);

      const payload = await doctorEaseResponse.json();
      items.push(...(payload.items ?? []).map((item: { code?: string; price?: number; updated_at?: string | null }) => ({
        code: item.code ?? '',
        price: Number(item.price),
        updatedAt: item.updated_at ?? null,
      })).filter((item: DoctorEaseItem) => item.code));

      if (!payload.pagination?.has_more) break;
      offset = payload.pagination.next_offset;
    } while (offset !== null && offset !== undefined);

    cache = { items, expiresAt: Date.now() + 15 * 60 * 1000 };
    return response({ items });
  } catch (error) {
    console.error(error);
    return response({ error: 'Unable to load DoctorEase services' }, 502);
  }
});
