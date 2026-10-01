# Web deployment — metropolis.cherrymoney.co.uk

The browser build is exported from the existing Expo/React Native application.

## Build

```bash
npm install --workspaces --include-workspace-root
npm run web:build
```

The deployable static site is generated in:

```text
apps/mobile/dist/
```

CI uploads the same directory as the `metropolis-web` artifact.

## Hostinger deployment

The existing Hostinger subdomain already provides infrastructure that must not be removed:

- `/graphql/` — stable public proxy to the active Envio deployment.
- `/.well-known/apple-app-site-association` — Apple passkey association.
- `/.well-known/assetlinks.json` — Android Digital Asset Links.

The web bundle contains exact copies of the two current `.well-known` files so replacing the placeholder does not break native Mera passkey recovery.

**Do not delete or replace the server's existing `.htaccess`, `graphql` directory, proxy script, or Hostinger proxy rule.**

Upload the *contents* of `apps/mobile/dist/` to the document root configured for `metropolis.cherrymoney.co.uk`, replacing only the placeholder site files.

The application does not require client-side route fallback for the current judge flow, so no new Hostinger rewrite rule is required.

## Vercel deployment

The root `vercel.json` builds the Expo web target and proxies `/graphql` to the active public Envio endpoint. If the custom domain is moved to Vercel later, verify the two `.well-known` resources and `/graphql/` before switching DNS.

## Production smoke test

1. `https://metropolis.cherrymoney.co.uk/` renders Cherry Pay Global.
2. `/.well-known/apple-app-site-association` returns HTTP 200 JSON without redirect.
3. `/.well-known/assetlinks.json` returns HTTP 200 JSON without redirect.
4. POST a GraphQL `{ __typename }` query to `/graphql/`; expect `query_root`.
5. Monad network shows chain ID `10143`.
6. A Mera passkey can be created/recovered on the production RP domain.
7. Cherry Money WebMCP can load the demo payment draft from the browser.
8. Envio analytics loads from the stable `/graphql/` route.

Do not commit bearer tokens, private keys, API keys, or wallet material.
