/* ============================================================
   THE TOPOGRAPHY OF US — store & sync
   Store holds all state. Sync is the transport underneath it — swappable without
   touching Store or any page logic. See README "Making this real" for wiring in a
   real-time backend so separate devices (not just separate tabs) stay in sync.
   ============================================================ */
"use strict";

const uid = ()=> Math.random().toString(36).slice(2,9);

/* ---------------- Sync transport -----------------------------------------
   LOCAL MODE (default, zero config): BroadcastChannel keeps every open tab on this
   ONE device in sync — exactly how you've been testing so far (tablet + projection
   open side by side, or in two windows). It does NOT reach other devices: a phone
   and a laptop each get their own isolated copy. Fine for rehearsal on one machine;
   not sufficient for a real tablet-plus-projector setup on two devices.

   REMOTE MODE: wire in window.TOPO_REMOTE = { send(msg), subscribe(fn) } from a
   small config script (see firebase-config.example.js) to sync across real devices.
   Everything above this line — Store, MapView, both bulletin logic — is unaware of
   which transport is active.
--------------------------------------------------------------------------- */
const Sync = (()=>{
  const me = uid();
  let mode = "local", remote = null, statusListeners = new Set();

  let ch=null;
  try{ ch = new BroadcastChannel("topography-of-us"); }catch(e){}
  if(ch){
    ch.onmessage = ev=>{
      const m = ev.data; if(!m || m.from===me) return;
      Sync._receive(m);
    };
  }

  function setStatus(s){ mode=s; statusListeners.forEach(fn=>fn(mode)) }

  // remote-config.js now sets window.TOPO_REMOTE *asynchronously* — it probes for
  // the local Python server and, if that misses, dynamically loads Firebase. So
  // we can't just check once at script load; we poll briefly, then give up. Once
  // adopted, we switch mode and route messages accordingly.
  function tryAdoptRemote(){
    if(typeof window==="undefined") return false;
    if(!window.TOPO_REMOTE || typeof window.TOPO_REMOTE.send!=="function") return false;
    remote = window.TOPO_REMOTE;
    remote.subscribe(m=> Sync._receive(m));
    setStatus(window.TOPO_MODE || "remote");
    return true;
  }
  if(!tryAdoptRemote()){
    const pollIv = setInterval(()=>{ if(tryAdoptRemote()) clearInterval(pollIv) }, 100);
    // 6 s cap — long enough for Firebase SDK to arrive over slow LTE, short
    // enough that a truly-offline visitor stops waiting and uses BroadcastChannel.
    setTimeout(()=>clearInterval(pollIv), 6000);
  }

  return {
    get mode(){ return mode },
    onStatus(fn){ statusListeners.add(fn); fn(mode); return ()=>statusListeners.delete(fn) },
    send(m){
      const withFrom={...m, from:me};
      if(remote) remote.send(withFrom);
      else if(ch) try{ ch.postMessage(withFrom) }catch(e){}
    },
    hello(){ this.send({k:"hello"}) },
    _receive(m){
      // Firebase's child_added replays every past message on first connect. The
      // remote adapter tags those with _historical so we can hydrate silently —
      // otherwise the projection would try to play an injection animation for
      // every path in the log the moment the wall opens.
      if(m.k==="path")   Store.addPath(m.p,{broadcast:false, animate: !m._historical});
      if(m.k==="remove") Store.removePath(m.id,{broadcast:false});
      if(m.k==="filter") Store.setFilter(m.f,{broadcast:false});
      if(m.k==="auto")   Store.setAuto(m.v,{broadcast:false});
      if(m.k==="theme")  Store.setTheme(m.val,{broadcast:false}); // (older messages carried a `which` field — we ignore it and set the unified theme)
      if(m.k==="clear")  Store.clear({broadcast:false});
      if(m.k==="clearSeeded") Store.clearSeeded({broadcast:false});
      if(m.k==="hello")  this.send({k:"state",paths:Store.paths,filter:Store.filter,auto:Store.auto,theme:Store.theme});
      if(m.k==="state" && Store.paths.length===0){
        Store.replaceAll(m.paths); Store.filter=m.filter; Store.auto=m.auto;
        // Normalise: an older client might send theme in the legacy shape.
        Store.theme = _initTheme(m.theme);
        Store.emit({type:"reset"});
      }
    }
  };
})();

/* ---------------- Store ----------------------------------------------------
   State survives page refresh / tab close / browser restart via localStorage.
   Every mutation writes; page load reads. localStorage is per-origin per browser,
   so multiple tabs on the same machine share it — BroadcastChannel still handles
   live tab-to-tab updates, this just keeps a durable copy so nothing is lost if
   the tablet is bumped, refreshed, or the browser is closed mid-show.
   ---
   Storage key includes a schema version — bumping it invalidates old data
   automatically if the shape ever changes.
   -------------------------------------------------------------------------- */
const STORAGE_KEY = "topography-of-us:v1";

function loadPersisted(){
  try{
    if(typeof localStorage==="undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    const p = JSON.parse(raw);
    if(!p || !Array.isArray(p.paths)) return null;
    return p;
  }catch(_){ return null }
}
function persistNow(){
  try{
    if(typeof localStorage==="undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      paths: Store.paths, filter: Store.filter, auto: Store.auto, theme: Store.theme
    }));
  }catch(_){}
}

const _persisted = loadPersisted();

// Migrate legacy per-role theme ({projection, tablet}) to a single unified
// string. The operator now sees one theme across every page they touch; the
// participant's take-home view.html manages its own preference separately.
function _initTheme(raw){
  if(typeof raw === "string" && (raw === "dark" || raw === "light")) return raw;
  if(raw && typeof raw === "object") return raw.projection || raw.tablet || "dark";
  return "dark";
}

const Store = {
  paths: _persisted?.paths || [],
  filter: _persisted?.filter || {type:"all"},
  auto: _persisted?.auto ?? true,
  theme: _initTheme(_persisted?.theme),
  listeners:new Set(),
  version:0,
  sub(fn){this.listeners.add(fn); return ()=>this.listeners.delete(fn)},
  emit(evt){this.version++; this.listeners.forEach(fn=>fn(evt)); persistNow()},

  addPath(p, {broadcast=true, animate=true}={}){
    if(this.paths.some(x=>x.id===p.id)) return;
    this.paths.push(p);
    if(broadcast) Sync.send({k:"path", p});
    this.emit({type:"path", path:p, animate});
  },
  removePath(id, {broadcast=true}={}){
    const idx = this.paths.findIndex(p=>p.id===id);
    if(idx<0) return;
    this.paths.splice(idx, 1);
    if(broadcast) Sync.send({k:"remove", id});
    this.emit({type:"remove", id});
  },
  setFilter(f,{broadcast=true}={}){
    this.filter=f; if(broadcast) Sync.send({k:"filter", f});
    this.emit({type:"filter"});
  },
  setAuto(v,{broadcast=true}={}){
    this.auto=v; if(broadcast) Sync.send({k:"auto", v});
    this.emit({type:"auto"});
  },
  setTheme(val,{broadcast=true}={}){
    // Single unified theme now — one value applies to every operator surface
    // (tablet, projection, settings, archive). view.html manages its own.
    this.theme = val;
    if(broadcast) Sync.send({k:"theme", val});
    this.emit({type:"theme"});
  },
  clear({broadcast=true}={}){
    this.paths=[]; if(broadcast) Sync.send({k:"clear"});
    this.emit({type:"reset"});
  },
  clearSeeded({broadcast=true}={}){
    this.paths=this.paths.filter(p=>!p.seeded);
    if(broadcast) Sync.send({k:"clearSeeded"});
    this.emit({type:"reset"});
  },
  replaceAll(paths){ this.paths=paths.slice(); this.emit({type:"reset"}) }
};

// Auto-apply the theme to the document whenever it changes and on first load.
// Individual pages don't need to manage this — they just call Store.setTheme.
Store.sub(()=>{ if(typeof document!=="undefined") document.documentElement.dataset.theme = Store.theme });
if(typeof document!=="undefined") document.documentElement.dataset.theme = Store.theme;
