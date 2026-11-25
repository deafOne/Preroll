const express=require('express');
const cors=require('cors');
const bcrypt=require('bcryptjs');
const crypto=require('crypto');
const {Pool}=require('pg');
const cookieParser=require('cookie-parser');
const {spawn}=require('child_process');

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

if(!DATABASE_URL) console.warn('DATABASE_URL is not configured; strain catalog will use its live-source fallback.');

let pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false}):null;

app.use(cors({origin:ORIGIN,credentials:true,methods:['GET','POST'],allowedHeaders:['Content-Type']}));
app.use(express.json({limit:'50kb'}));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(),microphone=(),geolocation=()');next()});
app.use(cookieParser());
app.use((req,res,next)=>{if(['POST','PUT','PATCH','DELETE'].includes(req.method)){if(!req.headers.origin||req.headers.origin!==ORIGIN)return res.status(403).json({error:'Origin not allowed'});}next();});

const cookie={httpOnly:true,secure:true,sameSite:'none',path:'/',maxAge:7*24*60*60*1000};
const publicUser=u=>({id:u.id,username:u.username,email:u.email});


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
 const r=await fetch(url,{headers:{'User-Agent':'Preroll.org/1.0 (+https://preroll.org)','Accept':'application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5'},signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw new Error('Upstream returned '+r.status);
 return r.text();
}
async function fetchJson(url,options={}){
 const r=await fetch(url,{...options,headers:{Accept:'application/json',...(options.headers||{})}});
 if(!r.ok)throw new Error('Upstream returned '+r.status);
 return r.json();
}
function xmlText(v=''){return v.replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g,'$1').replace(/<[^>]+>/g,' ').replace(/&#(x[0-9a-f]+|\\d+);/gi,(_,n)=>{const code=n.toLowerCase().startsWith('x')?parseInt(n.slice(1),16):parseInt(n,10);return Number.isFinite(code)?String.fromCodePoint(code):''}).replace(/&(amp|quot|apos|lt|gt|nbsp);/gi,(_,n)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[n.toLowerCase()]||'')).replace(/[\\u0000-\\u001f\\u007f]/g,' ').replace(/\\s+/g,' ').trim()}
async function parseRssFeed(url,source){
 const xml=await fetchText(url),items=[],blocks=xml.match(/<(item|entry)\\b[\\s\\S]*?<\\/\\1>/gi)||[];
 for(const block of blocks.slice(0,30)){
  const title=xmlText((block.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i)||[])[1]||'');
  const description=xmlText((block.match(/<(description|summary|content:encoded)[^>]*>([\\s\\S]*?)<\\/\\1>/i)||[])[2]||'').slice(0,500);
  const linkTags=block.match(/<link\\b[^>]*>/gi)||[];
  let urlValue='';
  for(const tag of linkTags){
   const href=(tag.match(/\\bhref=["']([^"']+)["']/i)||[])[1];
   const rel=(tag.match(/\\brel=["']([^"']+)["']/i)||[])[1]||'alternate';
   const body=(tag.match(/^<link[^>]*>([\\s\\S]*?)<\\/link>/i)||[])[1];
   if(rel==='alternate'||!rel){urlValue=(href||body||'').trim();if(urlValue)break}
  }
  const date=((block.match(/<(pubDate|published|updated|dc:date|date)[^>]*>([\\s\\S]*?)<\\/\\1>/i)||[])[2]||'').trim();
  const parsedDate=date?new Date(date):null;
  const publishedAt=parsedDate&&!Number.isNaN(parsedDate.getTime())?parsedDate.toISOString():null;
  if(title&&urlValue&&publishedAt)items.push({source,title,description,url:urlValue,publishedAt,image:''});
 }
 return items;
}
let lastGoodNews=null;
async function getCannabisNews(){
 const feeds=[
  ['https://www.marijuanamoment.net/feed/','Marijuana Moment'],
  ['https://cannabiswire.com/feed/','Cannabis Wire'],
  ['https://cannabisindustryjournal.com/feed/','Cannabis Industry Journal'],
  ['https://mjbizdaily.com/feed/','MJBizDaily'],
  ['https://cannabis.ny.gov/news.xml','New York Office of Cannabis Management']
 ];
 const results=await Promise.allSettled(feeds.map(([url,source])=>parseRssFeed(url,source)));
 const now=Date.now(),maxAge=30*24*60*60*1000,seen=new Set();
 const articles=results.flatMap(r=>r.status==='fulfilled'?r.value:[]).filter(a=>{
  let parsed;try{parsed=new URL(a.url)}catch{return false}
  const feed=feeds.find(([,name])=>name===a.source);
  const host=new URL(feed[0]).hostname;
  const age=now-Date.parse(a.publishedAt);
  if(parsed.protocol!=='https:'||!(parsed.hostname===host||parsed.hostname.endsWith('.'+host)))return false;
  if(!Number.isFinite(age)||age < -24*60*60*1000||age>maxAge)return false;
  if(a.title.length<8||/^(read more|click here|latest news)$/i.test(a.title))return false;
  const key=a.url.replace(/\\/$/,'').toLowerCase();
  const titleKey=a.title.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  if(seen.has(key)||seen.has(titleKey))return false;
  seen.add(key);seen.add(titleKey);return true;
 }).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,18);
 if(articles.length){
  lastGoodNews={provider:'Verified publisher RSS feeds',configured:true,requiresSignup:false,updatedAt:new Date().toISOString(),stale:false,feedCount:results.filter(r=>r.status==='fulfilled').length,articles};
  return lastGoodNews;
 }
 if(lastGoodNews){
  const stillCurrent=lastGoodNews.articles.filter(a=>now-Date.parse(a.publishedAt)<=maxAge);
  if(stillCurrent.length)return {...lastGoodNews,articles:stillCurrent,stale:true,warning:'Live publishers could not be reached; showing the last verified feed snapshot.'};
 }
 throw new Error('No recent, dated articles were returned by the configured publishers');
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
 if(!pool)return;
 try{
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
 await pool.query(`CREATE TABLE IF NOT EXISTS strains( id BIGSERIAL PRIMARY KEY, slug VARCHAR(180) NOT NULL, name VARCHAR(180) NOT NULL, type VARCHAR(20) NOT NULL DEFAULT 'Unknown', source VARCHAR(20) NOT NULL, source_page INTEGER, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(slug,source) )`);
 await pool.query('CREATE INDEX IF NOT EXISTS idx_strains_name ON strains(name)');
 await pool.query('CREATE INDEX IF NOT EXISTS idx_strains_source ON strains(source)');
 await pool.query(`CREATE TABLE IF NOT EXISTS reviews(
  id BIGSERIAL PRIMARY KEY, strain VARCHAR(80) NOT NULL, author VARCHAR(24) NOT NULL,
  text VARCHAR(600) NOT NULL, overall SMALLINT NOT NULL, burn SMALLINT NOT NULL,
  flavor SMALLINT NOT NULL, value SMALLINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS strain_catalog_backup (
  backup_id BIGSERIAL PRIMARY KEY,
  original_id BIGINT,
  slug VARCHAR(180) NOT NULL,
  name VARCHAR(180) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'Unknown',
  source VARCHAR(20) NOT NULL,
  source_page INTEGER,
  original_updated_at TIMESTAMPTZ,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS media_network_inquiries(
  id BIGSERIAL PRIMARY KEY,
  business_name VARCHAR(120) NOT NULL,
  contact_name VARCHAR(90) NOT NULL,
  email VARCHAR(180) NOT NULL,
  website VARCHAR(240),
  business_type VARCHAR(100) NOT NULL,
  interest VARCHAR(100) NOT NULL,
  market VARCHAR(140),
  message VARCHAR(1200),
  status VARCHAR(24) NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`);
 await pool.query('CREATE INDEX IF NOT EXISTS idx_media_inquiries_created ON media_network_inquiries(created_at DESC)');
 await pool.query(`CREATE TABLE IF NOT EXISTS dispensary_claims(
  id BIGSERIAL PRIMARY KEY,
  license_number VARCHAR(100) NOT NULL,
  business_name VARCHAR(180) NOT NULL,
  contact_name VARCHAR(90) NOT NULL,
  email VARCHAR(180) NOT NULL,
  website VARCHAR(240),
  message VARCHAR(1200),
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(license_number,email)
 )`);
 await pool.query('CREATE INDEX IF NOT EXISTS idx_dispensary_claims_status ON dispensary_claims(status,created_at DESC)');
 const backupCount = (await pool.query('SELECT COUNT(*)::int AS count FROM strain_catalog_backup')).rows[0].count;
 if (backupCount === 0) {
  const backupResult = await pool.query(`
   INSERT INTO strain_catalog_backup
    (original_id,slug,name,type,source,source_page,original_updated_at)
   SELECT id,slug,name,type,source,source_page,updated_at FROM strains ORDER BY id
  `);
  console.log('Created permanent strain catalog backup:',backupResult.rowCount,'records');
 } else {
  console.log('Existing strain catalog backup preserved:',backupCount,'records');
 }

 }catch(err){
  console.error('Database initialization failed; continuing in degraded mode:',err.message);
  try{await pool.end()}catch{}
  pool=null;
 }
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
 if(!pool)return res.status(503).json({error:'Database is not connected yet. Please try again after the production database binding is applied.'});
 try{
  const raw=req.cookies?.pr_session;
  if(!raw)return res.status(401).json({error:'Login required'});
  const q=await pool.query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[hashToken(raw)]);
  if(!q.rowCount)return res.status(401).json({error:'Login required'});
  req.user=q.rows[0];next();
 }catch(e){next(e)}
}

function cleanStrainName(value,slug=''){
 let name=String(value||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]*>/g,' ')
  .replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
  .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);return Number.isFinite(code)&&code>0&&code<=0x10ffff?String.fromCodePoint(code):' '})
  .replace(/\{[^{}]*\}/g,' ').replace(/(?:^|\s)@font-face[\s\S]*$/i,' ')
  .replace(/\b(?:font-family|font-face|src|font-weight|font-style)\s*:[^;]+;?/gi,' ')
  .replace(/\s+/g,' ').trim().slice(0,180);
 const looksLikeCss=/@font-face|font-family\s*:|url\s*\(|\.woff2?\b|\{[^}]*\}|(?:^|\s)(?:body|html|\.\w+|#\w+)\s*\{/i.test(name);
 if(!name||looksLikeCss||name.length<2)return slugToStrainName(slug);
 return name;
}
function slugToStrainName(slug=''){
 const value=String(slug||'').replace(/\.(?:html?|json)$/i,'').trim();
 if(!value||/@|\{|\}|\.woff|font-family/i.test(value))return '';
 return value.split(/[-_]+/).filter(Boolean).map(part=>part.length<=3?part.toUpperCase():part[0].toUpperCase()+part.slice(1)).join(' ').slice(0,180);
}
function readStaticStrainCatalog(q,limit){
 const fs=require('fs'),path=require('path');
 try{
  const data=JSON.parse(fs.readFileSync(path.join(__dirname,'..','strains','catalog.json'),'utf8'));
  let rows=(Array.isArray(data.strains)?data.strains:[]).map(x=>({...x,name:cleanStrainName(x.name,x.id||x.slug)})).filter(x=>x.name);
  if(q)rows=rows.filter(x=>String(x.name||'').toLowerCase().includes(q)||String(x.id||'').toLowerCase().includes(q));
  return {strains:rows.slice(0,limit),total:rows.length,limit,sources:['leafly','weedmaps'],mode:'static-fallback'};
 }catch(err){
  console.error('Static strain catalog could not be read:',err.message);
  return {strains:[],total:0,limit,sources:['leafly','weedmaps'],mode:'static-fallback',error:'Strain catalog file unavailable'};
 }
}
async function readBackupStrainCatalog(q,limit){
 const pattern=q?('%'+q+'%'):null;
 const filter='($1::text IS NULL OR LOWER(name) LIKE $1 OR LOWER(slug) LIKE $1)';
 const total=(await pool.query('SELECT COUNT(*)::int AS count FROM strain_catalog_backup WHERE '+filter,[pattern])).rows[0].count;
 const rows=(await pool.query(
  'SELECT slug AS id,name,type,source FROM strain_catalog_backup WHERE '+filter+' ORDER BY LOWER(name),source LIMIT $2',
  [pattern,limit]
 )).rows.map(x=>({...x,name:cleanStrainName(x.name,x.id)})).filter(x=>x.name);
 return {strains:rows,total:rows.length,limit,sources:['leafly','weedmaps'],mode:'database-backup'};
}
app.get('/api/strains',async(req,res,next)=>{
 const q=String(req.query.q||'').trim().toLowerCase();
 const limit=Math.min(20000,Math.max(1,Number(req.query.limit)||100));
 if(!pool)return res.json(readStaticStrainCatalog(q,limit));
 try{
  const pattern=q?('%'+q+'%'):null;
  const filter='($1::text IS NULL OR LOWER(name) LIKE $1 OR LOWER(slug) LIKE $1)';
  const total=(await pool.query('SELECT COUNT(*)::int AS count FROM strains WHERE '+filter,[pattern])).rows[0].count;
  if(total>0){
   const rows=(await pool.query(
    'SELECT slug AS id,name,type,source FROM strains WHERE '+filter+' ORDER BY LOWER(name),source LIMIT $2',
    [pattern,limit]
   )).rows.map(x=>({...x,name:cleanStrainName(x.name,x.id)})).filter(x=>x.name);
   if(rows.length)return res.json({strains:rows,total:rows.length,limit,sources:['leafly','weedmaps'],mode:'database'});
  }
  console.warn('Active strain catalog is empty for requested filter; trying permanent backup snapshot.');
  const backup=await readBackupStrainCatalog(q,limit);
  if(backup.total>0)return res.json(backup);
  return res.json(readStaticStrainCatalog(q,limit));
 }catch(activeError){
  console.error('Active strain catalog query failed; attempting backup:',activeError.message);
  try{
   const backup=await readBackupStrainCatalog(q,limit);
   if(backup.total>0)return res.json(backup);
  }catch(backupError){
   console.error('Permanent strain backup query failed:',backupError.message);
  }
  return res.json(readStaticStrainCatalog(q,limit));
 }
});
// Verified strain profile enrichment. Resolve the provider's own slug by exact name,
// because the public catalog IDs belong to different source systems.
function plainText(v=''){
 let s=String(v).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ');
 s=s.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'");
 return s.replace(/\s+/g,' ').trim();
}
function safeHttpUrl(v){
 try{const u=new URL(String(v||''));return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}
}
function strainKey(v=''){return String(v).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim()}
function profileRows(payload){
 if(Array.isArray(payload))return payload;
 if(!payload||typeof payload!=='object')return [];
 for(const key of ['strains','results','data','items','records']){
  const value=payload[key];
  if(Array.isArray(value))return value;
  if(value&&typeof value==='object'){
   for(const nested of ['strains','results','items','records'])if(Array.isArray(value[nested]))return value[nested];
  }
 }
 if(payload.name||payload.display_title||payload.slug)return [payload];
 return [];
}
function firstValue(item,keys){
 for(const key of keys){const value=item?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}
 return null;
}
function mapStrainRecord(raw){
 const item=raw&&typeof raw==='object'?raw:{};
 const image=firstValue(item,['image','featured_image','featuredImage','photo']);
 const imageUrl=safeHttpUrl(typeof image==='string'?image:(image?.url||image?.src||image?.source_url||firstValue(item,['image_url','imageUrl','photo_url','photoUrl','thumbnail'])));
 const name=String(firstValue(item,['name','display_title','title'])||'').trim();
 const slug=String(firstValue(item,['slug','post_name','id'])||'').trim();
 const profile={
  name,description:plainText(firstValue(item,['description','excerpt','content','summary'])||'').slice(0,5000),
  imageUrl,imageAlt:plainText((image&&typeof image==='object'&&image.alt)||item.image_alt||name+' strain photo'),
  sourceUrl:safeHttpUrl(firstValue(item,['url','link','permalink']))||(slug?'https://www.strainapi.com/'+encodeURIComponent(slug)+'/':''),
  provider:'StrainAPI',providerSlug:slug,
  breeder:firstValue(item,['breeder','breeder_name','producer']),
  genetics:firstValue(item,['genetics','lineage','genetic_lineage','parentage']),
  type:firstValue(item,['type','strain_type','cultivar_type']),
  indicaPercent:firstValue(item,['indica_percent','indica_percentage','indica']),
  sativaPercent:firstValue(item,['sativa_percent','sativa_percentage','sativa']),
  seedType:firstValue(item,['seed_type','seedType']),
  thc:firstValue(item,['thc','thc_content','thc_range','total_thc']),
  cbd:firstValue(item,['cbd','cbd_content','cbd_range','total_cbd']),
  terpenes:firstValue(item,['terpenes','dominant_terpenes','primary_terpenes'])||[],
  effects:firstValue(item,['effects','reported_effects']),
  flavor:firstValue(item,['flavor','flavour','flavor_profile']),
  aroma:firstValue(item,['aroma','aroma_profile']),
  flowering:firstValue(item,['flowering','flowering_time','flowering_days']),
  outdoorHarvest:firstValue(item,['outdoor_harvest','outdoorHarvest','harvest_window']),
  plantStructure:firstValue(item,['plant_structure','plantStructure','structure']),
  yield:firstValue(item,['yield','yield_potential']),
  evidence:firstValue(item,['evidence','data_notes','sources']),
  aliases:firstValue(item,['aliases','also_known_as'])||[],
  publishedAt:firstValue(item,['published_at','publishedAt','date_published']),
  updatedAt:firstValue(item,['updated_at','modified','date_modified']),
  additionalFields:{}
 };
 const known=new Set(['id','name','display_title','title','slug','post_name','url','link','permalink','excerpt','image','featured_image','featuredImage','photo','image_url','imageUrl','photo_url','photoUrl','thumbnail','image_alt','description','content','summary','breeder','breeder_name','producer','genetics','lineage','genetic_lineage','parentage','type','strain_type','cultivar_type','indica_percent','indica_percentage','indica','sativa_percent','sativa_percentage','sativa','seed_type','seedType','thc','thc_content','thc_range','total_thc','cbd','cbd_content','cbd_range','total_cbd','terpenes','dominant_terpenes','primary_terpenes','effects','reported_effects','flavor','flavour','flavor_profile','aroma','aroma_profile','flowering','flowering_time','flowering_days','outdoor_harvest','outdoorHarvest','harvest_window','plant_structure','plantStructure','structure','yield','yield_potential','evidence','data_notes','sources','aliases','also_known_as','published_at','publishedAt','date_published','updated_at','modified','date_modified','content_html']);
 for(const [key,value] of Object.entries(item)){
  if(known.has(key)||/html|script|style/i.test(key))continue;
  const clean=cleanProfileValue(value);
  if(clean!==null&&clean!==''&&(!Array.isArray(clean)||clean.length))profile.additionalFields[key]=clean;
 }
 return {id:slug,name,type:profile.type||'Unknown',source:'StrainAPI',url:profile.sourceUrl,imageUrl,profile};
}
function cleanProfileValue(value,depth=0){
 if(value===null||value===undefined||depth>4)return null;
 if(typeof value==='string')return plainText(value).slice(0,2000);
 if(typeof value==='number'||typeof value==='boolean')return value;
 if(Array.isArray(value))return value.map(v=>cleanProfileValue(v,depth+1)).filter(v=>v!==null&&v!=='');
 if(typeof value==='object'){
  const out={};
  for(const [key,v] of Object.entries(value)){
   if(/html|script|style/i.test(key))continue;
   const clean=cleanProfileValue(v,depth+1);
   if(clean!==null&&clean!=='')out[key]=clean;
  }
  return Object.keys(out).length?out:null;
 }
 return null;
}
function strainDataValueExists(value){
 if(value===null||value===undefined||value==='')return false;
 if(Array.isArray(value))return value.some(strainDataValueExists);
 if(typeof value==='object')return Object.values(value).some(strainDataValueExists);
 return true;
}
function hasDocumentedStrainData(item){
 const p=mapStrainRecord(item).profile;
 return ['breeder','genetics','thc','cbd','terpenes','effects','flavor','aroma','flowering','outdoorHarvest','plantStructure','yield','evidence'].some(key=>strainDataValueExists(p[key]));
}
async function fetchVerifiedStrainCatalog(){
 const base='https://www.strainapi.com/wp-json/strainapi/v1/strains';
 const records=[];let totalPages=1;
 for(let page=1;page<=totalPages&&page<=20;page++){
  const response=await fetch(base+'?per_page=100&page='+page,{headers:{'Accept':'application/json','User-Agent':'Preroll.org verified strain library'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('StrainAPI catalog returned HTTP '+response.status);
  const payload=await response.json();
  const batch=profileRows(payload);
  if(page===1)totalPages=Math.min(20,Number(response.headers.get('X-WP-TotalPages'))||1);
  for(const raw of batch){
   const record=mapStrainRecord(raw);
   if(!record.name||!record.id||!hasDocumentedStrainData(raw))continue;
   records.push(record);
  }
  if(batch.length<100)break;
 }
 const unique=new Map();
 for(const record of records)if(!unique.has(strainKey(record.name)))unique.set(strainKey(record.name),record);
 return [...unique.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
app.get('/api/strains/verified',async(req,res)=>{
 try{
  const strains=await cached('verified-strain-catalog',6*60*60*1000,fetchVerifiedStrainCatalog);
  res.setHeader('Cache-Control','public, max-age=900, s-maxage=3600');
  res.json({strains,total:strains.length,source:'StrainAPI',filter:'at least one documented strain-specific data field'});
 }catch(e){
  console.error('Verified strain catalog unavailable:',e.message);
  res.status(502).json({error:'The verified strain data source is temporarily unavailable.'});
 }
});

app.get('/api/strains/:slug/profile',async(req,res)=>{
 const catalogId=String(req.params.slug||'').slice(0,180);
 const expected=String(req.query.name||'').slice(0,180);
 if(!catalogId||!expected)return res.status(400).json({error:'A catalog ID and exact strain name are required.'});
 try{
  const key=strainKey(expected);
  const profile=await cached('strain-profile-name:'+key,12*60*60*1000,async()=>{
   let candidates=[];
   try{candidates=profileRows(await fetchJson('https://www.strainapi.com/wp-json/strainapi/v1/search?q='+encodeURIComponent(expected)))}catch{}
   let match=candidates.find(x=>strainKey(x.name||x.display_title)===key);
   if(!match){
    const fallbackSlug=catalogId.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,180);
    try{const fallback=await fetchJson('https://www.strainapi.com/wp-json/strainapi/v1/strains/'+encodeURIComponent(fallbackSlug));if(strainKey(fallback.name||fallback.display_title)===key)match=fallback}catch{}
   }
   if(!match||!match.slug)return null;
   const full=await fetchJson('https://www.strainapi.com/wp-json/strainapi/v1/strains/'+encodeURIComponent(match.slug));
   if(strainKey(full.name||full.display_title)!==key)return null;
   return full;
  });
  if(!profile)return res.status(404).json({error:'No exact-name detailed profile is available from the connected source.'});
  const returnedName=String(profile.name||profile.display_title||'').trim();
  const image=profile.image||profile.featured_image||{};
  const imageUrl=safeHttpUrl(typeof image==='string'?image:(image.url||image.src||profile.image_url||profile.imageUrl));
  const description=plainText(profile.description||profile.excerpt||profile.content||'').slice(0,5000);
  const sourceUrl=safeHttpUrl(profile.url)||('https://www.strainapi.com/'+encodeURIComponent(profile.slug||'')+'/');
  const known=['id','name','display_title','slug','url','excerpt','image','featured_image','image_url','imageUrl','description','content','content_html','breeder','genetics','type','indica_percent','sativa_percent','seed_type','thc','cbd','terpenes','effects','flavor','aroma','flowering','outdoor_harvest','plant_structure','yield','evidence','aliases','published_at','updated_at'];
  const additionalFields={};
  for(const [k,v] of Object.entries(profile)){
   if(known.includes(k)||/html|script|style/i.test(k))continue;
   const clean=cleanProfileValue(v);if(clean!==null&&clean!==''&&(!Array.isArray(clean)||clean.length))additionalFields[k]=clean;
  }
  res.setHeader('Cache-Control','public, max-age=3600, s-maxage=21600');
  res.json({
   name:returnedName,description,imageUrl,
   imageAlt:plainText((typeof image==='object'&&image.alt)||returnedName+' strain photo'),
   sourceUrl,provider:'StrainAPI',providerSlug:profile.slug,
   breeder:profile.breeder||null,genetics:profile.genetics||null,
   type:profile.type||null,indicaPercent:profile.indica_percent??null,sativaPercent:profile.sativa_percent??null,
   seedType:profile.seed_type||null,thc:profile.thc??null,cbd:profile.cbd??null,
   terpenes:profile.terpenes??[],effects:profile.effects??null,flavor:profile.flavor??null,aroma:profile.aroma??null,
   flowering:profile.flowering??null,outdoorHarvest:profile.outdoor_harvest??null,
   plantStructure:profile.plant_structure??null,yield:profile.yield??null,
   evidence:profile.evidence??null,aliases:profile.aliases??[],
   publishedAt:profile.published_at??null,updatedAt:profile.updated_at??null,
   additionalFields
  });
 }catch(e){
  console.error('Strain profile lookup failed:',e.message);
  res.status(502).json({error:'The detailed strain source is temporarily unavailable.'});
 }
});


function isActiveRetailLicense(row){
 const pick=(keys)=>keys.map(k=>row?.[k]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')||'';
 const type=String(pick(['license_type','license_category','type'])).toLowerCase();
 const status=String(pick(['license_status','status','current_status'])).toLowerCase();
 return /adult.?use.*retail|retail.*dispensary|au retail/.test(type) && /active|operational|issued/.test(status);
}
function publicDispensaryRecord(row){
 const pick=(keys)=>keys.map(k=>row?.[k]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')||'';
 const name=String(pick(['entity_name','business_name','dba','licensee_name'])).trim();
 const licenseNumber=String(pick(['license_number','license_no','license_id'])).trim();
 const address=String(pick(['address','location_address','street_address','address_1'])).trim();
 const city=String(pick(['city','location_city'])).trim();
 const county=String(pick(['county','location_county'])).trim();
 const state=String(pick(['state','location_state'])).trim()||'NY';
 const zip=String(pick(['zip','zip_code','postal_code','location_zip'])).trim();
 const phone=String(pick(['phone','phone_number','business_phone'])).trim();
 const email=String(pick(['email','contact_email','business_email'])).trim();
 const website=safeHttpUrl(pick(['website','website_url','business_website']));
 return {name,licenseNumber,address,city,county,state,zip,phone,email,website,
  licenseType:String(pick(['license_type','license_category','type'])).trim(),
  status:String(pick(['license_status','status','current_status'])).trim()};
}
app.get('/api/dispensaries',async(req,res)=>{
 try{
  const data=await cached('nylicenses',10*60*1000,getNyLicenses);
  const q=String(req.query.q||'').trim().toLowerCase().slice(0,100);
  const county=String(req.query.county||'').trim().toLowerCase().slice(0,80);
  const records=(data.licenses||[]).filter(isActiveRetailLicense).map(publicDispensaryRecord).filter(x=>x.name&&x.licenseNumber);
  const filtered=records.filter(x=>(!q||[x.name,x.address,x.city,x.county,x.licenseNumber].join(' ').toLowerCase().includes(q))&&(!county||x.county.toLowerCase()===county));
  const counties=[...new Set(records.map(x=>x.county).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  res.setHeader('Cache-Control','public, max-age=300, s-maxage=600');
  res.json({provider:data.provider,source:data.source,fetchedAt:data.fetchedAt,total:filtered.length,allActiveRetail:records.length,counties,dispensaries:filtered});
 }catch(e){console.error('NY dispensary directory unavailable:',e.message);res.status(502).json({error:'New York OCM dispensary records are temporarily unavailable.'})}
});
app.post('/api/dispensaries/claims',rateLimitAuth,async(req,res,next)=>{
 if(!pool)return res.status(503).json({error:'Business listing storage is temporarily unavailable.'});
 try{
  const body=req.body||{};
  if(String(body.companyFax||'').trim())return res.status(202).json({ok:true});
  const licenseNumber=String(body.licenseNumber||'').trim().slice(0,100);
  const contactName=String(body.contactName||'').trim().slice(0,90);
  const email=String(body.email||'').trim().toLowerCase().slice(0,180);
  const website=String(body.website||'').trim().slice(0,240);
  const message=String(body.message||'').trim().slice(0,1200);
  if(!licenseNumber||!contactName||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||body.consent!=='on')return res.status(400).json({error:'Enter your OCM license number, contact name, valid business email, and consent.'});
  if(website){let parsed;try{parsed=new URL(website)}catch{return res.status(400).json({error:'Website must be a valid http or https URL.'})}if(!['http:','https:'].includes(parsed.protocol))return res.status(400).json({error:'Website must use http or https.'});}
  const data=await cached('nylicenses',10*60*1000,getNyLicenses);
  const row=(data.licenses||[]).find(item=>{
   const number=String(item.license_number||item.license_no||item.license_id||'').trim();
   return number.toLowerCase()===licenseNumber.toLowerCase()&&isActiveRetailLicense(item);
  });
  if(!row)return res.status(400).json({error:'That license number was not found as an active New York adult-use retail dispensary in the current OCM dataset.'});
  const listing=publicDispensaryRecord(row);
  const result=await pool.query(`INSERT INTO dispensary_claims(license_number,business_name,contact_name,email,website,message)
   VALUES($1,$2,$3,$4,$5,$6)
   ON CONFLICT(license_number,email) DO UPDATE SET contact_name=EXCLUDED.contact_name,website=EXCLUDED.website,message=EXCLUDED.message,status='pending'
   RETURNING id,created_at`,[listing.licenseNumber,listing.name,contactName,email,website||null,message||null]);
  res.status(201).json({ok:true,id:result.rows[0].id,status:'pending_review',receivedAt:result.rows[0].created_at});
 }catch(e){next(e)}
});
app.get('/api/news',async(req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(await cached('news',10*60*1000,getCannabisNews))}catch(e){res.status(502).json({error:'Public cannabis news feeds unavailable'})}});

app.get('/api/ny/licenses',async(req,res,next)=>{try{res.setHeader('Cache-Control','no-store');const data=await cached('nylicenses',10*60*1000,getNyLicenses);res.json(data)}catch(e){res.status(502).json({error:'New York license data unavailable'})}});

app.get('/api/health',async(req,res)=>{if(!pool)return res.json({ok:true,database:false});try{await pool.query('SELECT 1');res.json({ok:true,database:true})}catch{res.status(503).json({ok:false,database:false})}});
app.post('/api/media-network/inquiries',rateLimitAuth,async(req,res,next)=>{
 if(!pool)return res.status(503).json({error:'Business inquiry storage is temporarily unavailable.'});
 try{
  const body=req.body||{};
  if(String(body.companyFax||'').trim())return res.status(202).json({ok:true});
  const businessName=String(body.businessName||'').trim().slice(0,120);
  const contactName=String(body.contactName||'').trim().slice(0,90);
  const email=String(body.email||'').trim().toLowerCase().slice(0,180);
  const website=String(body.website||'').trim().slice(0,240);
  const businessType=String(body.businessType||'').trim().slice(0,100);
  const interest=String(body.interest||'').trim().slice(0,100);
  const market=String(body.market||'').trim().slice(0,140);
  const message=String(body.message||'').trim().slice(0,1200);
  if(!businessName||!contactName||!/^\S+@\S+\.\S+$/.test(email)||!businessType||!interest||body.consent!=='on')return res.status(400).json({error:'Complete the required fields and consent checkbox.'});
  if(website&&!/^https?:\/\//i.test(website))return res.status(400).json({error:'Website must begin with https:// or http://'});
  const result=await pool.query('INSERT INTO media_network_inquiries(business_name,contact_name,email,website,business_type,interest,market,message) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,created_at',[businessName,contactName,email,website||null,businessType,interest,market||null,message||null]);
  res.status(201).json({ok:true,id:result.rows[0].id,receivedAt:result.rows[0].created_at});
 }catch(e){next(e)}
});
app.get('/api/media-network/overview',async(req,res)=>{
 if(!pool)return res.status(503).json({ok:false,database:false});
 try{
  const [strains,backup,posts,reviews,inquiries]=await Promise.all([
   pool.query('SELECT COUNT(*)::int AS count FROM strains'),
   pool.query('SELECT COUNT(*)::int AS count FROM strain_catalog_backup'),
   pool.query('SELECT COUNT(*)::int AS count FROM posts'),
   pool.query('SELECT COUNT(*)::int AS count FROM reviews'),
   pool.query('SELECT COUNT(*)::int AS count FROM media_network_inquiries')
  ]);
  res.setHeader('Cache-Control','no-store');
  res.json({ok:true,database:true,generatedAt:new Date().toISOString(),counts:{strains:strains.rows[0].count,strainBackup:backup.rows[0].count,posts:posts.rows[0].count,reviews:reviews.rows[0].count,inquiries:inquiries.rows[0].count}});
 }catch(e){console.error('Media Network overview failed:',e.message);res.status(503).json({ok:false,database:false})}
});

app.post('/api/signup',rateLimitAuth,async(req,res,next)=>{if(!pool)return res.status(503).json({error:'Database connection is pending.'});
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
app.post('/api/login',rateLimitAuth,async(req,res,next)=>{if(!pool)return res.status(503).json({error:'Database connection is pending.'});
 try{
  const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
  const q=await pool.query('SELECT * FROM users WHERE email=$1',[email]),user=q.rows[0];
  if(!user||!(await bcrypt.compare(password,user.password_hash)))return res.status(401).json({error:'Invalid email or password'});
  await createSession(user.id,res);res.json({user:publicUser(user)});
 }catch(e){next(e)}
});
app.get('/api/me',auth,(req,res)=>res.json({user:publicUser(req.user)}));
app.post('/api/logout',rateLimitAuth,async(req,res,next)=>{if(!pool)return res.json({ok:true});try{const raw=req.cookies?.pr_session;if(raw)await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hashToken(raw)]);res.clearCookie('pr_session',{httpOnly:true,secure:true,sameSite:'none',path:'/'});res.json({ok:true})}catch(e){next(e)}});

app.get('/api/posts',async(req,res,next)=>{if(!pool)return res.json([]);try{const q=await pool.query('SELECT id,title,category,body,author,likes,EXTRACT(EPOCH FROM created_at)*1000 AS created FROM posts ORDER BY created_at DESC');res.json(q.rows)}catch(e){next(e)}});
app.post('/api/posts',rateLimitWrites,auth,async(req,res,next)=>{try{const title=String(req.body?.title||'').trim().slice(0,90),category=String(req.body?.category||'General').slice(0,40),body=String(req.body?.body||'').trim().slice(0,1000);if(!title||!body)return res.status(400).json({error:'Title and body required'});const q=await pool.query('INSERT INTO posts(title,category,body,author) VALUES($1,$2,$3,$4) RETURNING id,title,category,body,author,likes,EXTRACT(EPOCH FROM created_at)*1000 AS created',[title,category,body,req.user.username]);res.status(201).json(q.rows[0])}catch(e){next(e)}});
app.post('/api/posts/:id/like',rateLimitWrites,async(req,res,next)=>{if(!pool)return res.status(503).json({error:'Database connection is pending.'});try{const q=await pool.query('UPDATE posts SET likes=likes+1 WHERE id=$1 RETURNING id,title,category,body,author,likes,EXTRACT(EPOCH FROM created_at)*1000 AS created',[req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Not found'});res.json(q.rows[0])}catch(e){next(e)}});

app.get('/api/reviews',async(req,res,next)=>{if(!pool)return res.json([]);try{const q=await pool.query('SELECT id,strain,author,text,overall,burn,flavor,value,EXTRACT(EPOCH FROM created_at)*1000 AS created FROM reviews ORDER BY created_at DESC');res.json(q.rows)}catch(e){next(e)}});
app.post('/api/reviews',rateLimitWrites,auth,async(req,res,next)=>{try{const vals=['overall','burn','flavor','value'].map(k=>Number(req.body?.[k]));if(vals.some(v=>!Number.isInteger(v)||v<1||v>5))return res.status(400).json({error:'Scores must be 1 through 5.'});const strain=String(req.body?.strain||'').slice(0,80),text=String(req.body?.text||'').trim().slice(0,600);if(!strain||!text)return res.status(400).json({error:'Strain and review text required'});const q=await pool.query('INSERT INTO reviews(strain,author,text,overall,burn,flavor,value) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,strain,author,text,overall,burn,flavor,value,EXTRACT(EPOCH FROM created_at)*1000 AS created',[strain,req.user.username,text,...vals]);res.status(201).json(q.rows[0])}catch(e){next(e)}});

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Server error'})});
init().then(async()=>{
 const server=app.listen(PORT,()=>console.log('Preroll.org API listening on '+PORT));
 if(pool&&process.env.STRAIN_SYNC_ON_EMPTY==='true'){
  try{
   const q=await pool.query('SELECT COUNT(*)::int AS count FROM strains');
   if(q.rows[0].count===0){
    console.log('Strain catalog is empty; starting initial Leafly/Weedmaps sync');
    const child=spawn(process.execPath,['strain-sync.js'],{cwd:__dirname,stdio:'inherit',detached:false});
    child.on('error',err=>console.error('Initial strain sync failed to start:',err));
   }
  }catch(e){console.error('Could not check strain catalog:',e)}
 }
 return server;
}).catch(err=>{console.error(err);process.exit(1)});
