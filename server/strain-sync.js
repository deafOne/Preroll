'use strict';

const {Pool}=require('pg');
const DATABASE_URL=process.env.DATABASE_URL;
if(!DATABASE_URL)throw new Error('DATABASE_URL is required');

const pool=new Pool({connectionString:DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});
const SOURCES=[
 {name:'leafly',base:'https://www.leafly.com/strains?page=',fallbackPages:517},
 {name:'weedmaps',base:'https://weedmaps.com/strains?page=',fallbackPages:657}
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function stripHtml(v=''){
 return v.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'')
  .replace(/<[^>]+>/g,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
  .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();
}
function parsePage(html,source,page){
 const out=new Map(),re=/<a[^>]+href=["'](?:https?:\/\/[^"']+)?\/strains\/([^"'?#/]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
 let m;
 while((m=re.exec(html))){
  const slug=m[1],text=stripHtml(m[2]).replace(/\s+/g,' ').trim();
  if(!text||text.length>160||/^(strains|learn more|indica|sativa|hybrid)$/i.test(text))continue;
  const before=stripHtml(html.slice(Math.max(0,m.index-700),m.index)).toLowerCase();
  const tm=before.match(/\b(indica|sativa|hybrid)\b/);
  const type=tm?tm[1][0].toUpperCase()+tm[1].slice(1):'Unknown';
  const name=text.replace(/^(indica|sativa|hybrid)\s+/i,'').replace(/\s+aka.*$/i,'').trim();
  if(name.length<2)continue;
  out.set(slug,{slug,name,type,source,source_page:page});
 }
 return [...out.values()];
}
async function fetchPage(url){
 const r=await fetch(url,{headers:{'User-Agent':'Preroll.org strain catalog importer/1.0','Accept':'text/html,application/xhtml+xml'}});
 if(!r.ok)throw new Error(r.status+' '+r.statusText);
 return r.text();
}
function discoverPages(html,fallback){
 const nums=[...html.matchAll(/[?&]page=(\d+)/gi)].map(m=>Number(m[1])).filter(Number.isFinite);
 return Math.max(fallback,...nums,1);
}
async function ensureTable(){
 await pool.query(`CREATE TABLE IF NOT EXISTS strains(
  id BIGSERIAL PRIMARY KEY,slug VARCHAR(180) NOT NULL,name VARCHAR(180) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'Unknown',source VARCHAR(20) NOT NULL,
  source_page INTEGER,updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(slug,source)
 )`);
}
async function save(rows){
 if(!rows.length)return;
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  for(const r of rows)await client.query(`INSERT INTO strains(slug,name,type,source,source_page,updated_at)
   VALUES($1,$2,$3,$4,$5,now())
   ON CONFLICT(slug,source) DO UPDATE SET name=EXCLUDED.name,type=EXCLUDED.type,source_page=EXCLUDED.source_page,updated_at=now()`,
   [r.slug,r.name,r.type,r.source,r.source_page]);
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
async function runSource(source){
 const first=await fetchPage(source.base+'1'),pages=discoverPages(first,source.fallbackPages);
 console.log('['+source.name+'] '+pages+' pages detected');
 const firstRows=parsePage(first,source.name,1);await save(firstRows);
 let total=firstRows.length,next=2;
 const concurrency=4;
 while(next<=pages){
  const batch=[];for(let i=0;i<concurrency&&next<=pages;i++,next++)batch.push(next);
  const results=await Promise.all(batch.map(async page=>{
   try{const rows=parsePage(await fetchPage(source.base+page),source.name,page);await sleep(200);return rows}
   catch(e){console.error('['+source.name+'] page '+page+' failed: '+e.message);return []}
  }));
  for(const rows of results){await save(rows);total+=rows.length}
  console.log('['+source.name+'] through page '+Math.min(next-1,pages)+'; records seen: '+total);
  await sleep(400);
 }
 return total;
}
(async()=>{
 try{
  await ensureTable();
  for(const source of SOURCES)await runSource(source);
  const q=await pool.query('SELECT source,COUNT(*)::int AS count FROM strains GROUP BY source ORDER BY source');
  console.log('Strain catalog sync complete:',q.rows);
 }catch(e){console.error('Strain catalog sync failed:',e);process.exitCode=1}
 finally{await pool.end()}
})();