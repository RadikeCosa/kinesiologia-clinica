# AGENTS.md

## Purpose

This repository contains the new private clinical application for a single independent home-care physiotherapy professional. It replaces the legacy `/admin` surface incrementally; it is not the public landing and is not a full EHR or multi-user SaaS.

## Product language

- Use `visita` as the primary UI term.
- `sesión` may be used naturally in summaries and reports.
- An `intervención` is work performed within a visit, not the visit itself.
- Keep patient, request, treatment, visit, metric, summary and period report as distinct concepts.

## Architecture

Dependencies point inward:

`UI -> application -> domain <- infrastructure`

- UI must not receive raw FHIR resources.
- Domain must not depend on Next.js, HTTP or FHIR representations.
- Application defines persistence and integration ports.
- Infrastructure implements those ports and owns FHIR mapping.
- Browser code must never know `FHIR_BASE_URL` or communicate directly with HAPI FHIR.
- Reuse legacy contracts only with their tests and after removing route-level coupling.

## Current status

Only the technical foundation and a server-side FHIR health check are implemented. Do not claim that authentication, patients, visits, PWA, offline sync or reports exist until the code proves it.

## Privacy

Never commit real patient data, identifiers, clinical notes, addresses, phone numbers, screenshots, secrets, private URLs, backups or FHIR exports. Tests and demos use clearly fictional data only.

## Documentation

- `README.md` gives the project entry point.
- `docs/product.md` defines product scope.
- `docs/architecture.md` defines technical boundaries and migration order.
- `docs/privacy.md` defines privacy and environment rules.

Update documentation only when behavior or a durable contract changes.

## Validation

Run the smallest relevant checks:

```bash
npm run lint
npm run test
FHIR_BASE_URL=http://localhost:8081/fhir npm run build
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
