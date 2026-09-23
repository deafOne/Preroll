# Preroll.org — easiest possible setup guide

This folder contains a complete responsive Preroll.org front end and an optional Node.js API.

## The super-simple version (put the page online first)

Think of the website like a picture you made with blocks. We only need to put the blocks where the internet can see them.

### Option A — use Webstudio as the visual home

1. Go to **webstudio.is** and sign in.
2. Make a new project.
3. Open the page you want to use as the home page.
4. Add an **HTML Embed** component.
5. Open `index.html` from this ZIP with a normal text editor.
6. Copy the markup you need into Webstudio's HTML Embed. For a whole custom app, it is usually easier to host these static files directly and use Webstudio to build/maintain other pages around it.
7. Webstudio supports custom JavaScript in an HTML Embed. If you split the page into Webstudio-native sections, paste the CSS into the appropriate custom/style area and put the JavaScript in an HTML Embed or custom code area.
8. Use Webstudio's staging domain first. Click Publish and test it before connecting `preroll.org`.
9. In Webstudio project/domain settings, add the custom domain and follow the DNS records Webstudio shows you. Your DNS provider may be Cloudflare, GoDaddy, Namecheap, etc. Copy the values exactly from Webstudio.
10. When the staging page works, publish the custom domain.

### Option B — easiest for this exact ZIP

Because this project is already hand-written HTML/CSS/JavaScript, the cleanest route is to upload the folder to a static host such as Cloudflare Pages, Netlify, Vercel static hosting, GitHub Pages, or any normal web server. Webstudio itself is especially good when the project was built inside Webstudio and then exported.

The site works immediately in **demo mode** with no backend. Accounts, forum posts, saves and reviews are stored only in that visitor's browser.

## Test it on your computer

1. Unzip the folder.
2. Double-click `index.html`.
3. If your browser blocks anything because the file is local, open a terminal in the folder and run:

```bash
python3 -m http.server 8080
```

4. Open `http://localhost:8080` in your browser.

## Make accounts/posts shared between all visitors

The files in `/server` are the optional real API. The API provides hashed-password signup/login, JWT sessions, forum posts and reviews.

### Beginner backend steps

1. Put the `/server` folder on a Node.js host (for example Render, Railway, Fly.io, a VPS, or another Node-compatible service).
2. Set the service start command to:

```bash
npm install && npm start
```

3. Add environment variables:

```text
JWT_SECRET=make-this-a-long-random-secret
ALLOWED_ORIGIN=https://preroll.org
```

4. Your host gives you an address similar to `https://something.example.com`.
5. Open `config.js` in the website folder.
6. Change:

```js
window.PREROLL_CONFIG = { API_URL: "" };
```

to:

```js
window.PREROLL_CONFIG = { API_URL: "https://YOUR-BACKEND-ADDRESS" };
```

7. Upload/publish the front end again.

### Important production note

The included backend uses a JSON file so it is easy to understand. For a busy public community, replace that JSON file with PostgreSQL/Supabase/Neon or another real database. Some cloud hosts erase local files when a service redeploys unless you add persistent storage.

## What works now

- Mobile/desktop responsive design
- Original Preroll.org SVG logo
- 21+ age gate
- Search and filters
- Strain detail views
- Saved/favorite strains
- Account signup and login (browser-demo mode, optional server auth)
- Forum posting and likes
- User profile view
- Community reviews with burn/flavor/value scores
- MyStrain educational assistant using the local catalog
- Pre-roll cost calculator
- Edible label math calculator
- News/education cards
- SEO title and description
- No external JavaScript or CSS libraries required

## What is intentionally not fake

The included news cards are explicitly labeled curated/demo content. They are not pretending to be a live news feed. The AI assistant is an offline rule/catalog assistant; it does not secretly call a paid AI service. To use a real AI model, call it from the backend so an API key is never exposed in `app.js`.

## Files

- `index.html` — page structure
- `styles.css` — design and responsive layout
- `app.js` — interactions
- `config.js` — optional backend URL
- `assets/logo.svg` — original site logo
- `server/` — optional shared-user backend

## Safety / legal

Keep the 21+ gate and educational language. Laws differ by jurisdiction. Do not represent community strain tags as medical advice or guaranteed effects.
