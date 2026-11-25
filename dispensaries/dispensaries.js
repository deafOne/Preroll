(()=>{'use strict';
const API=String(window.PREROLL_CONFIG?.API_URL||'').replace(/\/+$/,'');
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=v=>{try{const u=new URL(String(v));return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}};
let rows=[],timer;
async function load(){
 $('dirGrid').innerHTML='<div class="dir-empty">Loading current OCM records…</div>';
 $('dirCount').textContent='Checking New York State Open Data…';
 try{
  const r=await fetch(API+'/api/dispensaries',{cache:'no-store',signal:AbortSignal.timeout(18000)});
  const d=await r.json();if(!r.ok)throw Error(d.error||'Unable to load the directory');
  rows=Array.isArray(d.dispensaries)?d.dispensaries:[];
  const county=$('dirCounty'),selected=county.value;
  county.innerHTML='<option value="">All New York counties</option>'+(d.counties||[]).map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');
  county.value=selected;
  render();
  $('dirCount').textContent=Number(d.total||0).toLocaleString()+' active adult-use retail dispensary records shown · source checked '+new Date(d.fetchedAt||Date.now()).toLocaleString();
 }catch(e){$('dirGrid').innerHTML='<div class="dir-empty">The live OCM feed is temporarily unavailable. Try refreshing in a moment.</div>';$('dirCount').textContent='Live source unavailable';}
}
function render(){
 const q=$('dirSearch').value.trim().toLowerCase(),county=$('dirCounty').value.toLowerCase();
 const list=rows.filter(x=>(!county||String(x.county||'').toLowerCase()===county)&&(!q||[x.name,x.address,x.city,x.county,x.licenseNumber].join(' ').toLowerCase().includes(q)));
 $('dirGrid').innerHTML=list.length?list.map(x=>{
  const place=[x.address,x.city,x.county,x.state,x.zip].filter(Boolean).join(', ');
  const map='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(place||x.name);
  const web=safeUrl(x.website);
  return '<article class="dir-card"><div class="dir-top"><span class="dir-tag">OFFICIAL OCM RECORD</span><span class="dir-status">'+esc(x.status||'Active')+'</span></div><h2>'+esc(x.name)+'</h2><p class="dir-address">'+esc(place||'Address not published in source')+'</p><div class="dir-meta"><span>'+esc(x.licenseType||'Adult-use retail')+'</span><span>License '+esc(x.licenseNumber)+'</span></div><div class="dir-actions"><a class="btn ghost small" href="'+map+'" target="_blank" rel="noopener noreferrer">Directions ↗</a>'+(x.phone?'<a class="btn ghost small" href="tel:'+esc(x.phone.replace(/[^+0-9]/g,''))+'">Call</a>':'')+(web?'<a class="btn ghost small" href="'+esc(web)+'" target="_blank" rel="noopener noreferrer">Website ↗</a>':'')+'</div></article>';
 }).join(''):'<div class="dir-empty">No active dispensaries match this search.</div>';
 $('dirCount').textContent=list.length.toLocaleString()+' matching active adult-use retail dispensary records';
}
$('dirSearch').addEventListener('input',render);$('dirCounty').addEventListener('change',render);$('dirRefresh').addEventListener('click',load);
$('claimForm').addEventListener('submit',async e=>{
 e.preventDefault();const button=$('claimSubmit'),status=$('claimStatus');button.disabled=true;button.textContent='Submitting…';status.textContent='';
 try{const data=Object.fromEntries(new FormData(e.currentTarget).entries());const r=await fetch(API+'/api/dispensaries/claims',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),credentials:'omit'});const d=await r.json();if(!r.ok)throw Error(d.error||'Claim request failed');e.currentTarget.reset();status.textContent='Claim request received. The license number matched the active OCM dataset; ownership verification is still pending.';}
 catch(err){status.textContent=err.message||'Unable to submit your claim. Please try again.';status.style.color='#ff9a86'}
 finally{button.disabled=false;button.textContent='Submit listing claim'}
});
$('year').textContent=new Date().getFullYear();$('menuBtn')?.addEventListener('click',()=>$('nav')?.classList.toggle('open'));document.querySelectorAll('#nav a').forEach(a=>a.addEventListener('click',()=>$('nav')?.classList.remove('open')));document.querySelector('.nav-dropdown-toggle')?.addEventListener('click',e=>{e.currentTarget.parentElement.classList.toggle('open');e.currentTarget.setAttribute('aria-expanded',e.currentTarget.parentElement.classList.contains('open'))});load();timer=setInterval(load,10*60*1000);
})();