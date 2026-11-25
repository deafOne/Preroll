'use strict';
(function(){
  const API='https://commons.wikimedia.org/w/api.php';
  const memory=new Map();
  const usedGuideFiles=new Set();
  const esc=s=>String(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const plain=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim();
  const norm=s=>plain(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function searchUrl(query){return 'https://commons.wikimedia.org/w/index.php?search='+encodeURIComponent(query)+'&title=Special:MediaSearch&type=image';}
  async function search(query){
    const key=norm(query);
    if(memory.has(key))return memory.get(key);
    try{
      const params=new URLSearchParams({action:'query',generator:'search',gsrsearch:'filetype:bitmap '+query,gsrnamespace:'6',gsrlimit:'12',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'1000',format:'json',origin:'*',maxlag:'5'});
      const response=await fetch(API+'?'+params.toString(),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error('Commons HTTP '+response.status);
      const data=await response.json();
      const pages=Object.values(data.query?.pages||{}).map(page=>{
        const info=page.imageinfo?.[0]||{},meta=info.extmetadata||{};
        const artist=plain(meta.Artist?.value||meta.Credit?.value||'');
        const license=plain(meta.LicenseShortName?.value||meta.UsageTerms?.value||'License details on source page');
        return {title:page.title||'',url:info.thumburl||info.url||'',pageUrl:info.descriptionurl||'',artist,license,description:plain(meta.ImageDescription?.value||'')};
      }).filter(x=>x.url&&x.pageUrl);
      memory.set(key,pages);
      return pages;
    }catch(error){return [];}
  }
  function attribution(item){
    const by=item.artist?' · '+esc(item.artist):'';
    const license=item.license?' · '+esc(item.license):'';
    return '<p class="commons-attribution">Image: <a href="'+esc(item.pageUrl)+'" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>'+by+license+'</p>';
  }
  async function loadStrainImage(name,wrap){
    if(!wrap)return;
    const clean=plain(name);
    const link=searchUrl('"'+clean+'" cannabis strain');
    wrap.innerHTML='<div class="strain-photo-fallback">Searching for an exact-name strain photo…</div>';
    const candidates=await search('"'+clean+'"');
    const needle=norm(clean);
    const match=candidates.find(item=>{
      const title=norm(item.title),description=norm(item.description);
      return title.includes(needle)||description.includes(needle);
    });
    if(!match){
      wrap.innerHTML='<div class="strain-photo-fallback">No exact-name photo verified yet.<br><a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Search photos for '+esc(clean)+' ↗</a></div>';
      return;
    }
    wrap.innerHTML='<img class="strain-photo" src="'+esc(match.url)+'" alt="'+esc(clean)+' — image record matched by strain name" loading="lazy" decoding="async"><div class="commons-attribution">'+attribution(match)+'</div>';
    const img=wrap.querySelector('img');
    img.addEventListener('error',()=>{wrap.innerHTML='<div class="strain-photo-fallback">Image unavailable.<br><a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Open strain image search ↗</a></div>'},{once:true});
  }
  function guideMarkup(guide){
    const title=plain(guide.title).replace(/^Image Not Found\s*/i,'');
    const query=(title+' cannabis '+(guide.category||'')).trim();
    return '<div class="guide-image-slot" data-commons-guide data-title="'+esc(title)+'" data-category="'+esc(guide.category||'')+'"><a class="guide-image-search" href="'+esc(searchUrl(query))+'" target="_blank" rel="noopener noreferrer">Find a licensed image for this guide ↗</a></div>';
  }
  async function loadGuideSlot(slot){
    if(slot.dataset.loaded==='1')return;
    slot.dataset.loaded='1';
    const title=slot.dataset.title||'',category=slot.dataset.category||'';
    const candidates=await search((title+' cannabis '+category).trim());
    const match=candidates.find(item=>!usedGuideFiles.has(item.pageUrl)&&!/(logo|icon|flag|map|screenshot|diagram of website)/i.test(item.title));
    if(!match)return;
    usedGuideFiles.add(match.pageUrl);
    slot.innerHTML='<img class="guide-stock-image" src="'+esc(match.url)+'" alt="'+esc(title)+' — topic-relevant image" loading="lazy" decoding="async">'+attribution(match)+'<a class="guide-image-search" href="'+esc(searchUrl(title+' cannabis '+category))+'" target="_blank" rel="noopener noreferrer">More licensed image results ↗</a>';
    const img=slot.querySelector('img');
    img.addEventListener('error',()=>{slot.innerHTML='<a class="guide-image-search" href="'+esc(searchUrl(title+' cannabis '+category))+'" target="_blank" rel="noopener noreferrer">Find a licensed image for this guide ↗</a>'},{once:true});
  }
  function observeGuideImages(root){
    const slots=[...(root||document).querySelectorAll('[data-commons-guide]')];
    if(!('IntersectionObserver' in window)){slots.slice(0,12).forEach(loadGuideSlot);return;}
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){observer.unobserve(entry.target);loadGuideSlot(entry.target);}
      });
    },{rootMargin:'250px'});
    slots.forEach(slot=>observer.observe(slot));
  }
  window.PrerollCommons={searchUrl,loadStrainImage,guideMarkup,observeGuideImages};
})();