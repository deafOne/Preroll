/* Dr. Terpenstein site-wide assistant. UI-only: does not intercept page data or API requests. */
(function(){
  'use strict';
  var path=location.pathname.replace(/\\/+$/,'/');
  if(path==='/dr-terpenstein/' || path==='/dr-terpenstein/index.html') return;
  if(document.getElementById('pr-terpenstein-launcher')) return;
  var style=document.createElement('style');
  style.textContent=`
  #pr-terpenstein-launcher{position:fixed;right:18px;bottom:18px;z-index:9990;width:76px;height:76px;border:2px solid #9aff7c;border-radius:50%;background:radial-gradient(circle at 35% 25%,#315d37,#102117 70%);box-shadow:0 8px 30px #0009;display:grid;place-items:center;cursor:pointer;color:#fff;transition:transform .2s}
  #pr-terpenstein-launcher:hover{transform:translateY(-4px) scale(1.04)}
  #pr-terpenstein-launcher .pr-doc-face{font-size:39px;line-height:1}
  #pr-terpenstein-launcher .pr-doc-leaf{position:absolute;right:3px;top:-7px;font-size:22px;filter:drop-shadow(0 2px 2px #000)}
  #pr-terpenstein-launcher .pr-doc-label{position:absolute;right:84px;bottom:14px;white-space:nowrap;background:#122319;color:#dfffe0;border:1px solid #4d8256;border-radius:10px;padding:7px 10px;font:700 12px/1.2 system-ui;box-shadow:0 5px 18px #0007}
  #pr-terpenstein-panel{position:fixed;right:18px;bottom:106px;z-index:9991;width:min(420px,calc(100vw - 24px));height:min(650px,calc(100dvh - 130px));background:#0b120d;border:1px solid #4d8256;border-radius:18px;box-shadow:0 18px 65px #000b;overflow:hidden;display:none}
  #pr-terpenstein-panel.open{display:block}
  #pr-terpenstein-panel header{height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;background:#14251a;color:#e9ffe9;font:800 13px system-ui;border-bottom:1px solid #34563a}
  #pr-terpenstein-panel header button{background:none;border:0;color:#e9ffe9;font-size:24px;cursor:pointer;padding:3px 8px}
  #pr-terpenstein-panel iframe{width:100%;height:calc(100% - 48px);border:0;background:#090e0a}
  @media(max-width:520px){#pr-terpenstein-launcher{right:12px;bottom:12px;width:66px;height:66px}#pr-terpenstein-panel{right:8px;bottom:88px;width:calc(100vw - 16px);height:min(72dvh,620px)}#pr-terpenstein-launcher .pr-doc-label{display:none}}
  @media(prefers-reduced-motion:reduce){#pr-terpenstein-launcher{transition:none}}
  `;
  document.head.appendChild(style);
  var button=document.createElement('button');
  button.id='pr-terpenstein-launcher';button.type='button';button.setAttribute('aria-label','Open Dr. Terpenstein cannabis assistant');button.setAttribute('aria-expanded','false');
  button.innerHTML='<svg class="pr-doc-face" viewBox="0 0 64 64" role="img" aria-label="Dr. Terpenstein cartoon scientist"><path d="M11 58Q12 42 32 42T53 58" fill="#e8eee6" stroke="#47704d" stroke-width="2"/><path d="M23 41v-7h18v7" fill="#d99a6a"/><ellipse cx="32" cy="29" rx="19" ry="21" fill="#d99a6a" stroke="#7d4b39" stroke-width="2"/><path d="M12 23Q7 7 22 9Q24 0 34 7Q45 1 49 14Q60 12 52 27L47 18Q33 23 18 17Z" fill="#65bd55" stroke="#245d34" stroke-width="2"/><g fill="#e9fff0" stroke="#24452d" stroke-width="2"><circle cx="24" cy="29" r="7"/><circle cx="40" cy="29" r="7"/></g><path d="M31 29h2M31 39q2 3 5 0" fill="none" stroke="#714332" stroke-width="2" stroke-linecap="round"/><path d="M31 4q-5-8-1-10q8 3 1 10" fill="#a6ff78"/></svg><span class="pr-doc-label">Ask Dr. Terpenstein</span>';
  var panel=document.createElement('section');panel.id='pr-terpenstein-panel';panel.setAttribute('aria-label','Dr. Terpenstein assistant');
  panel.innerHTML='<header><span>🌿 Dr. Terpenstein · Cannabis expert</span><button type="button" aria-label="Close assistant">×</button></header><iframe title="Dr. Terpenstein cannabis education chat" loading="lazy" src="/dr-terpenstein/?embed=1"></iframe>';
  function toggle(open){panel.classList.toggle('open',open);button.setAttribute('aria-expanded',String(open));}
  button.addEventListener('click',function(){toggle(!panel.classList.contains('open'));});
  panel.querySelector('header button').addEventListener('click',function(){toggle(false);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')toggle(false);});
  document.body.appendChild(button);document.body.appendChild(panel);
})();