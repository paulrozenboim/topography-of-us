/* ============================================================
   OPTIONAL — wire in a real-time backend so separate DEVICES stay in sync,
   not just separate tabs on one machine.

   Rename this file to remote-config.js, fill it in, then add ONE line to the
   <head> of tablet.html, projection.html, and settings.html — BEFORE assets/store.js:

     <script src="assets/remote-config.js"></script>

   store.js looks for window.TOPO_REMOTE at load time. If present, Store.addPath /
   setFilter / setTheme / clear all route through it instead of BroadcastChannel,
   and every device loading these pages shares one live state.

   The contract is deliberately small:
     send(msg)       — msg is a plain JSON-safe object, e.g. {k:"path", p:{...}}
     subscribe(fn)   — call fn(msg) whenever a message arrives from ANY other client

   Nothing else in the app needs to know which backend is behind this file.
   ============================================================ */

// -------------------------------------------------------------------------
// EXAMPLE using Firebase Realtime Database (free tier, no server to run/host).
// Uncomment and fill in after creating a free project at https://console.firebase.google.com
// → Build → Realtime Database → Create Database → start in test mode.
// Add these two script tags ABOVE this file in each HTML page's <head>:
//   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
//   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>
// -------------------------------------------------------------------------
/*
firebase.initializeApp({
  apiKey: "YOUR_API_KEY",
  databaseURL: "https://YOUR_PROJECT.firebaseio.com",
  projectId: "YOUR_PROJECT"
});
const ref = firebase.database().ref("topography-of-us/messages");
window.TOPO_REMOTE = {
  send(msg){ ref.push({...msg, ts:Date.now()}) },
  subscribe(fn){
    ref.limitToLast(1).on("child_added", snap=>{
      const v=snap.val(); if(v) fn(v);
    });
  }
};
*/

// This file has NOT been tested against a live Firebase project in this build —
// the code above follows the standard SDK pattern, but verify it against your own
// project before relying on it for an event. See README.md for the full comparison
// of backend options (Firebase / PocketBase / a small Node+SSE server).
