# Community Camera Map: notes for agents

Live: https://enriquecorado.github.io/community-camera-map/ (GitHub Pages, repo
EnriqueCorado/community-camera-map). `EnriqueCorado/stanislaus-cam-map` is a
separate redirect-only repo: never push code there. The local checkout still
lives at `~/dev/stanislaus-cam-map`.

Static React/TS/Vite/MapLibre site (`frontend/`), FastAPI backend (`backend/`)
used for local dev and for baking data in CI, Playwright tests (`e2e/`), and a
Vercel relay (`relay/`: `/api/flights`, `/api/count` usage counter on Upstash
KV, `/api/inbound` Resend webhook that forwards corrections mail; its firewall
rule "Only the relay's own paths" lives in Vercel only and must list every
endpoint).

## Commands

```bash
# backend
cd backend && uv run pytest -q && uv run ruff check . && uv run ruff format --check .
# frontend typecheck / static build (what Pages ships)
cd frontend && npm run lint
cd frontend && VITE_STATIC=1 VITE_BASE=/ npm run build      # tsc, vite, prerender help pages, split catalog
# unit tests (Playwright, no browser server needed)
cd e2e && npx playwright test tests/unit-
# map/popup suites run ONLY against a dev server (window.__map exists only in dev builds)
cd e2e && BASE_URL=http://localhost:5611 npx playwright test      # vite --port 5611 with API_TARGET -> uvicorn :8611
# static/live smoke tests
cd e2e && STATIC_URL=http://localhost:4178 npx playwright test tests/static-smoke.spec.ts   # vite preview of dist
```

Restart uvicorn after backend/spec changes. Long-running dev servers on
5173/8000 may be days old: point tests at fresh servers or results lie.
Playwright 1.64 compiles test imports to CommonJS, so specs must import
frontend modules statically (no `await import()`), and modules they import
must not use `import.meta` or top-level await.

## Layers

- Registry: `backend/app/layers/service.py` plus packs in
  `backend/app/layers/national/*.py` (auto-registered; must export `LAYERS`,
  and `SOURCES` credits for bake.py; `_`-prefixed modules are helpers).
- State layers: `backend/app/layers/data/state_layers/*.json` (browser views of
  agency ArcGIS services, validated by `national/states.py`). Add specs only
  through `scripts/verify_state_specs.py IN.json OUT.json` (checks CORS for the
  site origin, GeoJSON, fields, and rejects layers anonymous users can edit,
  including through a MapServer's FeatureServer twin), then run
  `scripts/sync_state_specs.py` (writes `frontend/src/state-hosts.json` and
  `state-bboxes.json`; a test enforces sync).
- Names start with the state code (`tx-...`); coverage is the USPS code. The
  build's catalog split (`frontend/scripts/split-catalog.mjs`) fails if a name
  and its coverage disagree.
- After registry changes, update `frontend/public/data/layers.json` with
  `sync_catalog` (see `scripts/refresh_live.py`); CI also does this.
- Privacy rules for allowlisted fields: never people's names (owners, lessees,
  staff, officials, requesters, well or site names that are personal names),
  emails, personal phones, home-based child care, or domestic-violence shelter
  locations. Parcels may show parcel id, site address, acreage, land use and
  value; never owner or mailing fields. Organization phone numbers are fine.
- Currency: data edited within ~3 years, or static boundaries.
- Every layer needs `title_es` (plain Latin American Spanish).

## Frontend

- The static site loads `data/catalog/base.json` (national layers) first and
  `data/catalog/<ST>.json` when that state is under the map center or one of
  its layers is on (`hooks/useLayers.ts`, `App.tsx`); `data/catalog/index.json`
  powers "In other states" search and loads only when someone types.
- Quick views (`presets.ts`) add on-screen state layers by name pattern
  (`stateLayers`, e.g. `VOTING_SITE`).
- Popups escape every string (`popupHtml`); links must pass host allowlists in
  `popup-logic.ts`.
- All UI text goes in `i18n.tsx` in both English and Spanish.

## Help area

The free-help tools (`frontend/src/help/`, `components/help/`, `landing/`) are
maintained in a separate session. Rule one: nothing a person types is stored or
sent anywhere (no localStorage, cookies or requests with their input; tests
enforce it). Everything is bilingual (`Record<Lang, Copy>`).

- Facts are `{id, cite, en, es}` with a source and a checked date, shown with
  `FactList` / `Sources` (`components/help/ui.tsx`). Every tool has an upkeep
  item in `help/upkeep.ts`; a weekly CI job opens an issue 45 days before one is
  due. Legal facts (rights, DACA, taxes, family plan) got a safety review against
  primary sources: don't reword them without re-checking the source.
- Generated files, never hand-edited: `help/rights-facts.ts` (from
  `~/dev/outreach-help-2026-10/make_rights.py`, which holds every safety-review
  rewrite in `OVR`/`APPEND`/`ES_FIX`/`EN_FIX`) and `help/civics-questions.ts`
  (`make_civics.py`). Research archives are in `.../research/`.
- Panel tabs and their views are listed in `help/target.ts` (URL
  `#help=<tab>&hv=<view>`). A new tool needs entries in `landing/tools.ts` (public
  `/help/` + `/ayuda/` pages), `help/start.ts` (start chooser and `/h/<slug>/`
  short links), `relay/src/counter.ts` (`PAGE_IDS`/`APP_IDS`, then redeploy the
  relay), `report={{ topic, checked }}` on its `Sources`, and an upkeep item. Unit
  tests fail until each is added.
- The corrections address is one constant, `REPORT_EMAIL` in `help/report.ts`.
- Help tests: build with `VITE_STATIC=1 VITE_BASE=/community-camera-map/`, run
  `vite preview`, then run every `help-*` and `unit-*` spec with `BASE_URL` set to
  the preview. Leave out `a11y-i18n` and the other map suites: they only work on
  the dev server. `help-counter.spec.ts` needs a build with
  `VITE_COUNTER_URL=https://counter.invalid/api/count`.
- Public pages (`landing/`) are prerendered with a strict CSP: one inline script
  (`landing/client.js`, allowed by hash) and no outside requests except the
  counter. Flyers must print on one letter page; a test checks this.
- Hand merges of parallel branches have dropped closing braces in CSS and
  separators between object-literal entries. `tsc` catches the TS ones, but not
  CSS. After any manual conflict resolution, check every `*.css` brace balances
  and rerun the flyer print test.
- No prettier config: don't run prettier (it rewraps whole files).

## Working agreements

- Pull before pushing; another session pushes to `main` too. Merge (don't
  rebase) when local history has merge commits.
- Never commit secrets (a gitleaks pre-commit hook runs). Keys live in
  backend/.env (local), macOS Keychain, and GitHub secrets.
- Run the checks above before claiming done; dispatch reviewers for
  non-trivial changes.
