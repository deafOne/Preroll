(()=>{
'use strict';
const API=String(window.PREROLL_CONFIG?.API_URL||'').replace(/\/+$/,'');
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmt=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?'Date unavailable':x.toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})};
let articles=[],stale=false,busy=false;
function validArticle(a){try{return a&&a.title&&a.source&&a.publishedAt&&new URL(a.url).protocol==='https:'}catch{return false}}
function render(){
 const q=($('#newsSearch').value||'').trim().toLowerCase(),source=$('#sourceFilter').value;
 const list=articles.filter(a=>(!source||a.source===source)&&(!q||[a.title,a.description,a.source].join(' ').toLowerCase().includes(q)));
 $('#resultCount').textContent=list.length+' '+(list.length===1?'story':'stories');
 $('#newsGrid').innerHTML=list.length?list.map(a=>"<article class='news-card'><div class='news-card-meta'><span class='source'>"+esc(a.source)+"</span><time datetime='"+esc(a.publishedAt)+"'>"+esc(fmt(a.publishedAt))+"</time></div><h3>"+esc(a.title)+"</h3>"+(a.description?"<p>"+esc(a.description)+"</p>":"")+"<a class='btn ghost small' href='"+esc(a.url)+"' target='_blank' rel='noopener noreferrer'>Read original report ↗</a></article>").join(''):"<p class='news-empty'>No stories match those filters. Try another search or publisher.</p>";
}
function populateSources(){
 const select=$('#sourceFilter'),chosen=select.value;
 const names=[...new Set(articles.map(a=>a.source))].sort((a,b)=>a.localeCompare(b));
 select.innerHTML="<option value=''>All publishers</option>"+names.map(n=>"<option value='"+esc(n)+"'>"+esc(n)+"</option>").join('');
 if(names.includes(chosen))select.value=chosen;
}
async function load(){
 if(busy)return;busy=true;$('#refreshNews').disabled=true;$('#newsStatus').textContent='Refreshing publisher feeds…';
 try{
  const r=await fetch(API+'/api/news?latest=18',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  const d=await r.json();if(!r.ok)throw Error(d.error||'Publisher feeds unavailable');
  articles=(Array.isArray(d.articles)?d.articles:[]).filter(validArticle);
  stale=!!d.stale;populateSources();render();
  $('#newsStatus').textContent=(stale?'Last verified snapshot · ':'Updated ')+new Date(d.updatedAt||Date.now()).toLocaleTimeString();
  const notice=$('#newsNotice');notice.hidden=!stale;notice.textContent=stale?'Live publishers could not be reached. These are the last verified stories; original publication dates remain visible.':'';
  if(!articles.length)$('#newsStatus').textContent='No current, verified stories returned';
 }catch(e){
  $('#newsGrid').innerHTML="<p class='news-empty'>Live publisher news is temporarily unavailable. No placeholder stories are shown.</p>";
  $('#newsStatus').textContent='Feed unavailable';$('#resultCount').textContent='0 stories';
 }finally{busy=false;$('#refreshNews').disabled=false}
}
$('#newsSearch').addEventListener('input',render);
$('#sourceFilter').addEventListener('change',render);
$('#refreshNews').addEventListener('click',load);
$('#menuBtn')?.addEventListener('click',()=>{const open=$('#nav')?.classList.toggle('open');$('#menuBtn')?.setAttribute('aria-expanded',String(!!open))});
document.querySelectorAll('#nav a').forEach(a=>a.addEventListener('click',()=>{$('#nav')?.classList.remove('open');$('#menuBtn')?.setAttribute('aria-expanded','false')}));
$('#year').textContent=new Date().getFullYear();
load();setInterval(load,10*60*1000);
})();