(()=>{
'use strict';
const API=String(window.PREROLL_CONFIG?.API_URL||'').replace(/\/+$/,'');
const $=s=>document.querySelector(s);
const canvas=$('#anonymousCanvas');
const form=$('#anonymousTagForm');
const message=$('#anonymousMessage');
const colors=['moss','cream','ember','lavender','sky','rose'];
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const dateText=d=>{const x=new Date(Number(d));return Number.isNaN(x.getTime())?'Recently':x.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})};
function render(tags){
 canvas.replaceChildren();
 if(!tags.length){const empty=document.createElement('p');empty.className='ca-empty';empty.textContent='The canvas is waiting. Leave the first note.';canvas.append(empty)}
 tags.forEach(tag=>{
  const card=document.createElement('article');card.className='ca-tag '+(colors.includes(tag.color)?tag.color:'moss');
  const note=document.createElement('p');note.textContent=tag.message;
  const time=document.createElement('small');time.textContent=dateText(tag.created);
  card.append(note,time);canvas.append(card);
 });
 $('#canvasCount').textContent=tags.length+' '+(tags.length===1?'note':'notes')+' on the wall';
}
async function load(){
 try{
  const r=await fetch(API+'/api/cannabis-anonymous/tags',{cache:'no-store',signal:AbortSignal.timeout(12000)});
  const d=await r.json();if(!r.ok)throw Error(d.error||'Canvas unavailable');
  render(Array.isArray(d.tags)?d.tags:[]);
 }catch(e){canvas.innerHTML='';const p=document.createElement('p');p.className='ca-empty';p.textContent='The canvas is temporarily unavailable. Try refreshing in a moment.';canvas.append(p);$('#canvasCount').textContent='Connection unavailable'}
}
message.addEventListener('input',()=>$('#characterCount').textContent=message.value.length+' / 240');
form.addEventListener('submit',async e=>{
 e.preventDefault();const text=message.value.trim();if(!text)return;
 const submit=$('#submitAnonymousTag');submit.disabled=true;submit.textContent='Adding…';$('#anonymousTagStatus').textContent='';
 const color=document.querySelector('input[name="tagColor"]:checked')?.value||'moss';
 try{
  const r=await fetch(API+'/api/cannabis-anonymous/tags',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,color}),signal:AbortSignal.timeout(12000)});
  const d=await r.json();if(!r.ok)throw Error(d.error||'Could not add note');
  message.value='';$('#characterCount').textContent='0 / 240';$('#anonymousTagStatus').textContent='Your note is on the wall.';await load();$('#anonymousCanvas').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(err){$('#anonymousTagStatus').textContent=err.message||'Could not add note. Please try again.'}
 finally{submit.disabled=false;submit.textContent='Add to the canvas ↗'}
});
$('#menuBtn')?.addEventListener('click',()=>{const open=$('#nav')?.classList.toggle('open');$('#menuBtn')?.setAttribute('aria-expanded',String(!!open))});
document.querySelectorAll('#nav a').forEach(a=>a.addEventListener('click',()=>$('#nav')?.classList.remove('open')));
$('#year').textContent=new Date().getFullYear();
load();setInterval(load,60000);
})();