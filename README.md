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
5. Confirm these environment variables:
   - `DATABASE_URL` — supplied by Render
   - `ALLOWED_ORIGIN=https://preroll.org`
   - `NODE_ENV=production`
6. Check the API at `/api/health`.
7. If Render assigns a hostname different from the value in `config.js`, update `API_URL` to the real API hostname and push the change.

## Authentication

- PostgreSQL-backed users and sessions
- bcrypt password hashing
- minimum 12-character passwords
- random database-backed session tokens
- HttpOnly + Secure cookies
- `SameSite=None` for the current cross-site frontend/API arrangement
- no auth token in localStorage
- login/signup rate limiting
- strict Origin checking on state-changing requests
- generic server error responses
- authenticated forum posting and reviews

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

## Important

Do not store database credentials or AI/API secrets in the frontend or GitHub. Put secrets in Render environment variables.

The site’s demo content is clearly presented as demo/educational content. Live news and laboratory values should be populated from real, cited sources before being presented as current facts.
