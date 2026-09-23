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
