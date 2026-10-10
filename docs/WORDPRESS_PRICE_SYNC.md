# WordPress Price Sync

The WordPress plugin in `wordpress-plugin/medconsult-price-sync` provides the secure write gateway for the external price-control app.

## Request flow

1. A staff member signs in to the web app with Supabase Auth.
2. The app sends its Supabase access token to the WordPress endpoint.
3. WordPress validates the token with Supabase Auth.
4. WordPress checks `app_metadata.role` or `app_metadata.roles` against the configured allow-list.
5. WordPress updates `public.products` using that user's token.
6. After Supabase confirms the update, WordPress updates the matching `service_product` ACF record.
7. The plugin records the operation in its audit table.

The plugin never uses a `service_role` key. Browser applications must use only a publishable key.

## Required Supabase authorization

Assign authorized staff a role in `app_metadata`, such as `price_admin`. Do not use `user_metadata` for authorization because users can edit it themselves.

The `products` table should have RLS enabled with SELECT and UPDATE policies that check the same app metadata role. Until RLS is enabled, a client with the publishable key can bypass WordPress and write directly to the table.

A reviewable policy draft is provided in `docs/SUPABASE_PRODUCTS_RLS.sql`. Do not apply it until at least one intended staff account has `app_metadata.role = price_admin` or `admin`; otherwise all price updates will be blocked.

## Single price update

```ts
export async function updatePrice(
  wordpressBaseUrl: string,
  accessToken: string,
  code: string,
  price: number,
) {
  const response = await fetch(
    `${wordpressBaseUrl}/wp-json/medconsult-price-sync/v1/products/${encodeURIComponent(code)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ price }),
    },
  );

  if (!response.ok) {
    throw new Error(`Price update failed: ${response.status}`);
  }
  return response.json();
}
```

## Bulk update

Send up to 100 items to:

```text
POST /wp-json/medconsult-price-sync/v1/bulk-prices
```

```json
{
  "items": [
    { "code": "LH293", "price": 1999 },
    { "code": "ABO001", "price": 250 }
  ]
}
```

The endpoint returns HTTP 207 if only part of a batch succeeds.

## Website promotion prices

The separate `/website-prices` page in the app lists numeric price cells from the TablePress tables embedded in the published WordPress `/promotion/` page (page ID 8080). It reads the actual TablePress table data, not the 2,550-product Supabase catalog. The plugin discovers table IDs from the published page HTML at request time, including tables inside the Aesthetic tabs, and uses the Elementor shortcodes only if the page request fails.

`GET /wp-json/medconsult-price-sync/v1/promotion-prices` lists these prices. `POST` to the same route changes one numeric price cell using the same Supabase Admin bearer token as the existing price API. The request must include `table_id`, zero-based `row_index` and `column_index`, `expected_raw`, and `price`. A changed `expected_raw` returns HTTP 409 so an old app tab cannot overwrite a newer TablePress edit. The plugin saves the actual TablePress table, which invalidates its output cache. The app reloads the list to verify the saved value.

This route updates the WordPress promotion table directly; it does not assume that the website row has a matching DoctorEase or Supabase product code. Cells containing formulas, markup, or non-numeric text are intentionally excluded from this editor. If a website cache remains stale, purge the page/CDN cache after saving.

## Displaying the live price in Elementor

Add an Elementor **Shortcode** widget and use the product code that should appear on that page:

```text
[medconsult_price code="LH293"]
```

The shortcode reads the latest `current_price` ACF value at render time. Optional attributes are `prefix`, `decimals`, and `unavailable`, for example:

```text
[medconsult_price code="LH293" prefix="฿" decimals="2" unavailable="สอบถามราคา"]
```

## Deployment

```sh
cd wordpress-plugin
zip -r medconsult-price-sync.zip medconsult-price-sync
```

Upload the resulting archive in WordPress, activate it, then configure it in **Settings → Price Sync**.
