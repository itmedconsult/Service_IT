# Deploy DoctorEase Edge Function

Create an Edge Function named `doctorease-services` in the Supabase Dashboard, replace its editor contents with `index.ts`, and deploy it.

In **Edge Functions → Secrets**, add these secrets (do not commit their values):

- `DOCTOREASE_BASE_URL`
- `DOCTOREASE_API_KEY`
- `DOCTOREASE_PRODUCTS_PATH`

Use the same values previously used by the local `.env` file. After the secret values are saved, they are available to the Function immediately.
