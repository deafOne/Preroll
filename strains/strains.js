'use strict';
const API_URL=String((window.PREROLL_CONFIG&&window.PREROLL_CONFIG.API_URL)||'').replace(new RegExp('/+$'),'');
const $=s=>document.querySelector(s),PAGE_SIZE=24;
let catalog=[],page=1;
const profileCache=new Map();
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function sourceUrl(s){if(s.url&&(s.url.startsWith('https://')||s.url.startsWith('http://')))return s.url;return s.source==='leafly'?'https://www.leafly.com/strains/'+encodeURIComponent(s.id):s.source==='weedmaps'?'https://weedmaps.com/strains/'+encodeURIComponent(s.id):'#'}
function filtered(){const q=$('#strainSearch').value.trim().toLowerCase(),type=$('#typeFilter').value,source=$('#sourceFilter').value;return catalog.filter(s=>(!q||String(s.name).toLowerCase().includes(q)||String(s.id).toLowerCase().includes(q))&&(type==='all'||s.type===type)&&(source==='all'||s.source===source))}
function fact(label,value){if(value===null||value===undefined||value===''||(Array.isArray(value)&&!value.length))return '';let v=Array.isArray(value)?value.map(x=>typeof x==='string'?x:(x.name||x.value||'')).filter(Boolean).join(', '):typeof value==='object'?[value.min!=null?value.min:null,value.max!=null?value.max:null].filter(x=>x!==null).join('–')||value.value||value.name||'':String(value);if(!v)return '';return '<div class="strain-fact"><span>'+esc(label)+'</span><strong>'+esc(v)+'</strong></div>'}
function cardMarkup(s,i){return '<article class="strain-card strain-card-rich" data-card-index="'+i+'"><div class="strain-photo-wrap"><img class="strain-photo" alt="" loading="lazy" hidden><div class="strain-photo-fallback">Checking for a verified strain photo…</div></div><div class="strain-card-body"><div class="strain-meta"><span class="pill">'+esc(s.type||'Unknown')+'</span><span class="pill">'+esc(s.source||'catalog')+'</span></div><h3>'+esc(s.name)+'</h3><p class="strain-description muted">Checking source record for a strain-specific description…</p><div class="strain-facts"></div><div class="card-actions"><a class="btn ghost small strain-source" href="'+sourceUrl(s)+'" target="_blank" rel="noopener noreferrer">Catalog source ↗</a></div></div></article>'}
async function getProfile(s){
 const key=String(s.id||s.slug||s.name);
 if(profileCache.has(key))return profileCache.get(key);
 const promise=(async()=>{const url=API_URL+'/api/strains/'+encodeURIComponent(key)+'/profile?name='+encodeURIComponent(s.name);const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('No exact source profile');return r.json()})();
 profileCache.set(key,promise);try{return await promise}catch(e){profileCache.delete(key);throw e}
}
async function enrichCard(card,s){
 try{
  const p=await getProfile(s);
  const desc=card.querySelector('.strain-description');
  desc.textContent=p.description||'No strain-specific description is published by the connected source.';
  const facts=[fact('Genetics',p.genetics),fact('Breeder',p.breeder),fact('THC',p.thc),fact('CBD',p.cbd),fact('Terpenes',p.terpenes),fact('Effects reported',p.effects),fact('Flavor',p.flavor),fact('Aroma',p.aroma)].filter(Boolean);
  card.querySelector('.strain-facts').innerHTML=facts.join('');
  const link=card.querySelector('.strain-source');if(p.sourceUrl){link.href=p.sourceUrl;link.textContent='Strain profile source ↗'}
  if(p.imageUrl){const img=card.querySelector('.strain-photo');img.src=p.imageUrl;img.alt=p.imageAlt||p.name+' strain photo';img.hidden=false;const fallback=card.querySelector('.strain-photo-fallback');img.addEventListener('error',()=>{img.hidden=true;fallback.hidden=false;fallback.textContent='Source image could not be loaded.'},{once:true});fallback.hidden=true}
  else card.querySelector('.strain-photo-fallback').textContent='No verified strain photo available from source.';
 }catch(e){
  card.querySelector('.strain-description').textContent='No exact-name source profile is available yet. No description has been substituted.';
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
  let data=null;
  const local=await fetch('./catalog.json',{cache:'no-store'});if(local.ok)data=await local.json();
  if(!data&&API_URL){const r=await fetch(API_URL+'/api/strains?limit=20000',{cache:'no-store'});data=await r.json();if(!r.ok)throw new Error(data.error||'Catalog unavailable')}
  if(!data)throw new Error('Catalog unavailable');
  catalog=Array.isArray(data.strains)?data.strains:[];
  const sf=$('#sourceFilter');for(const src of [...new Set(catalog.map(x=>x.source).filter(Boolean))].sort()){if(![...sf.options].some(o=>o.value===src)){const op=document.createElement('option');op.value=src;op.textContent=src==='herbistry420'?'Herbistry420':src;sf.appendChild(op)}}
  $('#status').textContent='Catalog · '+catalog.length.toLocaleString()+' entries · strain-specific photos and descriptions load from source records';
  render();
 }catch(e){$('#status').textContent='Catalog unavailable right now';$('#strainGrid').innerHTML='<p class="muted">The strain catalog is updating. Refresh shortly.</p>'}
}
$('#strainSearch').addEventListener('input',()=>{page=1;render()});$('#typeFilter').addEventListener('change',()=>{page=1;render()});$('#sourceFilter').addEventListener('change',()=>{page=1;render()});
$('#menuBtn').addEventListener('click',()=>$('#nav').classList.toggle('open'));$('#year').textContent=new Date().getFullYear();load();
