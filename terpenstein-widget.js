/* Dr. Terpenstein — animated inline consultation assistant. */
(function(){
'use strict';
var path=location.pathname.replace(/\/+$/,'/');
if(path==='/dr-terpenstein/'||path==='/dr-terpenstein/index.html'||document.getElementById('pr-terpenstein-launcher'))return;
var style=document.createElement('style');
style.textContent=\`
#pr-terpenstein-launcher{position:fixed!important;right:18px!important;bottom:calc(18px + env(safe-area-inset-bottom,0px))!important;z-index:2147483000!important;width:76px!important;height:76px!important;border:2px solid #9aff7c!important;border-radius:50%!important;background:radial-gradient(circle at 35% 25%,#315d37,#102117 70%)!important;box-shadow:0 8px 30px #0009!important;display:grid!important;place-items:center!important;cursor:pointer;color:#fff;transition:transform .2s;touch-action:manipulation}
#pr-terpenstein-launcher:hover{transform:translateY(-4px) scale(1.04)}
#pr-terpenstein-launcher .pr-doc-face{width:54px;height:54px;overflow:visible;animation:prDocBob 4.5s ease-in-out infinite;transform-origin:50% 90%}
#pr-terpenstein-launcher .pr-eye{transform-box:fill-box;transform-origin:center;animation:prDocBlink 6s infinite}
#pr-terpenstein-launcher .pr-leaf{transform-box:fill-box;transform-origin:50% 100%;animation:prLeafSway 4s ease-in-out infinite}
#pr-terpenstein-launcher .pr-doc-label{position:absolute;right:84px;bottom:14px;white-space:nowrap;background:#122319;color:#dfffe0;border:1px solid #4d8256;border-radius:10px;padding:7px 10px;font:700 12px/1.2 system-ui;box-shadow:0 5px 18px #0007}
@keyframes prDocBob{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-3px) rotate(1deg)}}
@keyframes prDocBlink{0%,45%,48%,100%{transform:scaleY(1)}46%,47%{transform:scaleY(.08)}}
@keyframes prLeafSway{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(7deg)}}
#pr-terpenstein-panel{position:fixed!important;right:18px!important;bottom:calc(106px + env(safe-area-inset-bottom,0px))!important;z-index:2147483001!important;width:min(410px,calc(100vw - 24px));height:min(620px,calc(100dvh - 130px));background:#0b120d;border:1px solid #4d8256;border-radius:20px;box-shadow:0 18px 65px #000b;overflow:hidden;display:none;color:#e9f2e9;font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
#pr-terpenstein-panel.open{display:flex;flex-direction:column;animation:prPanelIn .2s ease-out}
@keyframes prPanelIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
#pr-terpenstein-panel .pr-head{flex:none;display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(110deg,#193522,#102117);border-bottom:1px solid #34563a}
#pr-terpenstein-panel .pr-avatar{width:40px;height:40px;flex:none;border-radius:50%;display:grid;place-items:center;background:#24482c;border:1px solid #75c86a;font-size:25px}
#pr-terpenstein-panel .pr-headcopy{min-width:0;flex:1}
#pr-terpenstein-panel .pr-headcopy strong{display:block;font-size:14px}
#pr-terpenstein-panel .pr-status{font-size:11px;color:#a7d99a}
#pr-terpenstein-panel .pr-close{background:none;border:0;color:#e9ffe9;font-size:25px;cursor:pointer;padding:2px 7px}
#pr-terpenstein-panel .pr-intro{padding:13px 15px 9px;color:#c9d8ca;font-size:12px}
#pr-terpenstein-panel .pr-intro strong{color:#b7f69b}
#pr-terpenstein-panel .pr-prompts{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px}
#pr-terpenstein-panel .pr-prompt{border:1px solid #3d6544;border-radius:999px;background:#15251a;color:#dfffe0;padding:7px 10px;font:600 11px system-ui;cursor:pointer}
#pr-terpenstein-panel .pr-prompt:hover{border-color:#a6f28c}
#pr-terpenstein-panel .pr-messages{flex:1;min-height:0;overflow:auto;padding:10px 14px 14px;display:flex;flex-direction:column;gap:9px;scroll-behavior:smooth}
#pr-terpenstein-panel .pr-msg{max-width:91%;padding:10px 12px;border-radius:15px;background:#1c2a20;color:#e6eee6;white-space:pre-wrap;overflow-wrap:anywhere}
#pr-terpenstein-panel .pr-msg.doc{align-self:flex-start;border:1px solid #345139;border-bottom-left-radius:4px}
#pr-terpenstein-panel .pr-msg.user{align-self:flex-end;background:#b8f69b;color:#102010;border-bottom-right-radius:4px}
#pr-terpenstein-panel .pr-msg small{display:block;font-weight:800;font-size:10px;letter-spacing:.06em;color:#9aff7c;margin-bottom:3px}
#pr-terpenstein-panel .pr-msg.user small{color:#31552c}
#pr-terpenstein-panel .pr-compose{flex:none;display:flex;gap:8px;padding:11px;border-top:1px solid #304235;background:#101711}
#pr-terpenstein-panel .pr-compose input{min-width:0;flex:1;background:#080d09;border:1px solid #405342;border-radius:12px;color:white;padding:12px;font:14px system-ui;outline:none}
#pr-terpenstein-panel .pr-compose input:focus{border-color:#9aff7c}
#pr-terpenstein-panel .pr-compose button{border:0;border-radius:11px;background:#a9ef91;color:#102010;font-weight:800;padding:0 14px;cursor:pointer}
#pr-terpenstein-panel .pr-foot{flex:none;text-align:center;padding:0 10px 9px;background:#101711;color:#91a394;font-size:10px}
@media(max-width:768px){#pr-terpenstein-launcher{right:12px!important;bottom:calc(12px + env(safe-area-inset-bottom,0px))!important;width:68px!important;height:68px!important}#pr-terpenstein-panel{right:8px!important;bottom:calc(88px + env(safe-area-inset-bottom,0px))!important;width:calc(100vw - 16px)!important;height:min(76dvh,640px)!important;max-height:calc(100dvh - 112px - env(safe-area-inset-bottom,0px))!important;border-radius:17px!important}#pr-terpenstein-launcher .pr-doc-label{display:none}}
@media(prefers-reduced-motion:reduce){#pr-terpenstein-launcher .pr-doc-face,#pr-terpenstein-launcher .pr-eye,#pr-terpenstein-launcher .pr-leaf,#pr-terpenstein-panel.open{animation:none!important;transition:none!important}}
\`;
document.head.appendChild(style);
var button=document.createElement('button');
button.id='pr-terpenstein-launcher';button.type='button';button.setAttribute('aria-label','Consult Dr. Terpenstein');button.setAttribute('aria-expanded','false');
button.innerHTML='<svg class="pr-doc-face" viewBox="0 0 64 64" role="img" aria-label="Animated cartoon Dr. Terpenstein"><path d="M11 58Q12 42 32 42T53 58" fill="#e8eee6" stroke="#47704d" stroke-width="2"/><path d="M23 41v-7h18v7" fill="#d99a6a"/><ellipse cx="32" cy="29" rx="19" ry="21" fill="#d99a6a" stroke="#7d4b39" stroke-width="2"/><path d="M12 23Q7 7 22 9Q24 0 34 7Q45 1 49 14Q60 12 52 27L47 18Q33 23 18 17Z" fill="#65bd55" stroke="#245d34" stroke-width="2"/><g class="pr-eye" fill="#e9fff0" stroke="#24452d" stroke-width="2"><circle cx="24" cy="29" r="7"/><circle cx="40" cy="29" r="7"/></g><path d="M31 29h2M31 39q2 3 5 0" fill="none" stroke="#714332" stroke-width="2" stroke-linecap="round"/><path class="pr-leaf" d="M31 4q-5-8-1-10q8 3 1 10" fill="#a6ff78"/></svg><span class="pr-doc-label">Consult Dr. Terpenstein</span>';
var panel=document.createElement('section');
panel.id='pr-terpenstein-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-label','Private consultation with Dr. Terpenstein');
panel.innerHTML='<div class="pr-head"><div class="pr-avatar" aria-hidden="true">🧑‍🔬</div><div class="pr-headcopy"><strong>Dr. Terpenstein</strong><div class="pr-status">● In the lab · Ready to consult</div></div><button class="pr-close" type="button" aria-label="Close consultation">×</button></div><div class="pr-intro"><strong>Welcome to my consultation room.</strong> Tell me what you want to understand. We can take it one question at a time.</div><div class="pr-prompts"><button class="pr-prompt" data-q="What are terpenes?">Terpenes</button><button class="pr-prompt" data-q="Help me read THC and CBD on a product label.">THC / CBD</button><button class="pr-prompt" data-q="How do strain genetics and lineage work?">Genetics</button><button class="pr-prompt" data-q="How do I evaluate a pre-roll label?">Pre-roll labels</button></div><div class="pr-messages" aria-live="polite"><div class="pr-msg doc"><small>DR. TERPENSTEIN</small>Good to see you. What are we investigating today?</div></div><form class="pr-compose"><input maxlength="300" autocomplete="off" aria-label="Your question for Dr. Terpenstein" placeholder="Ask me anything about cannabis…"><button type="submit">Send</button></form><div class="pr-foot">Educational information only · No diagnosis or medical advice</div>';
var messages=panel.querySelector('.pr-messages'),input=panel.querySelector('input');
function addMessage(who,txt){var el=document.createElement('div'),label=document.createElement('small');el.className='pr-msg '+who;label.textContent=who==='user'?'YOU':'DR. TERPENSTEIN';el.appendChild(label);el.appendChild(document.createTextNode(txt));messages.appendChild(el);messages.scrollTop=messages.scrollHeight;}
var answers=[
{keys:['terpene','terpenes'],text:'Terpenes are aromatic compounds made by many plants, including cannabis. They contribute to aroma and flavor. Common examples include myrcene (earthy), limonene (citrus), beta-caryophyllene (peppery), pinene (pine-like) and linalool (floral). A terpene profile describes reported chemistry; it does not guarantee a particular effect.'},
{keys:['myrcene','limonene','caryophyllene','pinene','linalool','terpinolene','humulene','ocimene'],text:'A few common aroma notes: myrcene is often earthy or musky; limonene, citrus; beta-caryophyllene, peppery or woody; pinene, pine-like; linalool, floral; humulene, hoppy or woody. These are sensory descriptors, not medical claims or reliable predictions of how someone will feel.'},
{keys:['thc','cbd','cannabinoid','potency','percentage','percent'],text:'THC and CBD are cannabinoids. When reading a label, check whether the number is a percentage by weight or a total amount in milligrams, whether it applies to the whole package or a serving, and whether it comes from a batch-specific lab result. A strain-wide figure is not a substitute for testing the actual product batch.'},
{keys:['indica','sativa','hybrid'],text:'Indica, sativa and hybrid are broad market classifications. They can help organize catalogs, but they do not reliably predict an individual experience. Compare the specific cultivar or breeder version, available chemistry, terpene data and product-batch lab results.'},
{keys:['genetic','lineage','parent','cross','breeder'],text:'Genetics or lineage describes reported parent cultivars and cross history. Strain names are not globally standardized: different breeders may use the same name for different crosses. Compare breeder, parentage and source records instead of assuming every listing with the same name is identical.'},
{keys:['pre-roll','preroll','label','package','packaging'],text:'When reviewing a pre-roll label, look for product identity and net contents, licensee or producer details, batch/lot identifier, required warnings and symbols, cannabinoid information where applicable, and jurisdiction-specific compliance details. Exact requirements depend on the state and product category; consult the current regulator rules.'},
{keys:['flowering','yield','grow','cultivation','harvest','plant structure','seed'],text:'Grow fields such as flowering time, yield, seed type, plant structure and harvest windows are usually breeder- or phenotype-specific estimates, not guarantees. Conditions, phenotype, environment and grow method can change the result.'},
{keys:['effect','effects','feel','sleep','pain','anxiety','medical','health'],text:'Reported effects describe experiences people share; they are not guaranteed outcomes or medical advice. Individual responses vary, and a strain name or terpene profile cannot diagnose or treat a condition. For health questions, consult a qualified clinician.'},
{keys:['aroma','smell','flavor','taste'],text:'Aroma is what you smell; flavor is what you taste. These sensory notes can vary by phenotype, curing, storage and source, so keep the source attribution attached when comparing descriptions.'},
{keys:['legal','ocm','new york','ny'],text:'For New York cannabis rules, rely on the New York Office of Cannabis Management and current state regulations. Requirements can change and differ by product type. This consultation is educational, not legal or compliance advice.'}
];
function answer(q){var s=q.toLowerCase(),hit=answers.find(function(a){return a.keys.some(function(k){return s.indexOf(k)!==-1;});});return hit?hit.text:'I can help explain cannabis terminology, terpene families, cannabinoids, strain classifications, genetics, cultivation terms and product labels. Tell me the specific term, product detail or strain name you are looking at, and I will help break it down. For strain-specific numbers, we should verify the breeder and source rather than guess.';}
function ask(q){var clean=String(q||'').trim();if(!clean)return;addMessage('user',clean);addMessage('doc',answer(clean));}
function toggle(open){panel.classList.toggle('open',open);button.setAttribute('aria-expanded',String(open));if(open)window.setTimeout(function(){input.focus();},80);}
button.addEventListener('click',function(){toggle(!panel.classList.contains('open'));});
panel.querySelector('.pr-close').addEventListener('click',function(){toggle(false);button.focus();});
panel.querySelector('form').addEventListener('submit',function(e){e.preventDefault();ask(input.value);input.value='';input.focus();});
panel.querySelectorAll('[data-q]').forEach(function(b){b.addEventListener('click',function(){ask(b.getAttribute('data-q'));});});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&panel.classList.contains('open'))toggle(false);});
document.body.appendChild(button);document.body.appendChild(panel);
})();