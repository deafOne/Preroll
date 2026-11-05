(function(){
  'use strict';

  // The age gate controls access to the page UI only. Public, read-only data
  // requests are started by the page's data scripts independently of this file.
  function readApproval(){
    try { if (window.localStorage && localStorage.getItem('pr_age') === 'yes') return true; } catch (e) {}
    try { if (window.sessionStorage && sessionStorage.getItem('pr_age') === 'yes') return true; } catch (e) {}
    return false;
  }

  function saveApproval(){
    try { localStorage.setItem('pr_age', 'yes'); return true; } catch (e) {}
    try { sessionStorage.setItem('pr_age', 'yes'); return true; } catch (e) {}
    return false;
  }

  function closeGate(gate){
    gate.classList.add('hidden');
    gate.setAttribute('aria-hidden', 'true');
    if ('inert' in gate) gate.inert = true;
    document.documentElement.classList.remove('age-gate-open');
    window.dispatchEvent(new CustomEvent('preroll:age-approved'));
  }

  function initAgeGate(){
    var gate = document.getElementById('ageGate');
    var yes = document.getElementById('ageYes');
    var no = document.getElementById('ageNo');
    var message = document.getElementById('ageMessage');
    if (!gate || !yes || !no) return;

    if (readApproval()) {
      closeGate(gate);
      return;
    }

    gate.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('age-gate-open');

    yes.addEventListener('click', function(){
      saveApproval();
      closeGate(gate);
    });

    no.addEventListener('click', function(){
      if (message) message.textContent = 'Sorry — this site is for adults 21+.';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAgeGate, { once: true });
  } else {
    initAgeGate();
  }
})();