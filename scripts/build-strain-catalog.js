const fs=require('fs');

const SOURCES=[
 {source:'leafly',base:'https://www.leafly.com/strains?page=',pages:517},
 {source:'weedmaps',base:'https://weedmaps.com/strains?page=',pages:657}
];
const CONCURRENCY=8;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function decode(s=''){return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function slugFromHref(href,source){
 const m=source==='leafly'?href.match(/\/strains\/([^?#"'<>]+)/):href.match(/\/strains\/([^?#"'<>]+)/);
 return m?decode(m[1]).replace(/\/$/,''):null;
}
function cleanName(s){return decode(s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()).slice(0,180);}
function parse(html,source){
 const out=new Map();
 const re=/href=["']([^"']*\/strains\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
 let m;
 while((m=re.exec(html))){
  const slug=slugFromHref(m[1],source);
  if(!slug||slug.includes('/'))continue;
  let name=cleanName(m[2]);
  if(!name||name.length<2||/^(all strains|strains)$/i.test(name))continue;
  const nearby=html.slice(Math.max(0,m.index-500),Math.min(html.length,m.index+900)).toLowerCase();
  const type=/\bindica\b/.test(nearby)?'Indica':/\bsativa\b/.test(nearby)?'Sativa':/\bhybrid\b/.test(nearby)?'Hybrid':'Unknown';
  if(!out.has(slug))out.set(slug,{id:slug,name,type,source});
 }
 return [...out.values()];
}
async function fetchPage(url){
 for(let attempt=0;attempt<3;attempt++){
  try{
   const r=await fetch(url,{headers:{'User-Agent':'Preroll.org strain catalog bot/1.0','Accept':'text/html,application/xhtml+xml'}});
   if(!r.ok)throw new Error('HTTP '+r.status);
   return await r.text();
  }catch(e){if(attempt===2)throw e;await sleep(800*(attempt+1));}
 }
}
async function runSource(src){
 const all=new Map(), queue=Array.from({length:src.pages},(_,i)=>i+1); let active=0;
 await new Promise((resolve,reject)=>{
  const next=()=>{
   while(active<CONCURRENCY&&queue.length){
    const page=queue.shift();active++;
    fetchPage(src.base+page).then(html=>{
     for(const x of parse(html,src.source))all.set(x.id,x);
    }).catch(e=>console.error(src.source,'page',page,e.message)).finally(()=>{
     active--; if(!queue.length&&!active)resolve(); else next();
    });
   }
  };next();
 });
 return [...all.values()];
}
(async()=>{
 const started=new Date().toISOString();
 const chunks=await Promise.all(SOURCES.map(runSource));
 const strains=chunks.flat().sort((a,b)=>a.name.localeCompare(b.name)||a.source.localeCompare(b.source));
 const payload={generatedAt:new Date().toISOString(),sources:{leafly:chunks[0].length,weedmaps:chunks[1].length},total:strains.length,strains};
 fs.mkdirSync('strains',{recursive:true});
 fs.writeFileSync('strains/catalog.json',JSON.stringify(payload));
 console.log(JSON.stringify({started,finished:payload.generatedAt,total:payload.total,sources:payload.sources}));
 if(!strains.length)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});