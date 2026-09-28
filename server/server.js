const express=require('express');
const cors=require('cors');
const bcrypt=require('bcryptjs');
const crypto=require('crypto');
const {Pool}=require('pg');
const cookieParser=require('cookie-parser');

// Lightweight in-memory rate limiting for auth endpoints. For a single Render instance this
// provides a useful abuse floor without adding another dependency; use an external limiter
// when horizontally scaling the API.
const authHits=new Map();
function rateLimitAuth(req,res,next){
 const key=(req.ip||'unknown')+'|'+req.path, now=Date.now(), windowMs=15*60*1000, max=25;
 const item=authHits.get(key);
 if(!item||now-item.start>windowMs){authHits.set(key,{start:now,count:1});return next()}
 item.count++;
 if(item.count>max)return res.status(429).json({error:'Too many attempts. Please try again later.'});
 next();
}
function rateLimitWrites(req,res,next){
 const key=(req.ip||'unknown')+'|write',now=Date.now(),windowMs=60*1000,max=60,item=authHits.get(key);
 if(!item||now-item.start>windowMs){authHits.set(key,{start:now,count:1});return next()}
 item.count++;if(item.count>max)return res.status(429).json({error:'Too many requests. Please slow down.'});next();
}
setInterval(()=>{const cutoff=Date.now()-30*60*1000;for(const [k,v] of authHits)if(v.start<cutoff)authHits.delete(k)},10*60*1000).unref();

const app=express();
app.set('trust proxy',1);
const PORT=process.env.PORT||3000;
const ORIGIN=process.env.ALLOWED_ORIGIN||'https://preroll.org';
const DATABASE_URL=process.env.DATABASE_URL;

if(!DATABASE_URL) throw new Error('DATABASE_URL is required in production');

const pool=new Pool({connectionString:DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});

app.use(cors({origin:ORIGIN,credentials:true,methods:['GET','POST'],allowedHeaders:['Content-Type']}));
app.use(express.json({limit:'50kb'}));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(),microphone=(),geolocation=()');next()});
app.use(cookieParser());
app.use((req,res,next)=>{if(['POST','PUT','PATCH','DELETE'].includes(req.method)){if(!req.headers.origin||req.headers.origin!==ORIGIN)return res.status(403).json({error:'Origin not allowed'});}next();});

const cookie={httpOnly:true,secure:true,sameSite:'none',path:'/',maxAge:7*24*60*60*1000};
const publicUser=u=>({id:u.id,username:u.username,email:u.email});

const STRAIN_SOURCES=[
 {source:'leafly',pages:517,url:p=>`https://www.leafly.com/strains?page=${p}`},
 {source:'weedmaps',pages:657,url:p=>`https://weedmaps.com/strains?page=${p}`}
];
function stripHtml(v=''){return v.replace(/<script[\\s\\S]*?<\\/script>/gi,'').replace(/<style[\\s\\S]*?<\\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&nbsp;/gi,' ').replace(/\\s+/g,' ').trim()}
function extractStrains(html,source,page){
 const out=new Map(),re=/<a[^>]+href=["'](?:https?:\\/\\/[^"']+)?\\/strains\\/([^"'?#/]+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi;let m;
 while((m=re.exec(html))){
  const slug=m[1],text=stripHtml(m[2]).replace(/\\s+/g,' ').trim();
  if(!text||text.length>160||/^(strains|learn more|indica|sativa|hybrid)$/i.test(text))continue;
  const before=stripHtml(html.slice(Math.max(0,m.index-700),m.index)).toLowerCase(),tm=before.match(/\\b(indica|sativa|hybrid)\\b/);
  const type=tm?tm[1][0].toUpperCase()+tm[1].slice(1):'Unknown';
  const name=text.replace(/^(indica|sativa|hybrid)\\s+/i,'').replace(/\\s+aka.*$/i,'').trim();
  if(name.length<2)continue;out.set(slug,{slug,name,type,source,page});
 }
 return [...out.values()];
}


const cache=new Map();
function cached(key,ttl,value){
 const hit=cache.get(key);
 if(hit&&hit.expires>Date.now())return hit.value;
 const pending=Promise.resolve().then(value);
 cache.set(key,{expires:Date.now()+ttl,value:pending});
 pending.catch(()=>cache.delete(key));
 return pending;
}
async function fetchText(url){
 const r=await fetch(url,{headers:{'User-Agent':'Preroll.org/1.0','Accept':'text/html,application/xhtml+xml'}});
 if(!r.ok)throw new Error('Upstream returned '+r.status);
 return r.text();
}
async function fetchJson(url,options={}){
 const r=await fetch(url,{...options,headers:{Accept:'application/json',...(options.headers||{})}});
 if(!r.ok)throw new Error('Upstream returned '+r.status);
 return r.json();
}
function xmlText(v=''){return v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'\"').replace(/&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim()}
async function parseRssFeed(url,source){
 const xml=await fetchText(url),items=[],blocks=xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi)||[];
 for(const block of blocks.slice(0,20)){
  const title=xmlText((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
  const description=xmlText((block.match(/<(description|summary|content:encoded)[^>]*>([\s\S]*?)<\/\1>/i)||[])[2]||'').slice(0,500);
  const linkMatch=block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)||block.match(/<link[^>]+href=["']([^"']+)["']/i);
  const urlValue=(linkMatch?.[1]||'').trim();
  const date=((block.match(/<(pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/\1>/i)||[])[2]||'').trim();
  const publishedAt=date?new Date(date).toISOString():null;
  if(title&&urlValue)items.push({source,title,description,url:urlValue,publishedAt,image:''});
 }
 return items;
}
async function getCannabisNews(){
 const feeds=[['https://www.marijuanamoment.net/feed/','Marijuana Moment'],['https://cannabiswire.com/feed/','Cannabis Wire'],['https://cannabisindustryjournal.com/feed/','Cannabis Industry Journal'],['https://mjbizdaily.com/feed/','MJBizDaily']];
 const results=await Promise.allSettled(feeds.map(([url,source])=>parseRssFeed(url,source)));
 const articles=results.flatMap(r=>r.status==='fulfilled'?r.value:[]),seen=new Set();
 const unique=articles.filter(a=>{const key=a.url||a.title;if(seen.has(key))return false;seen.add(key);return true}).sort((a,b)=>(Date.parse(b.publishedAt||'')||0)-(Date.parse(a.publishedAt||'')||0)).slice(0,18);
 if(!unique.length)throw new Error('No upstream cannabis news feeds available');
 return {provider:'Public cannabis RSS feeds',configured:true,requiresSignup:false,updatedAt:new Date().toISOString(),articles:unique};
}
async function getNyLicenses(){
 const url='https://data.ny.gov/resource/jskf-tt3q.json?$limit=50000';
 const rows=await fetchJson(url);
 const pick=(row,names)=>names.map(k=>row[k]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')||'';
 const statusKey=row=>String(pick(row,['license_status','status','current_status'])).toLowerCase();
 const typeKey=row=>String(pick(row,['license_type','license_category','type'])).toLowerCase();
 const active=rows.filter(row=>/active|operational|issued/.test(statusKey(row)));
 const adultUseRetail=rows.filter(row=>/adult.?use retail|retail dispensary|au retail/.test(typeKey(row)));
 return {provider:'New York State Open Data / OCM',source:'https://data.ny.gov/Economic-Development/Current-OCM-Licenses/jskf-tt3q/about_data',fetchedAt:new Date().toISOString(),count:rows.length,activeCount:active.length,adultUseRetailCount:adultUseRetail.length,licenses:rows};
}

async function init(){
 await pool.query(`CREATE TABLE IF NOT EXISTS users(
  id UUID PRIMARY KEY, username VARCHAR(24) UNIQUE NOT NULL, email VARCHAR(254) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS sessions(
  id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL, expires_at TIMESTAMPTZ NOT NULL
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS posts(
  id BIGSERIAL PRIMARY KEY, title VARCHAR(90) NOT NULL, category VARCHAR(40) NOT NULL,
  body VARCHAR(1000) NOT NULL, author VARCHAR(24) NOT NULL, likes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS strains(\n  id BIGSERIAL PRIMARY KEY, slug VARCHAR(180) NOT NULL, name VARCHAR(180) NOT NULL,\n  type VARCHAR(20) NOT NULL DEFAULT 'Unknown', source VARCHAR(20) NOT NULL, source_page INTEGER,\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(slug,source)\n )`);\n await pool.query(`CREATE TABLE IF NOT EXISTS strains( id BIGSERIAL PRIMARY KEY, slug VARCHAR(180) NOT NULL, name VARCHAR(180) NOT NULL, type VARCHAR(20) NOT NULL DEFAULT 'Unknown', source VARCHAR(20) NOT NULL, source_page INTEGER, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(slug,source) )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS reviews(
  id BIGSERIAL PRIMARY KEY, strain VARCHAR(80) NOT NULL, author VARCHAR(24) NOT NULL,
  text VARCHAR(600) NOT NULL, overall SMALLINT NOT NULL, burn SMALLINT NOT NULL,
  flavor SMALLINT NOT NULL, value SMALLINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`);
}

function hashToken(t){return crypto.createHash('sha256').update(t).digest('hex')}
function newToken(){return crypto.randomBytes(32).toString('base64url')}
async function createSession(userId,res){
 const raw=newToken(), expires=new Date(Date.now()+7*86400000);
 await pool.query('DELETE FROM sessions WHERE user_id=$1 OR expires_at<now()',[userId]);
 await pool.query('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',[crypto.randomUUID(),userId,hashToken(raw),expires]);
 res.cookie('pr_session',raw,cookie);
}
async function auth(req,res,next){
 try{
  const raw=req.cookies?.pr_session;
  if(!raw)return res.status(401).json({error:'Login required'});
  const q=await pool.query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[hashToken(raw)]);
  if(!q.rowCount)return res.status(401).json({error:'Login required'});
  req.user=q.rows[0];next();
 }catch(e){next(e)}
}

app.get('/api/strains',async(req,res,next)=>{
 try{
  const q=String(req.query.q||'').trim().toLowerCase(),type=String(req.query.type||'').trim();
  const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(20000,Math.max(1,Number(req.query.limit)||100)),offset=(page-1)*limit;
  const params=[],where=[];
  if(q){params.push('%'+q+'%');where.push('(LOWER(name) LIKE $1 OR LOWER(slug) LIKE $1)')}
  if(type&&type!=='all'){params.push(type);where.push(`LOWER(type)=LOWER(${params.length})`)}
  const clause=where.length?'WHERE '+where.join(' AND '):'';
  const total=(await pool.query(`SELECT COUNT(*)::int AS count FROM strains ${clause}`,params)).rows[0].count;
  params.push(limit,offset);
  const rows=(await pool.query(`SELECT slug AS id,name,type,source FROM strains ${clause} ORDER BY LOWER(name),source LIMIT ${params.length-1} OFFSET ${params.length}`,params)).rows;
  res.json({strains:rows,total,page,limit,sources:['leafly','weedmaps']});
 }catch(e){next(e)}
});

app.get('/api/strains',async(req,res,next)=>{try{const q=String(req.query.q||'').trim().toLowerCase(),type=String(req.query.type||'').trim(),limit=Math.min(20000,Math.max(1,Number(req.query.limit)||100));const p=[],w=[];if(q){p.push('%'+q+'%');w.push('(LOWER(name) LIKE $1 OR LOWER(slug) LIKE $1)')}if(type&&type!=='all'){p.push(type);w.push('LOWER(type)=LOWER(async(req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(await cached('news',10*60*1000,getCannabisNews))}catch(e){res.status(502).json({error:'Public cannabis news feeds unavailable'})}});

app.get('/api/ny/licenses',async(req,res,next)=>{try{res.setHeader('Cache-Control','no-store');const data=await cached('nylicenses',10*60*1000,getNyLicenses);res.json(data)}catch(e){res.status(502).json({error:'New York license data unavailable'})}});

app.get('/api/health',async(req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true})}catch{res.status(503).json({ok:false})}});
app.post('/api/signup',rateLimitAuth,async(req,res,next)=>{
 try{
  const username=String(req.body?.username||'').trim(),email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
  if(!/^[A-Za-z0-9_]{3,24}$/.test(username)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12)return res.status(400).json({error:'Enter a valid username, email, and password of at least 12 characters.'});
  const exists=await pool.query('SELECT 1 FROM users WHERE email=$1 OR username=$2 LIMIT 1',[email,username]);
  if(exists.rowCount)return res.status(409).json({error:'That username or email is already registered.'});
  const user={id:crypto.randomUUID(),username,email,password_hash:await bcrypt.hash(password,12)};
  await pool.query('INSERT INTO users(id,username,email,password_hash) VALUES($1,$2,$3,$4)',[user.id,user.username,user.email,user.password_hash]);
  await createSession(user.id,res);res.status(201).json({user:publicUser(user)});
 }catch(e){next(e)}
});
app.post('/api/login',rateLimitAuth,async(req,res,next)=>{
 try{
  const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
  const q=await pool.query('SELECT * FROM users WHERE email=$1',[email]),user=q.rows[0];
  if(!user||!(await bcrypt.compare(password,user.password_hash)))return res.status(401).json({error:'Invalid email or password'});
  await createSession(user.id,res);res.json({user:publicUser(user)});
 }catch(e){next(e)}
});
app.get('/api/me',auth,(req,res)=>res.json({user:publicUser(req.user)}));
app.post('/api/logout',rateLimitAuth,async(req,res,next)=>{try{const raw=req.cookies?.pr_session;if(raw)await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hashToken(raw)]);res.clearCookie('pr_session',{httpOnly:true,secure:true,sameSite:'none',path:'/'});res.json({ok:true})}catch(e){next(e)}});

app.get('/api/posts',async(req,res,next)=>{try{const q=await pool.query('SELECT id,title,category,body,author,likes,EXTRACT(EPOCH FROM created_at)*1000 AS created FROM posts ORDER BY created_at DESC');res.json(q.rows)}catch(e){next(e)}});
app.post('/api/posts',rateLimitWrites,auth,async(req,res,next)=>{try{const title=String(req.body?.title||'').trim().slice(0,90),category=String(req.body?.category||'General').slice(0,40),body=String(req.body?.body||'').trim().slice(0,1000);if(!title||!body)return res.status(400).json({error:'Title and body required'});const q=await pool.query('INSERT INTO posts(title,category,body,author) VALUES($1,$2,$3,$4) RETURNING id,title,category,body,author,likes,EXTRACT(EPOCH FROM created_at)*1000 AS created',[title,category,body,req.user.username]);res.status(201).json(q.rows[0])}catch(e){next(e)}});
app.post('/api/posts/:id/like',rateLimitWrites,async(req,res,next)=>{try{const q=await pool.query('UPDATE posts SET likes=likes+1 WHERE id=$1 RETURNING id,title,category,body,author,likes,EXTRACT(EPOCH FROM created_at)*1000 AS created',[req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Not found'});res.json(q.rows[0])}catch(e){next(e)}});

app.get('/api/reviews',async(req,res,next)=>{try{const q=await pool.query('SELECT id,strain,author,text,overall,burn,flavor,value,EXTRACT(EPOCH FROM created_at)*1000 AS created FROM reviews ORDER BY created_at DESC');res.json(q.rows)}catch(e){next(e)}});
app.post('/api/reviews',rateLimitWrites,auth,async(req,res,next)=>{try{const vals=['overall','burn','flavor','value'].map(k=>Number(req.body?.[k]));if(vals.some(v=>!Number.isInteger(v)||v<1||v>5))return res.status(400).json({error:'Scores must be 1 through 5.'});const strain=String(req.body?.strain||'').slice(0,80),text=String(req.body?.text||'').trim().slice(0,600);if(!strain||!text)return res.status(400).json({error:'Strain and review text required'});const q=await pool.query('INSERT INTO reviews(strain,author,text,overall,burn,flavor,value) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,strain,author,text,overall,burn,flavor,value,EXTRACT(EPOCH FROM created_at)*1000 AS created',[strain,req.user.username,text,...vals]);res.status(201).json(q.rows[0])}catch(e){next(e)}});

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Server error'})});
init().then(()=>app.listen(PORT,()=>console.log('Preroll.org API listening on '+PORT))).catch(err=>{console.error(err);process.exit(1)});
+p.length+')')}const clause=w.length?'WHERE '+w.join(' AND '):'';const total=(await pool.query('SELECT COUNT(*)::int AS count FROM strains '+clause,p)).rows[0].count;const rows=(await pool.query('SELECT slug AS id,name,type,source FROM strains '+clause+' ORDER BY LOWER(name),source LIMIT async(req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(await cached('news',10*60*1000,getCannabisNews))}catch(e){res.status(502).json({error:'Public cannabis news feeds unavailable'})}});

app.get('/api/ny/licenses',async(req,res,next)=>{try{res.setHeader('Cache-Control','no-store');const data=await cached('nylicenses',10*60*1000,getNyLicenses);res.json(data)}catch(e){res.status(502).json({error:'New York license data unavailable'})}});

app.get('/api/health',async(req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true})}catch{res.status(503).json({ok:false})}});
app.post('/api/signup',rateLimitAuth,async(req,res,next)=>{
 try{
  const username=String(req.body?.username||'').trim(),email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
  if(!/^[A-Za-z0-9_]{3,24}$/.test(username)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12)return res.status(400).json({error:'Enter a valid username, email, and password of at least 12 characters.'});
  const exists=await pool.query('SELECT 1 FROM users WHERE email=$1 OR username=$2 LIMIT 1',[email,username]);
  if(exists.rowCount)return res.status(409).json({error:'That username or email is already registered.'});
  const user={id:crypto.randomUUID(),username,email,password_hash:await bcrypt.hash(password,12)};
  await pool.query('INSERT INTO users(id,username,email,password_hash) VALUES($1,$2,$3,$4)',[user.id,user.username,user.email,user.password_hash]);
  await createSession(user.id,res);res.status(201).json({user:publicUser(user)});
 }catch(e){next(e)}
});
app.post('/api/login',rateLimitAuth,async(req,res,next)=>{
 try{
  const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
  const q=await pool.query('SELECT * FROM users WHERE email=$1',[email]),user=q.rows[0];
  if(!user||!(await bcrypt.compare(password,user.password_hash)))return res.status(401).json({error:'Invalid email or password'});
  await createSession(user.id,res);res.json({user:publicUser(user)});
 }catch(e){next(e)}
});
app.get('/api/me',auth,(req,res)=>res.json({user:publicUser(req.user)}));
app.post('/api/logout',rateLimitAuth,async(req,res,next)=>{try{const raw=req.cookies?.pr_session;if(raw)await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hashToken(raw)]);res.clearCookie('pr_session',{httpOnly:true,secure:true,sameSite:'none',path:'/'});res.json({ok:true})}catch(e){next(e)}});

app.get('/api/posts',async(req,res,next)=>{try{const q=await pool.query('SELECT id,title,category,body,author,likes,EXTRACT(EPOCH FROM created_at)*1000 AS created FROM posts ORDER BY created_at DESC');res.json(q.rows)}catch(e){next(e)}});
app.post('/api/posts',rateLimitWrites,auth,async(req,res,next)=>{try{const title=String(req.body?.title||'').trim().slice(0,90),category=String(req.body?.category||'General').slice(0,40),body=String(req.body?.body||'').trim().slice(0,1000);if(!title||!body)return res.status(400).json({error:'Title and body required'});const q=await pool.query('INSERT INTO posts(title,category,body,author) VALUES($1,$2,$3,$4) RETURNING id,title,category,body,author,likes,EXTRACT(EPOCH FROM created_at)*1000 AS created',[title,category,body,req.user.username]);res.status(201).json(q.rows[0])}catch(e){next(e)}});
app.post('/api/posts/:id/like',rateLimitWrites,async(req,res,next)=>{try{const q=await pool.query('UPDATE posts SET likes=likes+1 WHERE id=$1 RETURNING id,title,category,body,author,likes,EXTRACT(EPOCH FROM created_at)*1000 AS created',[req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Not found'});res.json(q.rows[0])}catch(e){next(e)}});

app.get('/api/reviews',async(req,res,next)=>{try{const q=await pool.query('SELECT id,strain,author,text,overall,burn,flavor,value,EXTRACT(EPOCH FROM created_at)*1000 AS created FROM reviews ORDER BY created_at DESC');res.json(q.rows)}catch(e){next(e)}});
app.post('/api/reviews',rateLimitWrites,auth,async(req,res,next)=>{try{const vals=['overall','burn','flavor','value'].map(k=>Number(req.body?.[k]));if(vals.some(v=>!Number.isInteger(v)||v<1||v>5))return res.status(400).json({error:'Scores must be 1 through 5.'});const strain=String(req.body?.strain||'').slice(0,80),text=String(req.body?.text||'').trim().slice(0,600);if(!strain||!text)return res.status(400).json({error:'Strain and review text required'});const q=await pool.query('INSERT INTO reviews(strain,author,text,overall,burn,flavor,value) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,strain,author,text,overall,burn,flavor,value,EXTRACT(EPOCH FROM created_at)*1000 AS created',[strain,req.user.username,text,...vals]);res.status(201).json(q.rows[0])}catch(e){next(e)}});

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Server error'})});
init().then(()=>app.listen(PORT,()=>console.log('Preroll.org API listening on '+PORT))).catch(err=>{console.error(err);process.exit(1)});
+(p.length+1),[...p,limit])).rows;res.json({strains:rows,total,sources:['leafly','weedmaps']})}catch(e){next(e)}});

app.get('/api/news',async(req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(await cached('news',10*60*1000,getCannabisNews))}catch(e){res.status(502).json({error:'Public cannabis news feeds unavailable'})}});

app.get('/api/ny/licenses',async(req,res,next)=>{try{res.setHeader('Cache-Control','no-store');const data=await cached('nylicenses',10*60*1000,getNyLicenses);res.json(data)}catch(e){res.status(502).json({error:'New York license data unavailable'})}});

app.get('/api/health',async(req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true})}catch{res.status(503).json({ok:false})}});
app.post('/api/signup',rateLimitAuth,async(req,res,next)=>{
 try{
  const username=String(req.body?.username||'').trim(),email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
  if(!/^[A-Za-z0-9_]{3,24}$/.test(username)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12)return res.status(400).json({error:'Enter a valid username, email, and password of at least 12 characters.'});
  const exists=await pool.query('SELECT 1 FROM users WHERE email=$1 OR username=$2 LIMIT 1',[email,username]);
  if(exists.rowCount)return res.status(409).json({error:'That username or email is already registered.'});
  const user={id:crypto.randomUUID(),username,email,password_hash:await bcrypt.hash(password,12)};
  await pool.query('INSERT INTO users(id,username,email,password_hash) VALUES($1,$2,$3,$4)',[user.id,user.username,user.email,user.password_hash]);
  await createSession(user.id,res);res.status(201).json({user:publicUser(user)});
 }catch(e){next(e)}
});
app.post('/api/login',rateLimitAuth,async(req,res,next)=>{
 try{
  const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
  const q=await pool.query('SELECT * FROM users WHERE email=$1',[email]),user=q.rows[0];
  if(!user||!(await bcrypt.compare(password,user.password_hash)))return res.status(401).json({error:'Invalid email or password'});
  await createSession(user.id,res);res.json({user:publicUser(user)});
 }catch(e){next(e)}
});
app.get('/api/me',auth,(req,res)=>res.json({user:publicUser(req.user)}));
app.post('/api/logout',rateLimitAuth,async(req,res,next)=>{try{const raw=req.cookies?.pr_session;if(raw)await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hashToken(raw)]);res.clearCookie('pr_session',{httpOnly:true,secure:true,sameSite:'none',path:'/'});res.json({ok:true})}catch(e){next(e)}});

app.get('/api/posts',async(req,res,next)=>{try{const q=await pool.query('SELECT id,title,category,body,author,likes,EXTRACT(EPOCH FROM created_at)*1000 AS created FROM posts ORDER BY created_at DESC');res.json(q.rows)}catch(e){next(e)}});
app.post('/api/posts',rateLimitWrites,auth,async(req,res,next)=>{try{const title=String(req.body?.title||'').trim().slice(0,90),category=String(req.body?.category||'General').slice(0,40),body=String(req.body?.body||'').trim().slice(0,1000);if(!title||!body)return res.status(400).json({error:'Title and body required'});const q=await pool.query('INSERT INTO posts(title,category,body,author) VALUES($1,$2,$3,$4) RETURNING id,title,category,body,author,likes,EXTRACT(EPOCH FROM created_at)*1000 AS created',[title,category,body,req.user.username]);res.status(201).json(q.rows[0])}catch(e){next(e)}});
app.post('/api/posts/:id/like',rateLimitWrites,async(req,res,next)=>{try{const q=await pool.query('UPDATE posts SET likes=likes+1 WHERE id=$1 RETURNING id,title,category,body,author,likes,EXTRACT(EPOCH FROM created_at)*1000 AS created',[req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Not found'});res.json(q.rows[0])}catch(e){next(e)}});

app.get('/api/reviews',async(req,res,next)=>{try{const q=await pool.query('SELECT id,strain,author,text,overall,burn,flavor,value,EXTRACT(EPOCH FROM created_at)*1000 AS created FROM reviews ORDER BY created_at DESC');res.json(q.rows)}catch(e){next(e)}});
app.post('/api/reviews',rateLimitWrites,auth,async(req,res,next)=>{try{const vals=['overall','burn','flavor','value'].map(k=>Number(req.body?.[k]));if(vals.some(v=>!Number.isInteger(v)||v<1||v>5))return res.status(400).json({error:'Scores must be 1 through 5.'});const strain=String(req.body?.strain||'').slice(0,80),text=String(req.body?.text||'').trim().slice(0,600);if(!strain||!text)return res.status(400).json({error:'Strain and review text required'});const q=await pool.query('INSERT INTO reviews(strain,author,text,overall,burn,flavor,value) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,strain,author,text,overall,burn,flavor,value,EXTRACT(EPOCH FROM created_at)*1000 AS created',[strain,req.user.username,text,...vals]);res.status(201).json(q.rows[0])}catch(e){next(e)}});

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Server error'})});
init().then(()=>app.listen(PORT,()=>console.log('Preroll.org API listening on '+PORT))).catch(err=>{console.error(err);process.exit(1)});
