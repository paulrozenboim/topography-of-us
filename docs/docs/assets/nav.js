/* ============================================================
   Shared quick-nav — a small always-present handle at the top edge; tapping or
   clicking it reveals links to the other pages (plus, on pages that pass them,
   page-specific actions like Projection's Fit/Theme). It auto-closes on its own
   after a few seconds, or immediately on Escape / a click elsewhere — it never
   reveals itself from general page activity, so it doesn't fight with drawing
   a path on the tablet or dragging to pan the projection.
   ============================================================ */
"use strict";
function initQuickNav({current, actions=[]}={}){
  const PAGES=[
    ["index.html","Home","index"],
    ["tablet.html","Cast Path","tablet"],
    ["projection.html","Projection","projection"],
    ["settings.html","Settings","settings"],
    ["archive.html","Archive","archive"]
  ];
  const handle=document.createElement("button");
  handle.className="nav-handle"; handle.type="button";
  handle.setAttribute("aria-label","Open menu"); handle.setAttribute("aria-expanded","false");

  const bar=document.createElement("nav"); bar.className="quicknav";
  PAGES.forEach(([href,label,role])=>{
    const a=document.createElement("a"); a.href=href; a.textContent=label;
    if(role===current) a.className="current";
    bar.appendChild(a);
  });
  if(actions.length){
    const divider=document.createElement("span"); divider.className="nav-div"; bar.appendChild(divider);
    actions.forEach(({label,onClick})=>{
      const b=document.createElement("button"); b.type="button"; b.textContent=label;
      b.addEventListener("click", onClick);
      bar.appendChild(b);
    });
  }
  document.body.appendChild(handle);
  document.body.appendChild(bar);

  let hideTimer=null;
  function open(){
    bar.classList.add("on"); handle.setAttribute("aria-expanded","true");
    clearTimeout(hideTimer); hideTimer=setTimeout(close, 4000);
  }
  function close(){ bar.classList.remove("on"); handle.setAttribute("aria-expanded","false") }
  function toggle(){ bar.classList.contains("on") ? close() : open() }

  handle.addEventListener("click", toggle);
  bar.addEventListener("pointerenter", ()=>clearTimeout(hideTimer));
  bar.addEventListener("pointerleave", ()=>{ hideTimer=setTimeout(close, 1200) });
  bar.addEventListener("click", ()=>{ clearTimeout(hideTimer); hideTimer=setTimeout(close, 900) });
  document.addEventListener("keydown", e=>{
    if(e.key==="Escape") close();
    if(e.key==="m" && !bar.classList.contains("on")) open();
  });
  document.addEventListener("pointerdown", e=>{
    if(bar.classList.contains("on") && !bar.contains(e.target) && e.target!==handle) close();
  });
  return {open, close};
}
