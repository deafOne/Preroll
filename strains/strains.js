'use strict';
const API_URL=String((window.PREROLL_CONFIG&&window.PREROLL_CONFIG.API_URL)||'').replace(/\/+$/,'');
const $=s=>document.querySelector(s),PAGE_SIZE=60;
let catalog=[],page=1;
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function sourceUrl(s){if(s.url&&/^https:\/\//i.test(s.url))return s.url;return s.source==='leafly'?'https://www.leafly.com/strains/'+encodeURIComponent(s.id):s.source==='weedmaps'?'https://weedmaps.com/strains/'+encodeURIComponent(s.id):'#'}
function filtered(){const q=$('#strainSearch').value.trim().toLowerCase(),type=$('#typeFilter').value,source=$('#sourceFilter').value;return catalog.filter(s=>(!q||String(s.name).toLowerCase().includes(q)||String(s.id).toLowerCase().includes(q))&&(type==='all'||s.type===type)&&(source==='all'||s.source===source))}
function render(){
 const all=filtered(),pages=Math.max(1,Math.ceil(all.length/PAGE_SIZE));page=Math.min(page,pages);const start=(page-1)*PAGE_SIZE,rows=all.slice(start,start+PAGE_SIZE);
 $('#resultTitle').textContent=qTitle(all.length);$('#resultCount').textContent=all.length+' matches · page '+page+' of '+pages;
 $('#strainGrid').innerHTML=rows.length?rows.map(s=>'<article class="strain-card"><div class="strain-meta"><span class="pill">'+esc(s.type||'Unknown')+'</span><span class="pill">'+esc(s.source||'catalog')+'</span></div><h3>'+esc(s.name)+'</h3><p class="muted">Catalog entry. Detailed chemistry and effects are displayed only when verified by Preroll.org.</p><div class="card-actions"><a class="btn ghost small" href="'+sourceUrl(s)+'" target="_blank" rel="noopener noreferrer">Source ↗</a></div></article>').join(''):'<p class="muted">No matching strains.</p>';
 const pager=[];if(page>1)pager.push('<button class="btn ghost small" data-page="'+(page-1)+'">← Previous</button>');if(page<pages)pager.push('<button class="btn small" data-page="'+(page+1)+'">Next →</button>');$('#pager').innerHTML=pager.join('');
 $('#pager').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=Number(b.dataset.page);render();window.scrollTo({top:0,behavior:'smooth'})});
}
function qTitle(n){return n+' strains'}
async function load(){
 try{
  let data=null;
  const local=await fetch('./catalog.json',{cache:'no-store'});
  if(local.ok)data=await local.json();
  if(!data&&API_URL){
   const r=await fetch(API_URL+'/api/strains?limit=20000',{cache:'no-store'});
   data=await r.json();if(!r.ok)throw new Error(data.error||'Catalog unavailable');
  }
  if(!data)throw new Error('Catalog unavailable');
  catalog=Array.isArray(data.strains)?data.strains:[];const sf=$('#sourceFilter');for(const src of [...new Set(catalog.map(x=>x.source).filter(Boolean))].sort()){if(![...sf.options].some(o=>o.value===src)){const op=document.createElement('option');op.value=src;op.textContent=src==='herbistry420'?'Herbistry420':src;sf.appendChild(op)}}
  $('#status').textContent='Catalog · '+catalog.length.toLocaleString()+' entries loaded · updated '+(data.generatedAt?new Date(data.generatedAt).toLocaleDateString():'live');
  render();
 }catch(e){
  $('#status').textContent='Catalog unavailable right now';
  $('#strainGrid').innerHTML='<p class="muted">The strain catalog is updating. Refresh shortly.</p>';
 }
}
$('#strainSearch').addEventListener('input',()=>{page=1;render()});$('#typeFilter').addEventListener('change',()=>{page=1;render()});$('#sourceFilter').addEventListener('change',()=>{page=1;render()});
$('#menuBtn').addEventListener('click',()=>$('#nav').classList.toggle('open'));$('#year').textContent=new Date().getFullYear();load();