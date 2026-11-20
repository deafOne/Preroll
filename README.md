# Preroll.org

Launch-ready 21+ cannabis information and community site.

## Deploy

### Frontend
The repository root is the static frontend. GitHub Pages can serve it directly.

### Backend — one Render Blueprint
1. Open Render.
2. Choose **New → Blueprint**.
3. Select this repository.
4. Render reads `render.yaml` and creates the Node API plus PostgreSQL.
5. Confirm:
   - `DATABASE_URL` — supplied by Render
   - `ALLOWED_ORIGIN=https://preroll.org`
   - `NODE_ENV=production`
6. Check the API at `/api/health`.
7. If Render assigns a hostname different from `config.js`, update `API_URL` to that hostname and push the change.

## Authentication

- PostgreSQL-backed users and sessions
- bcrypt password hashing
- minimum 12-character passwords
- random database-backed session tokens
- HttpOnly + Secure cookies
- `SameSite=None` for the cross-site frontend/API arrangement
- no authentication token in localStorage
- login/signup rate limiting
- strict Origin checking on state-changing requests
- generic server error responses
- authenticated forum posting and reviews

## Free live data

The production data layer uses **only sources that do not require a signup, API key, paid plan, or secret credential**:

- **New York State OCM/Open Data** — current OCM license records through the public State Open Data/Socrata endpoint.
- **New York State OCM Pressroom** — official live cannabis news and regulatory updates fetched directly from the public OCM pressroom.

The server caches these feeds to reduce upstream requests.

The following signup/key-dependent providers have been removed from the production path:

- NewsAPI
- Weedmaps Menu API
- BioTrack/Metrc licensee APIs

BioTrack/Metrc interfaces are intended for licensed-business inventory/seed-to-sale integrations and are not treated as public consumer feeds.

## SEO

Included:

- canonical URLs
- robots.txt
- expanded sitemap.xml
- WebSite / Organization / WebPage structured data
- individual strain pages
- terpene pages
- guide pages
- forum landing page
- news landing page
- internal links from the strain catalog

## Local API

```bash
cd server
npm install
DATABASE_URL="postgresql://..." ALLOWED_ORIGIN="http://localhost:8080" NODE_ENV=development npm start
```

Then point `config.js` at the local API.

## Validation

GitHub Actions checks JavaScript syntax on every push and pull request with Node 22.

## Important

Do not store database credentials in the frontend or GitHub. The production deployment does not require any third-party API secrets.

Cannabis strain descriptions, terpene information, and community reports should be presented as educational/community information rather than medical diagnosis or guaranteed effects.


## Green Empire

The game is served at `/game/` and is a standalone, mobile-responsive 21+ fictional strategy game. It includes dynamic in-game market prices, six city hubs, business properties, staff, upgrades, daily missions, achievements, a 52-card fictional collectible vault, autosave, JSON save export/import, and a device-local Hall of Fame. Save data and Hall of Fame records stay in the visitor's browser; they are not synced across devices or players. The game is entertainment only and does not enable real-world transactions.

## Autonomous updates and monitoring

The production update schedule is split by data ownership so a failed source cannot replace unrelated data:

- **Strain catalog:** Render cron job runs daily at 05:00 UTC and syncs the public catalog into PostgreSQL. The permanent backup snapshot is preserved.
- **Guide catalog:** GitHub Actions runs the public-source discovery job daily at 05:15 UTC. It publishes qualifying new source links to `guides/catalog.json`; low-discovery days leave the existing catalog untouched. A successful commit triggers the frontend's normal Render auto-deploy.
- **News and NY OCM license data:** fetched from their public sources on demand by the API, cached for 10 minutes, and refreshed by the site's live-page refresh cycle. The automated monitor requests both feeds every six hours.
- **Forum and reviews:** read directly from PostgreSQL on page load; new user submissions are available immediately.
- **Calculators, games, Dr. Terpenstein, and the curated resources directory:** these are application/content features rather than independently refreshed public datasets. They update through reviewed code/content deployments. No generated strain chemistry, medical claims, game balances, or resource listings are invented by the scheduler.
- **Availability monitoring:** every six hours, GitHub Actions checks the homepage and major section routes, API/database health, news, OCM records, strain catalog, forum, and reviews. Failed checks produce a failed workflow run and GitHub notification; they do not overwrite good data.

Run the workflow manually from **Actions → Preroll.org automatic updates and live-data checks → Run workflow**. The workflow uses the repository's built-in GitHub token and requires no third-party API keys.
