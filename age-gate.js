(function(){
  'use strict';
  function initAgeGate(){
    var gate=document.getElementById('ageGate');
    var yes=document.getElementById('ageYes');
    var no=document.getElementById('ageNo');
    var message=document.getElementById('ageMessage');
    if(!gate||!yes||!no)return;
    if(window.localStorage&&localStorage.getItem('pr_age')==='yes')gate.classList.add('hidden');
    yes.addEventListener('click',function(){
      try{localStorage.setItem('pr_age','yes')}catch(e){}
      gate.classList.add('hidden');
    });
    no.addEventListener('click',function(){
      if(message)message.textContent='Sorry — this site is for adults 21+.';
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initAgeGate);
  else initAgeGate();
})();