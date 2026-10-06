# Magic Chess pitch Worker

This standalone Cloudflare Worker serves the current Magic Chess devnet proof page. It intentionally has no runtime bindings or secrets.

## Develop

From the repository root:

```sh
npx wrangler dev --config docs/archive/pitch-worker/wrangler.jsonc
```

Run its regression tests with:

```sh
node --test docs/archive/pitch-worker/_worker.test.mjs
```

## Deploy

```sh
npx wrangler deploy --config docs/archive/pitch-worker/wrangler.jsonc
```

The Wrangler name remains `pitch`, so this updates the existing Worker instead of creating another service. No frontend or backend environment variables are required.
