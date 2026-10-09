const fs=require('fs');

const SOURCES=[
 {source:'leafly',base:'https://www.leafly.com/strains?page=',defaultPages:517},
 {source:'weedmaps',base:'https://weedmaps.com/strains?page=',defaultPages:591}
];

const CONCURRENCY=6;
const MIN_VALID_RECORDS=100;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function decode(s=''){
 return s
  .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
  .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&#x2F;/gi,'/');
}

function slugFromHref(href=''){
 const m=href.match(/\/strains\/([^?#"'<>]+)/i);
 return m?decode(m[1]).replace(/\/$/,''):null;
}

function cleanName(s=''){
 return decode(s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()).slice(0,180);
}

function inferType(text=''){
 const s=text.toLowerCase();
 if(/\bindica\b/.test(s))return 'Indica';
 if(/\bsativa\b/.test(s))return 'Sativa';
 if(/\bhybrid\b/.test(s))return 'Hybrid';
 return 'Unknown';
}

function parse(html,source){
 const out=new Map();
 const re=/href=["']([^"'<>]*\/strains\/[^"'<>?#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
 let m;
 while((m=re.exec(html))){
  const slug=slugFromHref(m[1]);
  if(!slug||slug.includes('/'))continue;
  const name=cleanName(m[2]);
  if(!name||name.length<2||/^(all strains|strains|learn more)$/i.test(name))continue;
  const nearby=html.slice(Math.max(0,m.index-700),Math.min(html.length,m.index+1200));
  const type=inferType(nearby);
  out.set(slug,{id:slug,name,type,source,url:'https://'+(source==='leafly'?'www.leafly.com':source==='herbistry420'?'herbistry420.com':'weedmaps.com')+'/strains/'+slug});
 }
 return [...out.values()];
}

function detectPages(html, fallback){
 const nums=[];
 for(const m of html.matchAll(/[?&]page=(\d+)/gi))nums.push(Number(m[1]));
 const textNums=[...html.matchAll(/(?:of|page)\s+(\d{2,4})/gi)].map(m=>Number(m[1]));
 const max=Math.max(fallback,...nums,...textNums);
 return Number.isFinite(max)&&max>0?max:fallback;
}

async function fetchPage(url){
 const headers={
  'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36 PrerollCatalog/1.0',
  'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language':'en-US,en;q=0.9',
  'Cache-Control':'no-cache',
  'Pragma':'no-cache'
 };
 let last;
 for(let attempt=0;attempt<5;attempt++){
  try{
   const r=await fetch(url,{headers,redirect:'follow'});
   if(!r.ok)throw new Error('HTTP '+r.status);
   const html=await r.text();
   if(html.length<1000)throw new Error('response too small');
   return html;
  }catch(e){
   last=e;
   const delay=Math.min(12000,1000*Math.pow(2,attempt)+(Math.random()*500));
   await sleep(delay);
  }
 }
 throw last;
}

async function runWeedmapsAlphabet(){
 const letters='abcdefghijklmnopqrstuvwxyz'.split('');
 const all=new Map();let failed=0;
 await Promise.all(letters.map(async letter=>{
  try{
   const html=await fetchPage('https://weedmaps.com/strains/list-'+letter);
   for(const item of parse(html,'weedmaps'))all.set(item.id,item);
  }catch(e){failed++;console.error('weedmaps A-Z',letter,e.message)}
 }));
 const strains=[...all.values()];
 console.log(JSON.stringify({source:'weedmaps-a-z',pages:letters.length,records:strains.length,failed}));
 return {source:'weedmaps-a-z',pages:letters.length,strains,failed};
}
async function runHerbistryIndex(){
 const all=new Map();let failed=0;
 try{
  const html=await fetchPage('https://herbistry420.com/strains/index-a-z');
  for(const item of parse(html,'herbistry420'))all.set(item.id,item);
 }catch(e){failed++;console.error('herbistry420 index',e.message)}
 const strains=[...all.values()];
 console.log(JSON.stringify({source:'herbistry420',pages:1,records:strains.length,failed}));
 return {source:'herbistry420',pages:1,strains,failed};
}

async function runSource(src){
 const first=await fetchPage(src.base+'1');
 const pages=detectPages(first,src.defaultPages);
 const all=new Map();
 for(const x of parse(first,src.source))all.set(x.id,x);

 const queue=Array.from({length:pages-1},(_,i)=>i+2);
 let active=0,failed=0;

 await new Promise(resolve=>{
  const next=()=>{
   while(active<CONCURRENCY&&queue.length){
    const page=queue.shift();
    active++;
    fetchPage(src.base+page).then(html=>{
      for(const x of parse(html,src.source))all.set(x.id,x);
    }).catch(e=>{
      failed++;
      console.error(src.source,'page',page,e.message);
    }).finally(()=>{
      active--;
      if(!queue.length&&!active)resolve();
      else next();
    });
   }
  };
  next();
 });

 const strains=[...all.values()];
 console.log(JSON.stringify({source:src.source,pages,records:strains.length,failed}));
 return {source:src.source,pages,strains,failed};
}

(async()=>{
 const started=new Date().toISOString();
 const results=[];
 for(const src of SOURCES){
  try{ results.push(await runSource(src)); }
  catch(e){ console.error(src.source,'fatal:',e.message); results.push({source:src.source,pages:0,strains:[],failed:src.defaultPages}); }
 }
 // Supplement paginated catalogs with alphabetic directories and an independent A-Z index.
 try{results.push(await runWeedmapsAlphabet())}catch(e){console.error('Weedmaps A-Z failed',e.message)}
 try{results.push(await runHerbistryIndex())}catch(e){console.error('Herbistry index failed',e.message)}

 const counts=Object.fromEntries(results.map(x=>[x.source,x.strains.length]));
 const total=results.reduce((n,x)=>n+x.strains.length,0);

 // Never replace a good catalog with an empty/partial scrape.
 if(results.filter(x=>SOURCES.some(src=>src.source===x.source)).some(x=>x.strains.length<MIN_VALID_RECORDS)){
  console.error('Catalog validation failed:',JSON.stringify(counts));
  process.exit(2);
 }

 const strains=results.flatMap(x=>x.strains)
  .sort((a,b)=>a.name.localeCompare(b.name)||a.source.localeCompare(b.source));

 const payload={
  generatedAt:new Date().toISOString(),
  sources:counts,
  pages:Object.fromEntries(results.map(x=>[x.source,x.pages])),
  failedPages:Object.fromEntries(results.map(x=>[x.source,x.failed])),
  total,
  strains
 };

 fs.mkdirSync('strains',{recursive:true});
 const tmp='strains/catalog.json.tmp';
 fs.writeFileSync(tmp,JSON.stringify(payload));
 fs.renameSync(tmp,'strains/catalog.json');
 console.log(JSON.stringify({started,finished:payload.generatedAt,total,counts,pages:payload.pages}));
})().catch(e=>{console.error(e);process.exit(1)});
