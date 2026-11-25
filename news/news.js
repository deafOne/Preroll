(()=>{
const API=String(window.PREROLL_CONFIG?.API_URL||"").replace(/\/+$/,"");
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const fmt=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?"Date unavailable":x.toLocaleString()};
async function load(){
 const grid=$("#newsGrid");
 $("#newsStatus").textContent="Refreshing…";
 try{
  const r=await fetch(API+"/api/news?latest=18",{cache:"no-store",signal:AbortSignal.timeout(12000)});
  const d=await r.json();
  if(!r.ok)throw Error(d.error||"Unavailable");
  const articles=d.articles||[];
  const cards=articles.map(n=>"<article class='news-card'><span class='source'>"+esc(n.source||"CANNABIS NEWS")+"</span><h3>"+esc(n.title)+"</h3>"+(n.description?"<p>"+esc(n.description)+"</p>":"")+"<small class='muted'>"+esc(fmt(n.publishedAt))+"</small><p><a class='btn ghost small' href='"+esc(n.url)+"' target='_blank' rel='noopener noreferrer'>Read source ↗</a></p></article>").join("");
  const warning=d.stale?"<p class='muted'>Live publishers are temporarily unreachable. Showing the last verified stories; dates are original publication dates.</p>":"";
  grid.innerHTML=warning+(cards||"<p class='muted'>No current stories available. No placeholder stories are shown.</p>");
  $("#newsStatus").textContent=(d.stale?"Last verified feed snapshot · ":"Updated ")+new Date(d.updatedAt||Date.now()).toLocaleString();
 }catch(e){
  grid.innerHTML="<p class='muted'>Live news is temporarily unavailable. No placeholder stories are shown.</p>";
  $("#newsStatus").textContent="Feed unavailable";
 }
}
$("#refreshNews")?.addEventListener("click",load);
$("#menuBtn")?.addEventListener("click",()=>$("#nav")?.classList.toggle("open"));
document.querySelectorAll("#nav a").forEach(a=>a.addEventListener("click",()=>$("#nav")?.classList.remove("open")));
load();setInterval(load,10*60*1000);
})();