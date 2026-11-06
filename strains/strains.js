'use strict';
const API_URL=String((window.PREROLL_CONFIG&&window.PREROLL_CONFIG.API_URL)||'').replace(new RegExp('/+$'),'');
const $=s=>document.querySelector(s),PAGE_SIZE=24;
let catalog=[],page=1;
const profileCache=new Map();
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function sourceUrl(s){if(s.url&&(s.url.startsWith('https://')||s.url.startsWith('http://')))return s.url;return s.source==='leafly'?'https://www.leafly.com/strains/'+encodeURIComponent(s.id):s.source==='weedmaps'?'https://weedmaps.com/strains/'+encodeURIComponent(s.id):'#'}
function junkStarTitle(name=''){return /\b\d+\s*(?:-|–|—|to)\s*(?:\d+\s*)?stars?\b|\b0\s*[-–—]\s*\*\s*stars?\b/i.test(String(name))||/\b\d+(?:\.\d+)?\s*stars?\b/i.test(String(name));}
function hasPhotoHint(s){return Boolean(s.imageUrl||s.image_url||s.image||s.photo||s.photoUrl||s.photo_url||s.thumbnail||s.featured_image);}
function filtered(){const q=$('#strainSearch').value.trim().toLowerCase(),type=$('#typeFilter').value,source=$('#sourceFilter').value;return catalog.filter(s=>!junkStarTitle(s.name)&&(!q||String(s.name).toLowerCase().includes(q)||String(s.id).toLowerCase().includes(q))&&(type==='all'||s.type===type)&&(source==='all'||s.source===source)).sort((a,b)=>Number(hasPhotoHint(b))-Number(hasPhotoHint(a))||String(a.name).localeCompare(String(b.name)));}
function validStrainDescription(value){
 const s=String(value||'').trim();
 if(!s)return '';
 if(/@font-face|font-family\s*:|\{\s*(src|font|color|margin|padding)\s*:|url\(\s*['"]?\/?static\/fonts|\.woff2?\b|<\/?(style|script)\b/i.test(s))return '';
 return s;
}
function displayValue(value){
 if(value===null||value===undefined||value==='')return '';
 if(Array.isArray(value))return value.map(displayValue).filter(Boolean).join(', ');
 if(typeof value==='object'){
  if(value.min!=null||value.max!=null){const range=[value.min,value.max].filter(x=>x!=null).join('–');return range+(value.unit?' '+value.unit:'')}
  if(value.value!=null)return String(value.value)+(value.unit?' '+value.unit:'');
  return Object.entries(value).map(([k,v])=>{const d=displayValue(v);return d?k.replace(/_/g,' ')+': '+d:''}).filter(Boolean).join(' · ');
 }
 return String(value);
}
function fact(label,value){const v=displayValue(value);if(!v)return '';return '<div class="strain-fact"><span>'+esc(label)+'</span><strong>'+esc(v)+'</strong></div>'}
function cardMarkup(s,i){return '<article class="strain-card strain-card-rich" data-card-index="'+i+'"><div class="strain-photo-wrap"><img class="strain-photo" alt="" loading="lazy" hidden><div class="strain-photo-fallback">Checking for a verified strain photo…</div></div><div class="strain-card-body"><div class="strain-meta"><span class="pill">'+esc(s.type||'Unknown')+'</span><span class="pill">'+esc(s.source||'catalog')+'</span></div><h3>'+esc(s.name)+'</h3><p class="strain-description muted">Checking source record for a strain-specific description…</p><div class="strain-facts strain-facts-primary"></div><details class="strain-extra"><summary>View all available strain information</summary><div class="strain-facts strain-facts-all"></div><p class="strain-updated muted"></p></details><div class="card-actions"><a class="btn ghost small strain-source" href="'+sourceUrl(s)+'" target="_blank" rel="noopener noreferrer">Catalog source ↗</a></div></div></article>'}
async function getProfile(s){
 if(s.profile)return s.profile;
 const key=String(s.id||s.slug||s.name);
 if(profileCache.has(key))return profileCache.get(key);
 const promise=(async()=>{const url=API_URL+'/api/strains/'+encodeURIComponent(key)+'/profile?name='+encodeURIComponent(s.name);const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('No exact source profile');return r.json()})();
 profileCache.set(key,promise);try{return await promise}catch(e){profileCache.delete(key);throw e}
}
async function enrichCard(card,s){
 try{
  const p=await getProfile(s);
  const desc=card.querySelector('.strain-description');
  desc.textContent=validStrainDescription(p.description)||'No clean, strain-specific description is published by the connected source.';
  const primary=[fact('Genetics / lineage',p.genetics),fact('THC',p.thc),fact('CBD',p.cbd),fact('Terpenes',p.terpenes)].filter(Boolean);
  card.querySelector('.strain-facts-primary').innerHTML=primary.join('');
  const all=[fact('Classification',p.type),fact('Indica share',p.indicaPercent),fact('Sativa share',p.sativaPercent),fact('Breeder',p.breeder),fact('Aliases',p.aliases),fact('Seed type',p.seedType),fact('Genetics / lineage',p.genetics),fact('THC',p.thc),fact('CBD',p.cbd),fact('Terpenes',p.terpenes),fact('Reported effects',p.effects),fact('Flavor',p.flavor),fact('Aroma',p.aroma),fact('Flowering time',p.flowering),fact('Outdoor harvest',p.outdoorHarvest),fact('Plant structure',p.plantStructure),fact('Yield',p.yield),fact('Evidence / data notes',p.evidence),fact('Published',p.publishedAt),fact('Last updated',p.updatedAt),...Object.entries(p.additionalFields||{}).map(([k,v])=>fact(k.replace(/_/g,' '),v))].filter(Boolean);
  card.querySelector('.strain-facts-all').innerHTML=all.length?all.join(''):'<p class="muted">The source has not published additional profile fields for this strain yet.</p>';
  card.querySelector('.strain-updated').textContent='Source: StrainAPI · '+(p.updatedAt?'Updated '+new Date(p.updatedAt).toLocaleDateString():'No update date supplied');
  const link=card.querySelector('.strain-source');if(p.sourceUrl){link.href=p.sourceUrl;link.textContent='Open original strain profile ↗'}
  if(p.imageUrl){const img=card.querySelector('.strain-photo');img.src=p.imageUrl;img.alt=p.imageAlt||p.name+' strain photo';img.hidden=false;const fallback=card.querySelector('.strain-photo-fallback');img.addEventListener('error',()=>{img.hidden=true;fallback.hidden=false;fallback.textContent='Source image could not be loaded.'},{once:true});fallback.hidden=true}
  else card.querySelector('.strain-photo-fallback').textContent='No verified strain photo available from source.';
 }catch(e){
  card.querySelector('.strain-description').textContent='No exact-name detailed profile is available from the connected source yet. The catalog entry remains searchable; no details have been guessed.';
  card.querySelector('.strain-photo-fallback').textContent='No verified strain photo available.';
 }
}
async function enrichVisible(rows){
 let next=0;const workers=Array.from({length:3},async()=>{while(next<rows.length){const i=next++;const card=$('#strainGrid').querySelector('[data-card-index="'+i+'"]');if(card)await enrichCard(card,rows[i]);}});
 await Promise.all(workers);
}
function render(){
 const all=filtered(),pages=Math.max(1,Math.ceil(all.length/PAGE_SIZE));page=Math.min(page,pages);
 const start=(page-1)*PAGE_SIZE,rows=all.slice(start,start+PAGE_SIZE);
 $('#resultTitle').textContent=all.length+' strains';$('#resultCount').textContent=all.length+' matches · page '+page+' of '+pages;
 $('#strainGrid').innerHTML=rows.length?rows.map(cardMarkup).join(''):'<p class="muted">No matching strains.</p>';
 const pager=[];if(page>1)pager.push('<button class="btn ghost small" data-page="'+(page-1)+'">← Previous</button>');if(page<pages)pager.push('<button class="btn small" data-page="'+(page+1)+'">Next →</button>');$('#pager').innerHTML=pager.join('');
 $('#pager').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=Number(b.dataset.page);render();window.scrollTo({top:0,behavior:'smooth'})});
 enrichVisible(rows);
}
async function load(){
 try{
  if(!API_URL)throw new Error('Verified strain API is not configured');
  const response=await fetch(API_URL+'/api/strains?limit=20000',{cache:'no-store',headers:{Accept:'application/json'}});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Verified strain data unavailable');
  catalog=Array.isArray(data.strains)?data.strains:[];
  const sf=$('#sourceFilter');
  for(const src of [...new Set(catalog.map(x=>x.source).filter(Boolean))].sort()){
   if(![...sf.options].some(o=>o.value===src)){const op=document.createElement('option');op.value=src;op.textContent=src;sf.appendChild(op)}
  }
  $('#status').textContent='Strain catalog · '+catalog.length.toLocaleString()+' records · profile details shown when available from the source';
  render();
 }catch(e){
  $('#status').textContent='Strain catalog temporarily unavailable';
  $('#strainGrid').innerHTML='<p class="muted">The strain catalog could not be loaded. Please try again shortly.</p>';
 }
}
$('#strainSearch').addEventListener('input',()=>{page=1;render()});$('#typeFilter').addEventListener('change',()=>{page=1;render()});$('#sourceFilter').addEventListener('change',()=>{page=1;render()});
$('#menuBtn').addEventListener('click',()=>$('#nav').classList.toggle('open'));$('#year').textContent=new Date().getFullYear();load();
