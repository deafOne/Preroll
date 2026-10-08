const fs=require('fs');
const path=require('path');

const SOURCES=[
 {name:'Leafly',index:'https://www.leafly.com/learn',kind:'learn',max:80},
 {name:'Weedmaps Learn',index:'https://weedmaps.com/learn',kind:'learn',max:80},
 {name:'Grow Weed Easy',index:'https://www.growweedeasy.com/',kind:'grow',max:100},
 {name:'Cannabis Training University',index:'https://cannabistraininguniversity.com/blog/',kind:'education',max:100},
 {name:'New York OCM',index:'https://cannabis.ny.gov/guide-safer-cannabis-consumption',kind:'ny',max:40},
 {name:'NY Department of Health',index:'https://www.health.ny.gov/community/cannabis/index.htm',kind:'ny',max:40}
];

const HOWTO=/\\b(how to|guide|tips|tutorial|beginner|setup|set up|use|using|consume|consumption|dose|dosing|store|storage|clean|grind|roll|smoke|vape|edible|tincture|terpene|strain|grow|growing|harvest|dry|cure|clone|prune|train|nutrient|safety|safer|responsib|label|potency|dispensary|buy|choose|cook|cooking)\\b/i;
const SKIP=/\\b(login|sign up|newsletter|advertis|podcast|horoscope|shop|merch|careers|jobs)\\b/i;

async function get(url){
 const r=await fetch(url,{headers:{'User-Agent':'Preroll.org guide-index/1.0','Accept':'text/html,application/xhtml+xml'},redirect:'follow'});
 if(!r.ok) throw new Error(url+' -> '+r.status);
 return r.text();
}
function clean(s=''){return s.replace(/<script[\\s\\S]*?<\\/script>/gi,' ').replace(/<style[\\s\\S]*?<\\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\\s+/g,' ').trim();}
function absolute(href,base){try{return new URL(href,base).href}catch{return null}}
function links(html,base){
 const out=[]; const re=/<a\\b[^>]*href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi; let m;
 while((m=re.exec(html))){
  const url=absolute(m[1],base); if(!url||!/^https?:\\/\\//.test(url))continue;
  const text=clean(m[2]); if(!text)continue; out.push({url,text});
 }
 return out;
}
function meta(html,name){
 const re=new RegExp('<meta[^>]+(?:name|property)=["\\']'+name+'["\\'][^>]+content=["\\']([^"\\']*)["\\']','i');
 return clean((html.match(re)||[])[1]||'');
}
function title(html){return clean((html.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i)||[])[1]||'');}
function dateFrom(html){
 const raw=(html.match(/(?:datePublished|dateModified)["']?\\s*[:=]\\s*["']([^"']+)/i)||[])[1]||'';
 const d=new Date(raw); return isNaN(d)?null:d.toISOString();
}
function category(title,url,kind){
 const s=(title+' '+url).toLowerCase();
 if(/grow|harvest|cure|clone|prune|nutrient|vpd|seed|plant/.test(s))return 'Growing';
 if(/edible|cook|recipe|infus|tincture/.test(s))return 'Edibles & cooking';
 if(/terpene|cannabinoid|thc|cbd|tac|science|effect/.test(s))return 'Cannabis science';
 if(/safety|dose|dosing|consume|consumption|overconsum|responsib|drug test/.test(s))return 'Safer consumption';
 if(/new york|ny cannabis|dispensary|license|law|legal/.test(s)||kind==='ny')return 'New York';
 return 'Cannabis 101';
}
async function crawlSource(src){
 const found=new Map();
 let queue=[src.index],seen=new Set();
 while(queue.length && seen.size<12){
  const url=queue.shift(); if(seen.has(url))continue; seen.add(url);
  let html; try{html=await get(url)}catch(e){continue}
  for(const l of links(html,url)){
   if(found.size>=src.max)break;
   if(SKIP.test(l.text+' '+l.url))continue;
   if(!HOWTO.test(l.text+' '+l.url))continue;
   const u=l.url.split('#')[0];
   if(u===src.index||found.has(u))continue;
   const sameHost=new URL(u).hostname===new URL(src.index).hostname;
   if(!sameHost)continue;
   found.set(u,{url:u,linkText:l.text});
  }
  for(const l of links(html,url)){
   if(seen.size+queue.length>20)break;
   if(new URL(l.url).hostname!==new URL(src.index).hostname)continue;
   if(/page=|\\/page\\/|\\?paged=|\\/category\\//i.test(l.url)&&!seen.has(l.url))queue.push(l.url);
  }
 }
 const items=[];
 for(const [url,base] of found){
  try{
   const html=await get(url),t=title(html)||base.linkText,desc=meta(html,'description')||meta(html,'og:description');
   const d=dateFrom(html);
   items.push({title:t,description:desc.slice(0,320),url,source:src.name,category:category(t,url,src.kind),publishedAt:d});
  }catch{}
 }
 return items;
}
(async()=>{
 const all=(await Promise.all(SOURCES.map(crawlSource))).flat();
 const seen=new Set();
 const cutoff=Date.now()-1000*60*60*24*730;
 const cleanItems=all.filter(x=>{if(!x.title||seen.has(x.url))return false;seen.add(x.url);return true})
  .sort((a,b)=>(Date.parse(b.publishedAt||'')||0)-(Date.parse(a.publishedAt||'')||0));
 const recent=cleanItems.filter(x=>!x.publishedAt||Date.parse(x.publishedAt)>=cutoff);
 const out={generatedAt:new Date().toISOString(),count:recent.length,sources:SOURCES.map(x=>x.name),guides:recent.slice(0,500)};
 const file=path.join(__dirname,'..','guides','catalog.json');
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(out,null,2)+'\\n');
 console.log('Guide catalog:',out.count);
})().catch(e=>{console.error(e);process.exit(1)});
