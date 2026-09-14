# InnerDweS Project Constitution

## Product and repository

- This repository contains InnerDweS. The deployable Next.js application lives in `app/`.
- Vercel is the active hosting platform. Netlify is legacy; do not introduce Netlify runtime or deployment dependencies.
- Preserve legitimate external Wonderland demo links and harmless legacy ignore rules when they are not InnerDweS runtime dependencies.

## Safety rules

- Read the active task completely before acting. Stop on any task safety-gate mismatch.
- Never expose secrets, environment-variable values, tokens, connection strings, cookies, personal data, guest codes, or production customer data.
- Never commit `.env*`, `.vercel/**`, `.netlify/**`, generated build output, dependency directories, caches, or `app/supabase/.temp/**`.
- Never discard pre-existing local changes. Do not use `git reset --hard`, `git clean`, destructive checkout/restore, force-push, or history rewriting.
- Do not change, merge, rebase, push, or deploy `main` unless the active task explicitly authorizes the exact action and all of its gates pass.
- Do not deploy or promote to Vercel Production unless the active task explicitly authorizes Production and all launch gates pass.
- Vercel Preview work must remain isolated from Production domains, aliases, branch settings, and environment values.
- Supabase inspection is read-only unless the active task explicitly authorizes a narrowly scoped mutation. Never execute SQL or alter production data/settings merely to test.
- DNS and registrar mutations require explicit task authorization.
- Stripe, payments, billing, checkout, webhooks, price IDs, and payment secrets are out of scope unless an active task explicitly includes them.

## Engineering rules

- Treat Guest Access and trusted client-IP handling as security-sensitive and fail closed in production-relevant execution.
- On Vercel, trust only the explicitly verified Vercel client-IP contract. Never trust `x-nf-client-connection-ip` or arbitrary client forwarding headers.
- Keep local-development fallbacks explicit, narrow, and tested.
- Make the smallest necessary change; avoid unrelated refactors and dependency additions.
- Use the existing lockfile and `npm ci` for clean verification.
- Before an authorized commit, run type generation, TypeScript checking, lint, the full test suite, production build, and diff hygiene checks in a clean isolated state.
- Report observed facts separately from assumptions and never invent browser, integration, security, or deployment evidence.
