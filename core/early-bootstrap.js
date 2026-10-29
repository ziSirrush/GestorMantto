(function(){
  'use strict';
  // [Lumbre | 2026-10-29 | LUMBRE-MG | BOOTSTRAP_COMPATIBLE_CSP_V001]

  const isGitHubPages=/(^|\.)github\.io$/i.test(window.location.hostname||'');
  const installName=isGitHubPages?'BLT NOW GH':'BLT NOW';
  const manifest=document.getElementById('blt-pwa-manifest');
  const applicationName=document.getElementById('blt-pwa-application-name');
  const appleTitle=document.getElementById('blt-pwa-apple-title');
  if(manifest)manifest.setAttribute('href',isGitHubPages?'./manifest-github.json':'./manifest.json');
  if(applicationName)applicationName.setAttribute('content',installName);
  if(appleTitle)appleTitle.setAttribute('content',installName);

  window.addEventListener('error',event=>{
    const image=event.target;
    const fallback=String(image?.dataset?.imageFallback||'');
    if(!fallback)return;
    image.style.display='none';
    if(fallback==='sibling'&&image.nextElementSibling)image.nextElementSibling.style.display='inline-flex';
    if(fallback==='nori')image.parentElement?.classList.add('panda-fallback');
  },true);
})();
