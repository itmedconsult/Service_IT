=== MedConsult Price Sync ===
Contributors: medconsult-it
Tags: acf, supabase, prices, rest-api
Requires at least: 6.5
Requires PHP: 8.1
Stable tag: 1.0.1
License: GPLv2 or later

Securely updates Supabase product prices and mirrors the result to Service Products ACF records.

== Installation ==

1. Zip the medconsult-price-sync directory and upload it in Plugins > Add New Plugin.
2. Activate the plugin.
3. Open Settings > Price Sync.
4. Add the Supabase project URL and a publishable key.
5. Set the allowed Supabase app_metadata roles, for example price_admin,admin.

Never use a Supabase service_role or secret key in this plugin or in a browser application.

== API ==

PUT /wp-json/medconsult-price-sync/v1/products/{code}

Headers:
Authorization: Bearer <Supabase access token>
Idempotency-Key: <unique client operation id>
Content-Type: application/json

Body:
{"price": 1999}

POST /wp-json/medconsult-price-sync/v1/bulk-prices

Body:
{"items":[{"code":"LH293","price":1999}]}

The plugin validates the access token with Supabase Auth and authorizes only roles stored in app_metadata.
