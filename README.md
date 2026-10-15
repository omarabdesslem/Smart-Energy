# Design & Propose

A minimal black-and-white React prototype inspired by Reonic's solar design workflow. Orbit a real 3D house, click a roof section to add or remove a solar panel, and turn the layout into a professional printable proposal.

## Run

With Docker Desktop running:

```sh
docker compose up --build -d
```

Open **http://localhost:5173**. No host Node.js installation is required. PostgreSQL and the API start automatically; migrations preserve existing records. Services bind only to the local machine.

```sh
docker compose stop       # Stop without deleting data
docker compose up -d     # Start again
docker compose logs -f api web
```

## Try it

1. Click any of the 30 roof sections to add or remove a panel. The example starts with 12 panels until you save a different layout.
2. Drag to rotate the perspective camera; scroll or use the zoom controls to zoom. Choose **3D**, **Roof**, or **Front** for preset views. **Fit house to view** restores the default perspective. Use **Undo panel change** or **Remove all panels** to edit the layout. Keyboard users can rotate the focused viewer with arrow keys and toggle a focused roof section with Enter or Space.
3. Choose a 450 W or 475 W module. Capacity, illustrative annual generation, and estimated price update immediately.
4. Edit the project and customer details with the pencil button.
5. Select **Save design** to persist the layout in PostgreSQL. A reload restores the saved configuration. Stale saves from another tab are rejected instead of overwriting newer work.
6. Select **Generate proposal**. This saves any unsaved changes and creates a proposal containing the roof layout, customer details, module count, capacity, and itemized estimate. Use **Print / Save PDF** to export through the browser.

## Interactive 3D house

The house, roof, windows, frames, gutters, and solar modules are real Three.js geometry, viewed through a perspective camera. Orbit controls rotate around the house without changing the saved solar layout. Panels and selectable outlines share the same 3D roof coordinates, so their position follows the roof at every angle.

The designer uses WebGL with lighting and shadows. If the browser cannot create a WebGL context, it shows a clearly labeled fixed-perspective house image with editable roof sections instead. The proposal captures the same 3D model as a print-safe image, so the exported document keeps correct surface visibility and panel placement. The fixed-view fallback is also printable. There are no new image assets or external 3D model downloads. The original single house image is used only for the fixed-view fallback.

This is a conceptual house model, not photogrammetry or a measured survey. Roof dimensions and panel slots are illustrative.

## Stack

- React 19, TypeScript, Vite, TanStack Query, and Three.js.
- Fastify API, PostgreSQL 17, parameterized SQL, and versioned migrations.
- Shared Zod schemas, panel settings, and proposal calculations.
- Node API integration tests and Playwright browser tests.

```text
apps/web/src/App.tsx          Designer screen and proposal document
apps/web/src/HouseScene.tsx   Perspective camera, orbit controls, projected roof targets
apps/web/src/house-model.ts  House geometry, roof coordinates, and solar modules
apps/web/src/design.css       Monochrome responsive layout and print styles
apps/api/src/design.ts        Layout API and concurrent-edit protection
packages/contracts/src/      Shared schemas, types, and estimate calculations
database/003_pv_designs.sql   Additive layout-storage migration
tests/workflow.spec.ts        Browser workflow and mobile checks
```

The local workspace stores one shared design. The previous inspection backend and its data remain intact, but the visible interface has been replaced by Design & Propose.

## Checks

With the app running:

```sh
docker compose exec api npm run build
docker compose exec -e TEST_DATABASE_URL=postgres://energy:energy_local@db:5432/energy api npm test
docker compose --profile test run --rm e2e
```

API tests use an isolated temporary PostgreSQL schema. Browser tests temporarily edit the local design, then restore its previous configuration if no concurrent user save has occurred. Screenshots and traces are written to the ignored `test-results/` directory. The optional browser image is downloaded on its first run.

For host development, use Node.js 22.12+, run `npm ci`, start the database with `docker compose up -d db`, and source `.env.example` into your shell. Run `npm run db:migrate`, then `npm run dev:api` and `npm run dev:web` in separate terminals. The backend does not automatically read `.env` files.

## Netlify frontend build

The root `netlify.toml` builds the npm workspaces from the repository root with Node.js 22 and publishes `apps/web/dist`. It also includes the React single-page-app rewrite. These settings follow Netlify's [monorepo guidance](https://docs.netlify.com/build/configure-builds/monorepos/).

The shared contracts package has one entry point: `@energy/contracts`, exported from `packages/contracts/src/index.ts`. It includes the inspection and solar-design schemas, types, and calculations. Web, API, and test imports all use this entry point; there are no contracts subpath imports or separate generated files. Vite and the API's `tsx` runtime compile the TypeScript source directly.

Include `packages/contracts/package.json`, `packages/contracts/src/index.ts`, the updated imports in `apps/` and `tests/`, and `netlify.toml` in the deployed commit, together with the root lockfile. Deploying only the web changes leaves the shared package out of sync. After pushing the complete change, use Netlify's **Clear cache and deploy site** option if the previous resolver failure persists.

This configuration builds the frontend only. Netlify does not run the Docker PostgreSQL/Fastify services, and the Vite development proxy is not part of the static build. Saved designs and proposal generation still require a separately hosted API and an `/api` proxy to it. The local API retains its production-mode guard.

## Prototype boundaries

This independent concept has no Reonic integration or user sign-in. The API refuses `NODE_ENV=production` until authentication and project authorization are implemented.

Proposal prices and generation figures are explicitly illustrative. Assumptions are 950 kWh/kWp/year; €175 per 450 W module or €195 per 475 W module; €1,500 inverter; and €2,000 installation plus €70 per module, excluding VAT. This is not a roof suitability assessment, shade simulation, or binding installation quote.
