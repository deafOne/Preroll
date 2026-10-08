(()=>{const API=String(window.PREROLL_CONFIG?.API_URL||"").replace(/\/+$/,"");const $=s=>document.querySelector(s);const esc=s=>String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));const fmt=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?"Recent":x.toLocaleString()};let news=[],market=[],posts=[],reviews=[];
async function get(path){const r=await fetch(API+path,{cache:"no-store"});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||"Request failed");return d}
function newsRender(){const q=($("#homeSearchInput")?.value||"").toLowerCase();const list=news.filter(n=>!q||JSON.stringify(n).toLowerCase().includes(q)).slice(0,6);$("#newsGrid").innerHTML=list.length?list.map(n=>"<article class='news-card'><span class='source'>"+esc(n.source||"CANNABIS NEWS")+"</span><h3>"+esc(n.title)+"</h3><p>"+esc(n.description||"Latest cannabis coverage.")+"</p><small class='muted'>"+esc(fmt(n.publishedAt))+"</small><p><a class='btn ghost small' href='"+esc(n.url||"#")+"' target='_blank' rel='noopener noreferrer'>Read source ↗</a></p></article>").join(""):"<p class='muted'>No matching live stories.</p>"}
function marketValue(x,keys){return keys.map(k=>x?.[k]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=="")||""}
function marketRender(){
 const q=($("#marketSearch")?.value||"").toLowerCase().trim(),type=($("#marketType")?.value||"").toLowerCase(),status=($("#marketStatus")?.value||"").toLowerCase();
 const filtered=market.filter(x=>{
  const blob=JSON.stringify(x).toLowerCase(), t=marketValue(x,["license_type","license_category","type"]).toLowerCase(), s=marketValue(x,["license_status","status","current_status"]).toLowerCase();
  return (!q||blob.includes(q))&&(!type||t===type)&&(!status||s===status);
 });
 const rows=filtered.slice(0,30);
 const escText=v=>esc(v||"—");
 const cards=rows.map(x=>{
  const name=marketValue(x,["entity_name","business_name","dba","licensee_name"])||"Licensed business";
  const addr=marketValue(x,["address","location_address","street_address"]);
  const city=marketValue(x,["city","location_city"]);
  const county=marketValue(x,["county","location_county"]);
  const t=marketValue(x,["license_type","license_category","type"]);
  const s=marketValue(x,["license_status","status","current_status"]);
  const id=marketValue(x,["license_number","license_no","license_id"]);
  return "<article class='ocm-record'><div class='ocm-record-top'><span class='ocm-kicker'>OCM LICENSE</span><span class='ocm-status'>"+escText(s)+"</span></div><h3>"+escText(name)+"</h3><p class='ocm-location'>"+escText([addr,city,county].filter(Boolean).join(", "))+"</p><div class='ocm-tags'><span>"+escText(t)+"</span>"+(id?"<span>#"+escText(id)+"</span>":"")+"</div></article>";
 }).join("");
 $("#marketGrid").innerHTML=rows.length?cards:"<div class='ocm-empty'>No OCM records match these filters.</div>";
 const counts={};
 filtered.forEach(x=>{const t=marketValue(x,["license_type","license_category","type"])||"Unspecified";counts[t]=(counts[t]||0)+1});
 $("#marketBreakdown").innerHTML=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>"<div class='ocm-break'><span>"+esc(k)+"</span><strong>"+v.toLocaleString()+"</strong><i><b style='width:"+Math.min(100,(v/Math.max(1,filtered.length))*100)+"%'></b></i></div>").join("");
 $("#marketStatusText").textContent=filtered.length.toLocaleString()+" matching records • showing "+rows.length.toLocaleString();
}
function populateMarketFilters(){
 const type=$("#marketType"),status=$("#marketStatus");
 type.innerHTML="<option value=''>All license types</option>";
 status.innerHTML="<option value=''>All statuses</option>";
 const unique=(keys)=>[...new Set(market.map(x=>marketValue(x,keys)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 unique(["license_type","license_category","type"]).forEach(v=>type.insertAdjacentHTML("beforeend","<option value='"+esc(v.toLowerCase())+"'>"+esc(v)+"</option>"));
 unique(["license_status","status","current_status"]).forEach(v=>status.insertAdjacentHTML("beforeend","<option value='"+esc(v.toLowerCase())+"'>"+esc(v)+"</option>"));
}

function communityRender(){$("#forumFeed").innerHTML=posts.slice(0,6).map(p=>"<article class='post'><div class='forum-meta'><span class='pill'>"+esc(p.category)+"</span><span class='pill'>@"+esc(p.author)+"</span></div><h4>"+esc(p.title)+"</h4><p>"+esc(p.body)+"</p><div class='post-actions'><span>▲ "+(p.likes||0)+"</span><span>"+esc(fmt(p.created))+"</span></div></article>").join("")||"<p class='muted'>No discussions yet.</p>";$("#reviewFeed").innerHTML=reviews.slice(0,6).map(r=>"<article class='post'><div class='forum-meta'><span class='pill'>"+esc(r.strain)+"</span><span class='pill'>"+esc(r.author)+"</span></div><h4>"+esc(r.overall)+"/5 overall</h4><p>"+esc(r.text)+"</p><small class='muted'>Burn "+esc(r.burn)+"/5 · Flavor "+esc(r.flavor)+"/5 · Value "+esc(r.value)+" · "+esc(fmt(r.created))+"</small></article>").join("")||"<p class='muted'>No reviews yet.</p>"}
async function loadNews(){const d=await get("/api/news?latest=18");news=d.articles||[];newsRender();$("#newsCount").textContent=news.length}
async function loadMarket(){const d=await get("/api/ny/licenses");market=d.licenses||[];$("#ocmTotal").textContent=(d.count??market.length).toLocaleString();$("#marketCount").textContent=(d.activeCount??0).toLocaleString();$("#retailCount").textContent=(d.adultUseRetailCount??0).toLocaleString();$("#marketUpdated").textContent="Updated "+fmt(d.fetchedAt);$("#ocmAge").textContent=fmt(d.fetchedAt).split(",")[0];$("#marketStatusText").textContent=market.length.toLocaleString()+" records returned";populateMarketFilters();marketRender()}
async function loadCommunity(){const [p,r]=await Promise.all([get("/api/posts"),get("/api/reviews")]);posts=p||[];reviews=r||[];$("#postCount").textContent=posts.length;$("#reviewCount").textContent=reviews.length;communityRender()}
async function loadAll(){const stamp=$("#lastUpdated");stamp.textContent="Refreshing live data…";const results=await Promise.allSettled([loadNews(),loadMarket(),loadCommunity()]);const failed=results.filter(x=>x.status==="rejected").length;stamp.textContent=(failed?"Some live feeds are unavailable":"All live feeds connected")+" • checked "+new Date().toLocaleTimeString()}
$("#homeSearch")?.addEventListener("submit",e=>{e.preventDefault();newsRender();$("#news")?.scrollIntoView({behavior:"smooth"})});$("#homeSearchInput")?.addEventListener("input",newsRender);$("#marketSearch")?.addEventListener("input",marketRender);$("#marketType")?.addEventListener("change",marketRender);$("#marketStatus")?.addEventListener("change",marketRender);$("#marketRefresh")?.addEventListener("click",loadMarket);$("#refreshAll")?.addEventListener("click",loadAll);$("#menuBtn")?.addEventListener("click",()=>$("#nav")?.classList.toggle("open"));document.querySelectorAll("#nav a").forEach(a=>a.addEventListener("click",()=>$("#nav")?.classList.remove("open")));document.querySelector(".nav-dropdown-toggle")?.addEventListener("click",e=>{e.currentTarget.parentElement.classList.toggle("open");e.currentTarget.setAttribute("aria-expanded",e.currentTarget.parentElement.classList.contains("open"));});$("#year").textContent=new Date().getFullYear();loadAll();setInterval(loadAll,10*60*1000)})();