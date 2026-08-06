/* ============================================================
   TOPO_REMOTE dispatcher — decides at page-load time whether to talk to a
   local relay (Python sync-server.py) or to Firebase Realtime Database.

   Detection is by same-origin probe of /health, with a hard 500 ms timeout:
     · /health returns 200  →  we're on the local Python server, use LOCAL mode
     · anything else / timeout → use CLOUD mode (Firebase)

   Cloud mode ONLY reaches out to gstatic.com if that path fires — otherwise the
   Firebase SDK is never fetched. That matters on event night: a laptop hotspot
   with no internet forwarding would otherwise stall for ~30 s on every page
   load trying to fetch the SDK from gstatic.com.

   No matter which branch wins, the surface for store.js is the same:
     window.TOPO_REMOTE = {send, subscribe}
   store.js also gets a window.TOPO_MODE ("local" | "cloud") for the sync-mode
   pill in settings.
   ============================================================ */
"use strict";

(function(){
  const FIREBASE_APP_URL = "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js";
  const FIREBASE_DB_URL  = "https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js";
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBHzt9jQ0by9P0Obn3Abplfuezet4eruX8",
    authDomain: "topography-of-us.firebaseapp.com",
    databaseURL: "https://topography-of-us-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "topography-of-us",
    storageBucket: "topography-of-us.firebasestorage.app",
    messagingSenderId: "578893298967",
    appId: "1:578893298967:web:43f6a5a753557d3d734b52"
  };

  const _connectTime = Date.now();

  function probeLocal(){
    // AbortController with a 500 ms timeout — long enough for a laptop-loopback
    // fetch, short enough that offline visitors don't feel a stall.
    const ctl = new AbortController();
    const t = setTimeout(()=>ctl.abort(), 500);
    return fetch("/health", {signal: ctl.signal, cache:"no-store"})
      .then(r => r.ok && r.status === 200)
      .catch(()=>false)
      .finally(()=>clearTimeout(t));
  }

  function loadScript(src){
    return new Promise((res, rej)=>{
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  function initLocal(){
    window.TOPO_MODE = "local";
    let handler = null, queued = [];
    // EventSource auto-reconnects on transient disconnects — free durability
    // when the Python server restarts or the wifi hiccups.
    const es = new EventSource("/sub");
    es.onmessage = ev => {
      let m; try{ m = JSON.parse(ev.data) }catch(_){ return }
      if(handler) handler(m); else queued.push(m);
    };
    window.TOPO_REMOTE = {
      send(msg){
        // Handshake messages are BroadcastChannel-only; the sync-server's
        // replay-on-connect handles hydration natively.
        if(msg.k === "hello" || msg.k === "state") return;
        fetch("/send", {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body: JSON.stringify({...msg, ts: Date.now()})
        }).catch(()=>{});
      },
      subscribe(fn){
        handler = fn;
        // deliver anything that arrived before store.js was ready
        queued.forEach(fn); queued = [];
      }
    };
  }

  async function initCloud(){
    window.TOPO_MODE = "cloud";
    try{
      await Promise.all([loadScript(FIREBASE_APP_URL), loadScript(FIREBASE_DB_URL)]);
    }catch(_){
      // Firebase SDK didn't load (usually: no internet + not on the Python
      // server). Leave TOPO_REMOTE unset so store.js falls back to
      // BroadcastChannel — better than an app hang or a crash.
      console.warn("Firebase SDK failed to load — cross-device sync disabled.");
      window.TOPO_MODE = "offline";
      return;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    const ref = firebase.database().ref("messages");

    window.TOPO_REMOTE = {
      send(msg){
        if(msg.k === "hello" || msg.k === "state") return;
        // A "clear" purges the durable log too so a fresh client doesn't
        // re-hydrate the just-cleared paths.
        if(msg.k === "clear"){
          ref.remove().then(()=>ref.push({...msg, ts: Date.now()}));
          return;
        }
        ref.push({...msg, ts: Date.now()});
      },
      subscribe(fn){
        // limitToLast caps hydration so a client joining after a very busy
        // night isn't held hostage by replay. Store.addPath dedupes by id.
        ref.limitToLast(500).on("child_added", snap => {
          const v = snap.val(); if(!v) return;
          // Historical replays: no injection animation on the projection.
          if(v.ts && v.ts < _connectTime - 2000) v._historical = true;
          fn(v);
        });
      }
    };
  }

  probeLocal().then(isLocal => isLocal ? initLocal() : initCloud());
})();
