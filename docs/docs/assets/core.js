/* ============================================================
   THE TOPOGRAPHY OF US — shared core
   Station data, geometry, aggregate analysis, and the canvas renderer.
   Loaded after store.js on every page (index does not need it).
   ============================================================ */
"use strict";

const CATS = {
  F:{name:"Friction & Resistance",   color:"#E8402A"},
  R:{name:"Foundations & Reflection",color:"#3B57C4"},
  C:{name:"Connection & Empathy",    color:"#00A277"},
  M:{name:"Momentum & Vision",       color:"#F2A007"}
};
const CATS_LIGHT = {F:"#C42B18", R:"#2A42A6", C:"#00785A", M:"#C47A00"};
// Grayscale palette for print — thermal printers dither greys cleanly, and
// distinct values per line preserve some of the on-screen visual variation
// without pretending it's colour.
const CATS_PRINT = {F:"#1e1e1e", R:"#3d3d3d", C:"#5a5a5a", M:"#2d2d2d"};
const catColor = (c,theme)=>
  theme==="print" ? CATS_PRINT[c] :
  theme==="light" ? CATS_LIGHT[c] :
  CATS[c].color;

// Solved by relax2.js: each of the four lines fills its own region of the field with a
// real gutter between quadrants, semantic bridges pull related stations toward each other,
// and every station keeps a minimum ~155px of clear space from every other. Re-run the
// solver rather than hand-editing coordinates if stations are ever added or renamed.
const NODES = [
  {n:"Apathy",         c:"F", x:383, y:202},
  {n:"Burnout",        c:"F", x:82,  y:279},
  {n:"Stagnation",     c:"F", x:115, y:107},
  {n:"Frustration",    c:"F", x:306, y:50},
  {n:"Conflict",       c:"F", x:530, y:50},
  {n:"Fear",           c:"F", x:473, y:372},
  {n:"Doubt",          c:"F", x:647, y:360},
  {n:"Unknown",        c:"F", x:606, y:198},
  {n:"Grief",          c:"F", x:265, y:357},
  {n:"Memory",         c:"R", x:79,  y:604},
  {n:"Solitude",       c:"R", x:229, y:545},
  {n:"Tradition",      c:"R", x:383, y:565},
  {n:"Routine",        c:"R", x:81,  y:445},
  {n:"Stillness",      c:"R", x:82,  y:764},
  {n:"Security",       c:"R", x:608, y:755},
  {n:"Pragmatism",     c:"R", x:586, y:564},
  {n:"Logic",          c:"R", x:447, y:755},
  {n:"Observation",    c:"R", x:264, y:751},
  {n:"Vulnerability",  c:"C", x:782, y:523},
  {n:"Care",           c:"C", x:1057,y:446},
  {n:"Listening",      c:"C", x:1312,y:647},
  {n:"Dialogue",       c:"C", x:1149,y:764},
  {n:"Trust",          c:"C", x:1111,y:602},
  {n:"Compromise",     c:"C", x:802, y:733},
  {n:"Belonging",      c:"C", x:1262,y:461},
  {n:"Community",      c:"C", x:941, y:567},
  {n:"Solidarity",     c:"C", x:972, y:764},
  {n:"Adaptation",     c:"M", x:862, y:359},
  {n:"Curiosity",      c:"M", x:918, y:90},
  {n:"Disruption",     c:"M", x:782, y:222},
  {n:"Courage",        c:"M", x:753, y:50},
  {n:"Resilience",     c:"M", x:1004,y:235},
  {n:"Idealism",       c:"M", x:1115,y:64},
  {n:"Hope",           c:"M", x:1329,y:250},
  {n:"Vision",         c:"M", x:1161,y:277},
  {n:"Playfulness",    c:"M", x:1289,y:58}
].map((d,i)=>({id:i,...d}));

const WORLD = {w:1400, h:820};
const NODE_BY_NAME = Object.fromEntries(NODES.map(n=>[n.n,n]));
const MIN_STOPS = 3, MAX_STOPS = 10;

/* ============================================================
   PATH URL ENCODING
   Each station id (0–35) packs into a single base36 char, so a 10-stop path
   becomes 10 chars. Short enough to fit comfortably inside a scannable QR code
   with room for the surrounding URL. The URL is the "receipt" a participant
   takes home — see view.html.
   ============================================================ */
function encodePath(nodeIds){
  return nodeIds.map(i=>i.toString(36)).join("");
}
function decodePath(str){
  if(!str) return [];
  const ids=[...String(str)].map(c=>parseInt(c,36));
  if(ids.some(n=>isNaN(n)||n<0||n>=NODES.length)) return [];
  return ids;
}
// Cast timestamp piggybacks on the URL so view.html can show WHEN the path was cast,
// not the visit time. Base36 of seconds-since-epoch fits comfortably in 7 chars.
function encodeTime(ts){ return Math.floor(ts/1000).toString(36) }
function decodeTime(str){
  const n = parseInt(str,36);
  return (isFinite(n) && n>0) ? n*1000 : 0;
}

/* ============================================================
   AGGREGATE ANALYSIS — what the projection's bulletins speak from
   ============================================================ */
let _aCache={v:-1,r:null};
function analyse(paths){
  if(_aCache.v===Store.version && _aCache.r) return _aCache.r;
  const r=_analyse(paths); _aCache={v:Store.version, r}; return r;
}
function _analyse(paths){
  const edges = new Map();
  const traffic = new Array(NODES.length).fill(0);
  const anchors = new Array(NODES.length).fill(0);
  const ends    = new Array(NODES.length).fill(0);
  const catEnd  = {F:0,R:0,C:0,M:0};
  const routeKey = new Map();

  for(const p of paths){
    const ns=p.nodes;
    anchors[ns[0]]++; ends[ns[ns.length-1]]++;
    catEnd[NODES[ns[ns.length-1]].c]++;
    ns.forEach(id=>traffic[id]++);
    for(let i=0;i<ns.length-1;i++){
      const k = ns[i]<ns[i+1] ? ns[i]+"-"+ns[i+1] : ns[i+1]+"-"+ns[i];
      edges.set(k,(edges.get(k)||0)+1);
    }
    routeKey.set(ns.join(">"),(routeKey.get(ns.join(">"))||0)+1);
  }
  const edgeList=[...edges.entries()].map(([k,v])=>{
    const [a,b]=k.split("-").map(Number); return {a,b,v,k};
  }).sort((x,y)=>y.v-x.v);

  let outlier=null, worst=Infinity;
  for(const p of paths){
    if(p.nodes.length<2) continue;
    let s=0;
    for(let i=0;i<p.nodes.length-1;i++){
      const a=p.nodes[i],b=p.nodes[i+1];
      const k=a<b?a+"-"+b:b+"-"+a;
      s += (edges.get(k)||1)-1;
    }
    const score = s/(p.nodes.length-1);
    if(score<worst){worst=score; outlier=p}
  }
  const idx = arr=>arr.indexOf(Math.max(...arr));
  const untouched = NODES.filter(n=>traffic[n.id]===0);

  let totalStops=0, longest=null, minimalCount=0, maximalCount=0, recentCount=0;
  const now=Date.now();
  const minimalIds=[], maximalIds=[], recentIds=[];
  for(const p of paths){
    totalStops += p.nodes.length;
    if(!longest || p.nodes.length>longest.nodes.length) longest=p;
    if(p.nodes.length===MIN_STOPS){ minimalCount++; minimalIds.push(p.id) }
    if(p.nodes.length===MAX_STOPS){ maximalCount++; maximalIds.push(p.id) }
    if(now-p.t < 15*60*1000){ recentCount++; recentIds.push(p.id) }
  }
  // Count how many paths tie the longest — so the bulletin can honestly say
  // "one of the longest" instead of "the longest" when multiple share the record.
  let longestCount = 0;
  if(longest){
    for(const p of paths) if(p.nodes.length===longest.nodes.length) longestCount++;
  }
  // Small sample sets for motion:cascade — take the tail (newest) so the animation
  // feels like the room's most recent activity, not an arbitrary slice from hours ago.
  const sampleAny = paths.slice(-8).map(p=>p.id);
  const sampleMin = minimalIds.slice(-5);
  const sampleMax = maximalIds.slice(-5);
  const sampleRecent = recentIds.slice(-8);

  // Per-path category-set signatures for the new "stayed on one line" / "touched
  // every line" / "signature transfer" bulletins. Building this here so bulletin
  // logic stays a pure lookup pass over A.
  const singleCatIds = {F:[], R:[], C:[], M:[]};
  const fourLineIds = [];
  let widest = null, widestArea = 0;
  const anchorSet = new Set();
  const catTransfer = {}; // "F>C" -> count
  for(const p of paths){
    anchorSet.add(p.nodes[0]);
    const cs = new Set(p.nodes.map(i=>NODES[i].c));
    if(cs.size===1) singleCatIds[NODES[p.nodes[0]].c].push(p.id);
    if(cs.size===4) fourLineIds.push(p.id);
    // spatial span — the bounding-box area, so "widest" means largest reach across the map
    const xs=p.nodes.map(i=>NODES[i].x), ys=p.nodes.map(i=>NODES[i].y);
    const area = (Math.max(...xs)-Math.min(...xs)) * (Math.max(...ys)-Math.min(...ys));
    if(area>widestArea){ widestArea=area; widest=p }
    // category transitions — only count actual crossings (skip same-line neighbours)
    for(let i=0; i<p.nodes.length-1; i++){
      const ca=NODES[p.nodes[i]].c, cb=NODES[p.nodes[i+1]].c;
      if(ca!==cb){ const k=ca+">"+cb; catTransfer[k]=(catTransfer[k]||0)+1 }
    }
  }
  const topTransfer = Object.entries(catTransfer).sort((a,b)=>b[1]-a[1])[0] || null;

  // Truly unique paths for the "sole traveller" bulletin — every edge appears in
  // this path and NO other. Only then is "nobody else did" honest.
  let solitary = null;
  for(const p of paths){
    if(p.nodes.length<2) continue;
    let allUnique = true;
    for(let i=0;i<p.nodes.length-1;i++){
      const a=p.nodes[i],b=p.nodes[i+1];
      const k=a<b?a+"-"+b:b+"-"+a;
      if((edges.get(k)||0) > 1){ allUnique=false; break }
    }
    if(allUnique){ solitary=p; break }
  }
  const catTraffic={F:0,R:0,C:0,M:0};
  NODES.forEach(n=>{ catTraffic[n.c]+=traffic[n.id] });

  let repeatTop=null;
  for(const [rk,count] of routeKey.entries()){
    if(count>1 && (!repeatTop || count>repeatTop.count)) repeatTop={rk, count};
  }
  const repeatExample = repeatTop ? paths.find(p=>p.nodes.join(">")===repeatTop.rk) : null;

  return {edges, edgeList, traffic, anchors, ends, catEnd, catTraffic, routeKey,
          outlier, outlierScore:worst,
          topNode: paths.length?NODES[idx(traffic)]:null,
          topAnchor: paths.length?NODES[idx(anchors)]:null,
          topEnd: paths.length?NODES[idx(ends)]:null,
          untouched, distinct: routeKey.size, total: paths.length,
          real: paths.filter(p=>!p.seeded).length, seeded: paths.filter(p=>p.seeded).length,
          avgLen: paths.length? totalStops/paths.length : 0,
          longest, longestCount, minimalCount, maximalCount, recentCount,
          sampleAny, sampleMin, sampleMax, sampleRecent,
          singleCatIds, fourLineIds, widest, anchorCount:anchorSet.size,
          topTransfer, solitary,
          repeatTop, repeatExample};
}

function bulletins(A){
  const out=[];
  if(A.total<3){
    out.push({tag:"Service notice", line:"The map is empty. Trace the first route.", sub:"Awaiting first cast"});
    return out;
  }
  const pct = n=> Math.round(n/A.total*100);
  if(A.edgeList[0] && A.edgeList[0].v>1){
    const e=A.edgeList[0];
    out.push({tag:"Heaviest link", accent:NODES[e.a].c,
      line:`${e.v} of you moved between {${NODES[e.a].n}} and {${NODES[e.b].n}}.`,
      sub:"The most walked segment in this room",
      focus:{type:"edge", e, motion:"traverse"}});
  }
  if(A.topNode){
    out.push({tag:"Interchange", accent:A.topNode.c,
      line:`{${A.topNode.n}} is the busiest station tonight.`,
      sub:`Crossed by ${A.traffic[A.topNode.id]} of ${A.total} journeys`,
      focus:{type:"node", id:A.topNode.id, motion:"pulse"}});
  }
  if(A.topAnchor && A.topEnd && A.topAnchor.id!==A.topEnd.id){
    // Old wording said "Most of you" — that means >50%, but the analysis picks a
    // plurality (the single most common), which could be far short of a majority.
    // "The most common" is the honest phrasing.
    out.push({tag:"Direction of travel", accent:A.topEnd.c,
      line:`The most common anchor was {${A.topAnchor.n}}. The most common destination, {${A.topEnd.n}}.`,
      sub:`${A.anchors[A.topAnchor.id]} started there · ${A.ends[A.topEnd.id]} ended there`,
      focus:{type:"edge", e:{a:A.topAnchor.id, b:A.topEnd.id}, motion:"traverse"}});
  }
  const cats=Object.entries(A.catEnd).sort((a,b)=>b[1]-a[1]);
  if(cats[0][1]>0){
    out.push({tag:"Destination", accent:cats[0][0],
      line:`${pct(cats[0][1])}% of journeys end in {${CATS[cats[0][0]].name}}.`,
      sub:`${cats[0][1]} of ${A.total} paths`,
      focus:{type:"cat", c:cats[0][0], motion:"glow"}});
  }
  // Only claim "nobody else did" when EVERY segment of this path appears in it and
  // in no other. The old outlier score (<0.35) let paths through with several
  // shared edges — a lie. If no fully-unique path exists, fall back to the honest
  // "least like any other" phrasing on the outlier.
  if(A.solitary){
    const names=A.solitary.nodes.map(i=>NODES[i].n);
    out.push({tag:"Sole traveller", accent:NODES[A.solitary.nodes[0]].c,
      line:`One person went this way. Nobody else did.`,
      sub:names.join("  →  "),
      focus:{type:"path", id:A.solitary.id, motion:"traverse"}, hold:true});
  } else if(A.outlier && A.outlierScore<0.4){
    const names=A.outlier.nodes.map(i=>NODES[i].n);
    out.push({tag:"Least like the others", accent:NODES[A.outlier.nodes[0]].c,
      line:`This path is the least like any other tonight.`,
      sub:names.join("  →  "),
      focus:{type:"path", id:A.outlier.id, motion:"traverse"}, hold:true});
  }
  if(A.untouched.length){
    const u=A.untouched[Math.floor(Math.random()*A.untouched.length)];
    out.push({tag:"No service", accent:u.c,
      line:`No one has passed through {${u.n}} tonight.`,
      sub:"Station open, unvisited",
      focus:{type:"node", id:u.id, motion:"pulse"}});
  }
  if(A.avgLen>0 && A.sampleAny.length){
    out.push({tag:"Average journey", line:`The average journey tonight visits {${A.avgLen.toFixed(1)}} stations.`,
      sub:`Across ${A.total} paths cast`,
      focus:{type:"paths", ids:A.sampleAny, motion:"cascade"}});
  }
  if(A.longest && A.longest.nodes.length>=6){
    // Ties for "the longest" get honest phrasing — several 10-stop paths from different
    // anchors would make the singular version misleading. "Longest journey" the tag,
    // "one of the longest" the sentence.
    const uniq = A.longestCount<=1;
    const opener = uniq ? "The longest journey tonight" : "One of the longest journeys tonight";
    const anchor = uniq ? `, starting at {${NODES[A.longest.nodes[0]].n}}` : "";
    out.push({tag:"Longest journey", accent:NODES[A.longest.nodes[0]].c,
      line:`${opener} ran {${A.longest.nodes.length}} stations${anchor}.`,
      sub:A.longest.nodes.map(i=>NODES[i].n).join("  →  "),
      focus:{type:"path", id:A.longest.id, motion:"traverse"}});
  }
  if(A.minimalCount>0 && A.sampleMin.length){
    out.push({tag:"Kept it short", line:`${A.minimalCount} of you kept it to the minimum — just {${MIN_STOPS}} stations.`,
      sub:"Sometimes the shortest read is the truest one",
      focus:{type:"paths", ids:A.sampleMin, motion:"cascade"}});
  }
  if(A.maximalCount>0 && A.sampleMax.length){
    // 10 is the path-length cap the tablet enforces, not the count of stations on the
    // map (36). Old copy said "used every stop available" which read as "visited every
    // station" — a totally different claim.
    out.push({tag:"Went the distance", line:`${A.maximalCount} of you traced the full {${MAX_STOPS}}-station limit.`,
      sub:"The longest route the map allows",
      focus:{type:"paths", ids:A.sampleMax, motion:"cascade"}});
  }
  const catT=Object.entries(A.catTraffic).sort((a,b)=>b[1]-a[1]);
  if(catT[0][1]>0){
    out.push({tag:"Heaviest line", accent:catT[0][0],
      line:`{${CATS[catT[0][0]].name}} carries the most foot traffic tonight.`,
      sub:`${catT[0][1]} station crossings on that line alone`,
      focus:{type:"cat", c:catT[0][0], motion:"glow"}});
  }
  if(A.recentCount>0 && A.sampleRecent.length){
    out.push({tag:"Just now", line:`${A.recentCount} journeys have joined the wall in the last 15 minutes.`,
      sub:"The map is still moving",
      focus:{type:"paths", ids:A.sampleRecent, motion:"cascade"}});
  }
  if(A.repeatTop && A.repeatExample){
    out.push({tag:"Well-worn path", accent:NODES[A.repeatExample.nodes[0]].c,
      line:`${A.repeatTop.count} of you traced the exact same route.`,
      sub:A.repeatExample.nodes.map(i=>NODES[i].n).join("  →  "),
      focus:{type:"path", id:A.repeatExample.id, motion:"traverse"}});
  }
  if(A.edgeList[1] && A.edgeList[1].v>1){
    // Old wording: "${e.v} more of you..." — implies "more of the same edge as
    // the last bulletin", but this is a DIFFERENT edge. Reword to "also walked".
    const e=A.edgeList[1];
    out.push({tag:"Also well-travelled", accent:NODES[e.a].c,
      line:`${e.v} of you also walked between {${NODES[e.a].n}} and {${NODES[e.b].n}}.`,
      sub:"The second most walked segment in this room",
      focus:{type:"edge", e, motion:"traverse"}});
  }

  // --- New bulletins --------------------------------------------------------

  // Stayed on one line — paths whose stations all belong to a single category
  const stayed = Object.entries(A.singleCatIds).map(([c,ids])=>[c,ids]).filter(([,ids])=>ids.length>0)
                       .sort((a,b)=>b[1].length-a[1].length);
  if(stayed[0]){
    const [c,ids]=stayed[0];
    out.push({tag:"Stayed on one line", accent:c,
      line:`${ids.length} of you stayed entirely on {${CATS[c].name}}.`,
      sub:"Never crossed to another line",
      focus:{type:"cat", c, motion:"glow"}});
  }

  // Touched every line — paths spanning F, R, C, M
  if(A.fourLineIds.length){
    out.push({tag:"Touched every line",
      line:`${A.fourLineIds.length} of you crossed all four lines in one path.`,
      sub:"The full width of the map, in a single journey",
      focus:{type:"paths", ids:A.fourLineIds.slice(-5), motion:"cascade"}});
  }

  // Widest span — the path with the largest spatial bounding box
  if(A.widest && A.widest.nodes.length>=4){
    const names = A.widest.nodes.map(i=>NODES[i].n);
    out.push({tag:"Widest reach", accent:NODES[A.widest.nodes[0]].c,
      line:`One path stretches the widest across the map tonight.`,
      sub:names.join("  →  "),
      focus:{type:"path", id:A.widest.id, motion:"traverse"}});
  }

  // Distinct anchors — how many different starting stations
  if(A.anchorCount>=2){
    out.push({tag:"Different starts",
      line:`Tonight's journeys began at {${A.anchorCount}} different stations.`,
      sub:`Out of ${NODES.length} on the map`});
  }

  // Signature transfer — the most common category-to-category crossing
  if(A.topTransfer && A.topTransfer[1]>=2){
    const [from,to] = A.topTransfer[0].split(">");
    out.push({tag:"Signature transfer", accent:to,
      line:`The most common crossing tonight: from {${CATS[from].name}} to {${CATS[to].name}}.`,
      sub:`${A.topTransfer[1]} steps between the two lines`,
      focus:{type:"cat", c:to, motion:"glow"}});
  }

  // Network status — old wording said "unrepeated" but `distinct` = distinct
  // route strings; a route with count=3 counts once in `distinct`, but the three
  // paths sharing it are all "repeated". Say what we actually mean.
  out.push({tag:"Network status",
    line:`${A.total} journeys cast. ${A.distinct} distinct routes among them.`,
    sub:"Every line on this wall was drawn by someone in this room"});
  return out;
}

/* ============================================================
   CAST BULLETIN — what the wall says the moment a new path arrives.
   Picks one comparison between the just-cast path and everything else on the
   wall, in a priority order that favours the most dramatic / rarest fact.
   Fires only when a real cast lands (not on historical hydration).
   ============================================================ */
function castBulletin(newPath, allPaths){
  const others = allPaths.filter(p => p.id !== newPath.id);
  const total = allPaths.length;
  const anchor = NODES[newPath.nodes[0]];
  const dest = NODES[newPath.nodes[newPath.nodes.length-1]];

  // 1. Solo debut: this path is the first to touch some previously-untouched station
  const debut = newPath.nodes.find(id =>
    !others.some(p => p.nodes.includes(id))
  );
  if(debut != null && others.length > 0){
    const n = NODES[debut];
    return {tag:"First to visit", accent:n.c,
      line:`This path is the first to touch {${n.n}}.`,
      sub:`A corner of the map, opened for the first time tonight`,
      focus:{type:"node", id:n.id, motion:"pulse"}, hold:true};
  }

  // 2. Exact-route match with someone else — you're not alone
  const routeKey = newPath.nodes.join(">");
  const echoes = others.filter(p => p.nodes.join(">") === routeKey);
  if(echoes.length > 0){
    return {tag:"Well-worn path", accent:anchor.c,
      line:`${echoes.length + 1} of you have now traced this exact route.`,
      sub:newPath.nodes.map(i=>NODES[i].n).join("  →  "),
      focus:{type:"path", id:newPath.id, motion:"traverse"}, hold:true};
  }

  // 3. All four lines in one path — always worth flagging
  const cats = new Set(newPath.nodes.map(i => NODES[i].c));
  if(cats.size === 4){
    const priorFour = others.filter(p =>
      new Set(p.nodes.map(i => NODES[i].c)).size === 4
    ).length;
    return {tag:"Full spectrum", accent:dest.c,
      line:`This path touches all four lines — ${priorFour ? "one of "+(priorFour+1) : "the first"} tonight to do so.`,
      sub:newPath.nodes.map(i=>NODES[i].n).join("  →  "),
      focus:{type:"path", id:newPath.id, motion:"traverse"}, hold:true};
  }

  // 4. Longest so far — strict > against every other path
  if(others.length && others.every(p => p.nodes.length < newPath.nodes.length)){
    return {tag:"Longest so far", accent:anchor.c,
      line:`The longest journey of the night so far — {${newPath.nodes.length}} stations.`,
      sub:newPath.nodes.map(i=>NODES[i].n).join("  →  "),
      focus:{type:"path", id:newPath.id, motion:"traverse"}, hold:true};
  }

  // 5. Popular anchor — three or more people also started here
  const sharedAnchor = others.filter(p => p.nodes[0] === newPath.nodes[0]).length;
  if(sharedAnchor >= 3){
    return {tag:"Common ground", accent:anchor.c,
      line:`This path joins {${sharedAnchor + 1}} of you who started at {${anchor.n}}.`,
      sub:`Out of ${total} casts, ${anchor.n} is a shared starting point`,
      focus:{type:"node", id:anchor.id, motion:"pulse"}};
  }

  // 6. Popular destination — three or more also ended here
  const sharedEnd = others.filter(p => p.nodes[p.nodes.length-1] === newPath.nodes[newPath.nodes.length-1]).length;
  if(sharedEnd >= 3){
    return {tag:"Shared destination", accent:dest.c,
      line:`This path arrives at {${dest.n}} — where ${sharedEnd + 1} of you have landed tonight.`,
      sub:`A gathering point on the map`,
      focus:{type:"node", id:dest.id, motion:"pulse"}};
  }

  // 7. Stayed entirely on one line
  if(cats.size === 1){
    const c = [...cats][0];
    const sameLine = others.filter(p =>
      new Set(p.nodes.map(i=>NODES[i].c)).size === 1 &&
      NODES[p.nodes[0]].c === c
    ).length;
    return {tag:"Stayed on one line", accent:c,
      line:`This journey never left {${CATS[c].name}}.`,
      sub:sameLine ? `${sameLine + 1} of tonight's paths kept to that line` : "The first single-line path of the night",
      focus:{type:"cat", c, motion:"glow"}};
  }

  // 8. Fallback — welcome to the night, keep the injection front-and-centre
  const ord = ["1st","2nd","3rd"][total-1] || `${total}th`;
  return {tag:"Just cast", accent:anchor.c,
    line:`The ${ord} journey of the night, from {${anchor.n}} to {${dest.n}}.`,
    sub:newPath.nodes.map(i=>NODES[i].n).join("  →  "),
    focus:{type:"path", id:newPath.id, motion:"traverse"}};
}

/* ============================================================
   GEOMETRY — sweeping arteries, gravity-bent
   ============================================================ */
function splinePoints(pts, gravity){
  if(pts.length<2) return pts;
  const P=[pts[0],...pts,pts[pts.length-1]];
  const out=[];
  for(let i=1;i<P.length-2;i++){
    const p0=P[i-1],p1=P[i],p2=P[i+1],p3=P[i+2];
    for(let t=0;t<1;t+=1/18){
      const t2=t*t,t3=t2*t;
      let x=.5*((2*p1.x)+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3);
      let y=.5*((2*p1.y)+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3);
      if(gravity){
        const dx=gravity.x-x, dy=gravity.y-y, d=Math.hypot(dx,dy)||1;
        const bell=Math.sin(t*Math.PI);
        const pull=gravity.k*bell*Math.min(1,180/d);
        x+=dx/d*pull*38; y+=dy/d*pull*38;
      }
      out.push({x,y});
    }
  }
  out.push(pts[pts.length-1]);
  return out;
}
const pathPts = p => p.nodes.map(i=>({x:NODES[i].x,y:NODES[i].y}));

/* ============================================================
   GRADIENT STROKE — walk the spline in per-station-segment slices, each stroked
   with a linear gradient from that station's line color into the next station's.
   The spline emits 18 sample points per station-to-station segment (see
   splinePoints), so the slice boundaries land exactly at station transitions.
   Neighbouring segments share their meeting color, so joins are seamless.
   ---
   sp        : screen-space spline points (already toScreen'd)
   catCodes  : one category code per station (length N)
   theme     : "dark" | "light"
   opts      : {lineWidth, alpha, composite, lastCutIndex}
     lastCutIndex is used by progressive-draw callers (injection, cascade) so the
     final partial segment fades to its next-station color even mid-reveal.
   ============================================================ */
const SPLINE_STEPS = 18;
function strokeGradientPath(ctx, sp, catCodes, theme, opts={}){
  const N = catCodes.length;
  if(N<2 || sp.length<2) return;
  const {lineWidth=2, alpha=1, composite=null, lastCutIndex=null, lineCap="round", lineJoin="round"} = opts;
  ctx.save();
  if(composite) ctx.globalCompositeOperation = composite;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = lineCap;
  ctx.lineJoin = lineJoin;
  const cutIndex = (lastCutIndex==null || lastCutIndex>=sp.length-1) ? sp.length-1 : lastCutIndex;
  for(let k=0; k<N-1; k++){
    const iStart = k*SPLINE_STEPS;
    if(iStart >= cutIndex) break;
    const iEnd = Math.min(cutIndex, (k+1)*SPLINE_STEPS);
    const s = sp[iStart], e = sp[iEnd];
    // guard against a zero-length segment producing an invalid gradient
    const grad = (s.x===e.x && s.y===e.y)
      ? catColor(catCodes[k], theme)
      : (()=>{
          const g = ctx.createLinearGradient(s.x, s.y, e.x, e.y);
          g.addColorStop(0, catColor(catCodes[k], theme));
          g.addColorStop(1, catColor(catCodes[k+1], theme));
          return g;
        })();
    ctx.strokeStyle = grad;
    ctx.beginPath();
    for(let i=iStart; i<=iEnd; i++){
      const p = sp[i];
      i===iStart ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* ============================================================
   SHARED CONSTELLATION RENDER — the take-home version of a single path.
   Same picture drawn in the tablet's cast modal and on view.html. Sizes to the
   canvas's parent, reads its own theme tokens off :root so it always matches
   the surrounding page. Pure — never touches Store.
   ============================================================ */
function renderConstellation(canvas, nodeIds, theme, opts={}){
  if(!nodeIds || !nodeIds.length) return;
  const print = !!opts.print;
  const dark = print ? false : theme==="dark";
  const ctx = canvas.getContext("2d");
  const parent = canvas.parentElement;
  const r = parent.getBoundingClientRect();
  const dpr = print ? 3 : Math.min(devicePixelRatio||1, 2);
  const rs = getComputedStyle(document.documentElement);
  const bg  = print ? "#ffffff" : rs.getPropertyValue("--bg-2").trim();
  const ink = print ? "#000000" : rs.getPropertyValue("--ink").trim();
  const ink3= print ? "#666666" : rs.getPropertyValue("--ink-3").trim();

  const pts=nodeIds.map(i=>NODES[i]);
  const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
  const worldPad = print ? 60 : 90;
  const bx0=Math.min(...xs)-worldPad, bx1=Math.max(...xs)+worldPad,
        by0=Math.min(...ys)-worldPad, by1=Math.max(...ys)+worldPad;
  const worldW = bx1-bx0, worldH = by1-by0;

  // Print: canvas fills parent width and its HEIGHT auto-derives from the
  // drawing's aspect ratio — no letterboxing above/below wide paths.
  // Screen: canvas fills the wrap in both dimensions (drawing centers inside).
  let cssW, cssH, k, ox, oy;
  if(print){
    cssW = r.width;
    k = cssW / worldW;
    cssH = worldH * k;
    ox = -bx0 * k;
    oy = -by0 * k;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
  } else {
    cssW = r.width; cssH = r.height;
    k = Math.min(r.width/worldW, r.height/worldH);
    ox = (r.width - worldW*k)/2 - bx0*k;
    oy = (r.height - worldH*k)/2 - by0*k;
    canvas.style.width = ""; canvas.style.height = "";
  }
  canvas.width = cssW*dpr; canvas.height = cssH*dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle=bg; ctx.fillRect(0,0,cssW,cssH);
  const toS=p=>({x:p.x*k+ox, y:p.y*k+oy});

  // Starfield only on screen — adds visual noise on thermal paper.
  if(!print){
    ctx.save(); ctx.globalAlpha=dark?.5:.35;
    let sr=1234567;
    const rnd=()=>{sr=(sr*1103515245+12345)&0x7fffffff; return sr/0x7fffffff};
    for(let i=0;i<60;i++){
      ctx.beginPath(); ctx.arc(rnd()*cssW, rnd()*cssH, rnd()*1.1+0.3, 0, 7);
      ctx.fillStyle=dark?"#8B939C":"#9AA2A7"; ctx.fill();
    }
    ctx.restore();
  }

  const sp=splinePoints(pts.map(p=>({x:p.x,y:p.y})), null).map(toS);
  // Both modes use the gradient helper — in print, theme="print" pulls from the
  // CATS_PRINT grayscale palette so the stroke still has line-to-line variation
  // (dark → medium → dark grey) instead of a flat black line.
  if(print){
    strokeGradientPath(ctx, sp, pts.map(p=>p.c), "print", {lineWidth:2.4, alpha:1});
  } else {
    strokeGradientPath(ctx, sp, pts.map(p=>p.c), theme, {
      lineWidth:2.6, alpha:.9, composite: dark?"lighter":"multiply"
    });
  }

  if(print){
    // ------- Print: two-pass rendering with greedy collision-aware labels -------
    // Pass 1: draw every dot up front so they're background for the labels.
    // Pass 2: place the station name labels one at a time, longest first, choosing
    //         the highest-scoring candidate slot (below → above → right → left →
    //         further-below → further-above). Score penalises overlaps with any
    //         already-placed rect (dot, number, or previously placed label) plus
    //         off-canvas clipping. This is a print-simplified port of MapView's
    //         labelMetrics greedy placer.
    const NAME_FS = 10, NUM_FS = 9, DOT_CLEAR = 6, LINE_H = NAME_FS + 3;

    // Draw the dots.
    pts.forEach((n,i)=>{
      const s = toS(n);
      const isEnd = i===0 || i===pts.length-1;
      const rad = isEnd ? 4.5 : 3.2;
      ctx.beginPath(); ctx.arc(s.x, s.y, rad, 0, 7);
      ctx.fillStyle = isEnd ? "#000" : catColor(n.c, "print");
      ctx.fill();
    });

    // Measure numbered label rects (fixed positions above each dot) and dot rects
    // — these get added to the "already placed" set so name labels avoid them.
    ctx.font = `700 ${NUM_FS}px 'Martian Mono',monospace`;
    const numRects = pts.map((n,i)=>{
      const s = toS(n);
      const nw = ctx.measureText(String(i+1)).width;
      return {x0: s.x - nw/2 - 1, x1: s.x + nw/2 + 1,
              y0: s.y - DOT_CLEAR - NUM_FS - 2, y1: s.y - DOT_CLEAR + 2};
    });
    const dotRects = pts.map((n,i)=>{
      const s = toS(n);
      const rad = (i===0||i===pts.length-1) ? 5 : 4;
      return {x0: s.x - rad, x1: s.x + rad, y0: s.y - rad, y1: s.y + rad};
    });

    // Measure each station name at its display size.
    ctx.font = `700 ${NAME_FS}px 'Martian Mono',monospace`;
    const labels = pts.map((n,i)=>{
      const s = toS(n);
      return {s, label: n.n.toUpperCase(), tw: ctx.measureText(n.n.toUpperCase()).width, i};
    });

    // Candidate positions (dy is where the top of the text sits). Order matters —
    // the first-preferred candidate wins ties. Below-center is the default.
    const CAND = [
      {dx: 0,          dy:  DOT_CLEAR + 2,               al:"center"},   // below
      {dx: 0,          dy: -DOT_CLEAR - NUM_FS - LINE_H, al:"center"},   // above (over the number)
      {dx:  DOT_CLEAR, dy: -NAME_FS/2 + 1,               al:"left"  },   // right of the dot
      {dx: -DOT_CLEAR, dy: -NAME_FS/2 + 1,               al:"right" },   // left of the dot
      {dx: 0,          dy:  DOT_CLEAR + 2 + LINE_H,      al:"center"},   // 2 lines below
      {dx: 0,          dy: -DOT_CLEAR - NUM_FS - LINE_H*2, al:"center"}, // 2 lines above
    ];
    const rectFor = (ls, c) => {
      const ly = ls.s.y + c.dy;
      let lx;
      if(c.al === "center")    lx = ls.s.x - ls.tw/2;
      else if(c.al === "left") lx = ls.s.x + c.dx;
      else /* right */         lx = ls.s.x + c.dx - ls.tw;
      return {x0: lx, x1: lx + ls.tw, y0: ly - 1, y1: ly + NAME_FS + 1, lx, ly};
    };

    const placed = [...dotRects, ...numRects];
    const finalPos = new Array(labels.length);

    // Greedy: place hardest labels first (widest) so short labels can slot around them.
    const order = labels.map((_,i)=>i).sort((a,b)=>labels[b].tw - labels[a].tw);
    for(const idx of order){
      const ls = labels[idx];
      let best = null, bestScore = -Infinity;
      for(let ci=0; ci<CAND.length; ci++){
        let r = rectFor(ls, CAND[ci]);
        // Horizontal clamp — if a candidate would slide off the canvas, shift it in.
        // This preserves the vertical slot (below/above/etc) while keeping the label visible.
        if(r.x0 < 1){ const d = 1 - r.x0; r = {...r, lx: r.lx + d, x0: 1, x1: r.x1 + d}; }
        if(r.x1 > cssW - 1){ const d = r.x1 - (cssW - 1); r = {...r, lx: r.lx - d, x0: r.x0 - d, x1: cssW - 1}; }
        let hits = 0;
        for(const p of placed){
          if(r.x0 < p.x1 && p.x0 < r.x1 && r.y0 < p.y1 && p.y0 < r.y1) hits++;
        }
        const yClipped = (r.y0 < 0 || r.y1 > cssH) ? 1 : 0;
        const score = -hits*100 - yClipped*30 - ci;
        if(score > bestScore){ bestScore = score; best = r; }
      }
      finalPos[idx] = best;
      placed.push({x0: best.x0, x1: best.x1, y0: best.y0, y1: best.y1});
    }

    // Draw the numbers (centered above each dot — always-placed positions).
    ctx.font = `700 ${NUM_FS}px 'Martian Mono',monospace`;
    ctx.fillStyle = ink3;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    pts.forEach((n,i)=>{
      const s = toS(n);
      ctx.fillText(String(i+1), s.x, s.y - DOT_CLEAR - 1);
    });

    // Draw the station name labels at their final positions.
    ctx.font = `700 ${NAME_FS}px 'Martian Mono',monospace`;
    ctx.fillStyle = "#000";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    labels.forEach((ls,i)=>{
      const pos = finalPos[i];
      ctx.fillText(ls.label, pos.lx, pos.ly);
    });
    return;
  }

  pts.forEach((n,i)=>{
    const s=toS(n);
    const col=catColor(n.c,theme);
    ctx.beginPath(); ctx.arc(s.x,s.y,i===0||i===pts.length-1?7:5,0,7);
    ctx.fillStyle= i===0 ? col : bg; ctx.fill();
    ctx.lineWidth=1.8; ctx.strokeStyle=col; ctx.stroke();
    ctx.font=`600 10px 'Martian Mono',monospace`;
    ctx.fillStyle=ink3; ctx.textAlign="center";
    ctx.fillText(String(i+1), s.x, s.y-14);
    ctx.font=`400 11px 'Martian Mono',monospace`;
    ctx.fillStyle=ink;
    ctx.fillText(n.n.toUpperCase(), s.x, s.y+18);
  });
}

/* ============================================================
   QR RENDERER — thin wrapper over the vendored qrcode-generator (assets/qrcode.min.js).
   Draws crisp on canvas at devicePixelRatio, always black-on-white for scan reliability.
   ============================================================ */
function renderQR(canvas, text, sizeCSS){
  if(typeof qrcode!=="function") return;
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const dpr = Math.min(devicePixelRatio||1, 2);
  const size = sizeCSS*dpr;
  const cell = Math.floor(size/(n+4));
  const margin = Math.floor((size - cell*n)/2);
  canvas.width=size; canvas.height=size;
  canvas.style.width=sizeCSS+"px"; canvas.style.height=sizeCSS+"px";
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#fff"; ctx.fillRect(0,0,size,size);
  ctx.fillStyle="#000";
  for(let r=0;r<n;r++) for(let c=0;c<n;c++)
    if(qr.isDark(r,c)) ctx.fillRect(margin+c*cell, margin+r*cell, cell, cell);
}

/* ============================================================
   MAP RENDERER
   opts.role: "projection" | "tablet"
   opts.showAggregate: whether OTHER people's paths are ever drawn (false on the tablet —
     the casting surface stays a blank instrument, per design: no distraction while tracing)
   opts.navigable: pan/zoom enabled (projection only)
   ============================================================ */
class MapView{
  constructor(canvas, opts){
    this.cv=canvas; this.ctx=canvas.getContext("2d");
    this.opts=Object.assign({role:"projection", labels:true, interactive:false,
                              showAggregate:true, navigable:false}, opts);
    this.view={x:0,y:0,kx:1,ky:1,k:1};
    this.user={z:1,dx:0,dy:0};
    this.aggCache=document.createElement("canvas");
    this.dirty=true;
    this.hot=null;
    this.draft=null;
    this.inject=null;
    this.focus=null;
    this.pulse=0;
    this.resize();
    this._ro=new ResizeObserver(()=>this.resize()); this._ro.observe(canvas.parentElement);
    if(this.opts.navigable) this.enableNavigation();
    this.loop=this.loop.bind(this); requestAnimationFrame(this.loop);
  }
  get theme(){ return Store.theme[this.opts.role==="tablet"?"tablet":"projection"] }
  css(v){
    if(this._cssV!==Store.version+"|"+this.theme){ this._cssV=Store.version+"|"+this.theme; this._css={} }
    if(this._css[v]==null){
      this._css[v]=getComputedStyle(this.cv.closest("[data-theme]")||document.documentElement).getPropertyValue(v).trim();
    }
    return this._css[v];
  }
  resize(){
    const r=this.cv.parentElement.getBoundingClientRect();
    const dpr=Math.min(devicePixelRatio||1,2);
    this.w=r.width; this.h=r.height;
    this.cv.width=Math.max(1,r.width*dpr); this.cv.height=Math.max(1,r.height*dpr);
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this.aggCache.width=this.cv.width; this.aggCache.height=this.cv.height;
    this.fit(); this.dirty=true;
  }
  fit(){
    const base = this.opts.role==="projection" ? 64 : 44;
    const pad = Math.max(20, Math.min(base, Math.min(this.w,this.h)*0.06));
    let kx=(this.w-pad*2)/WORLD.w, ky=(this.h-pad*2)/WORLD.h;
    const k=Math.max(0.05,Math.min(kx,ky));
    const STRETCH = Math.max(kx,ky)/k > 1.5 ? 1.35 : 1.16;
    kx=Math.min(kx,k*STRETCH); ky=Math.min(ky,k*STRETCH);
    this.view={kx,ky,k:Math.min(kx,ky),x:(this.w-WORLD.w*kx)/2,y:(this.h-WORLD.h*ky)/2};
  }
  resetView(){ this.user={z:1,dx:0,dy:0}; this.fit(); this.dirty=true }
  get scale(){ return this.view.k*this.user.z }
  toScreen(p){
    const v=this.view,u=this.user,cx=this.w/2,cy=this.h/2;
    return {x:(p.x*v.kx+v.x-cx)*u.z+cx+u.dx, y:(p.y*v.ky+v.y-cy)*u.z+cy+u.dy};
  }
  toWorld(p){
    const v=this.view,u=this.user,cx=this.w/2,cy=this.h/2;
    return {x:(((p.x-cx-u.dx)/u.z)+cx-v.x)/v.kx, y:(((p.y-cy-u.dy)/u.z)+cy-v.y)/v.ky};
  }
  nearest(sp,maxPx=36){
    let best=null,bd=maxPx;
    for(const n of NODES){
      const s=this.toScreen(n); const d=Math.hypot(s.x-sp.x,s.y-sp.y);
      if(d<bd){bd=d;best=n}
    }
    return best;
  }
  enableNavigation(){
    const cv=this.cv, at=ev=>{const r=cv.getBoundingClientRect(); return {x:ev.clientX-r.left,y:ev.clientY-r.top}};
    cv.style.cursor="grab";
    cv.addEventListener("wheel",ev=>{ ev.preventDefault(); this.zoomAt(at(ev), ev.deltaY<0?1.12:1/1.12) },{passive:false});
    let drag=null;
    cv.addEventListener("pointerdown",ev=>{ drag={x:ev.clientX,y:ev.clientY}; cv.setPointerCapture(ev.pointerId); cv.style.cursor="grabbing" });
    cv.addEventListener("pointermove",ev=>{
      const sp=at(ev); const n=this.nearest(sp,34); this.hot=n?n.id:null;
      if(!drag) return;
      this.user.dx+=ev.clientX-drag.x; this.user.dy+=ev.clientY-drag.y;
      drag={x:ev.clientX,y:ev.clientY}; this.dirty=true;
    });
    const up=()=>{drag=null; cv.style.cursor="grab"};
    cv.addEventListener("pointerup",up); cv.addEventListener("pointercancel",up);
    cv.addEventListener("dblclick",()=>this.resetView());
  }
  zoomAt(sp,factor){
    const w0=this.toWorld(sp);
    this.user.z=Math.max(0.55,Math.min(4.5,this.user.z*factor));
    const s1=this.toScreen(w0);
    this.user.dx+=sp.x-s1.x; this.user.dy+=sp.y-s1.y;
    this.dirty=true;
  }

  // ---- Label geometry: shared source of truth, greedy multi-slot placement ----
  labelMetrics(){
    const fs=Math.max(8, Math.min(20, this.scale*13));
    const key=[fs.toFixed(2),this.view.kx.toFixed(3),this.view.ky.toFixed(3),
               this.user.z.toFixed(3),this.user.dx|0,this.user.dy|0,this.w|0,this.h|0].join("_");
    if(this._lp && this._lp.key===key) return this._lp;
    const ctx=this.ctx, dot=9.8;   // matches the larger station radius (base 4.6 + up to 5.0 heat)
    ctx.save();
    ctx.font=`400 ${fs}px 'Martian Mono','SFMono-Regular',monospace`;
    const h=fs*1.18, g=5;
    const CAND=[
      {dx:0,      dy: dot+fs*0.62,          al:"center"},
      {dx:0,      dy:-dot-fs*1.35,          al:"center"},
      {dx: dot+g, dy:-fs*0.59,              al:"left"  },
      {dx:-dot-g, dy:-fs*0.59,              al:"right" },
      {dx:0,      dy: dot+fs*0.62+fs*1.5,   al:"center"},
      {dx:0,      dy:-dot-fs*2.85,          al:"center"},
      {dx: dot+g, dy: dot+fs*0.95,          al:"left"  },
      {dx:-dot-g, dy: dot+fs*0.95,          al:"right" },
      {dx: dot+g, dy:-dot-fs*1.55,          al:"left"  },
      {dx:-dot-g, dy:-dot-fs*1.55,          al:"right" },
      {dx:0,      dy: dot+fs*0.62+fs*3.0,   al:"center"},
      {dx:0,      dy:-dot-fs*4.35,          al:"center"}
    ];
    const plateX=(c,sx,tw)=> c.al==="center" ? sx-tw/2-3 : (c.al==="left" ? sx+c.dx-3 : sx+c.dx-tw-3);
    const meta=NODES.map(n=>{
      const sc=this.toScreen(n);
      return {id:n.id, tw:ctx.measureText(n.n.toUpperCase()).width, sx:sc.x, sy:sc.y};
    });
    const order=meta.slice().sort((a,b)=>b.tw-a.tw);
    const placed=[], rows=new Array(NODES.length).fill(0);
    for(const m of order){
      let best=0, bestScore=-Infinity;
      for(let ci=0; ci<CAND.length; ci++){
        const c=CAND[ci], ly=m.sy+c.dy, x0=plateX(c,m.sx,m.tw);
        const r={x0, x1:x0+m.tw+6, y0:ly-1, y1:ly+h};
        let hits=0;
        for(const q of placed) if(r.x0<q.x1&&q.x0<r.x1&&r.y0<q.y1&&q.y0<r.y1) hits++;
        const clipped=(r.x0<0||r.x1>this.w||r.y0<0||r.y1>this.h)?1:0;
        const score = -hits*100 - clipped*60 - ci;
        if(score>bestScore){ bestScore=score; best=ci }
      }
      rows[m.id]=best;
      const cb=CAND[best], lyb=m.sy+cb.dy, xb=plateX(cb,m.sx,m.tw);
      placed.push({x0:xb, x1:xb+m.tw+6, y0:lyb-1, y1:lyb+h});
    }
    ctx.restore();
    this._lp={key, fs, h, dot, CAND, rows, plateX};
    return this._lp;
  }
  labelRect(n, ctx, m){
    m=m||this.labelMetrics();
    const s=this.toScreen(n);
    const txt=n.n.toUpperCase();
    ctx.font=`400 ${m.fs}px 'Martian Mono','SFMono-Regular',monospace`;
    const tw=ctx.measureText(txt).width, row=m.rows[n.id], c=m.CAND[row];
    const x0=m.plateX(c, s.x, tw);
    return {txt, tw, x0, ly:s.y+c.dy, al:c.al, sx:s.x, sy:s.y, h:m.h, row};
  }

  visiblePaths(){
    if(!this.opts.showAggregate) return [];
    const f=Store.filter, ps=Store.paths;
    if(f.type==="blank") return [];
    if(f.type==="recent") return ps.slice(-12);
    if(f.type==="cat")    return ps.filter(p=>p.nodes.some(i=>NODES[i].c===f.c));
    if(f.type==="outlier"){const A=this.A; return A&&A.outlier?[A.outlier]:[]}
    if(f.type==="heaviest"){
      const A=this.A; if(!A) return ps;
      const top=new Set(A.edgeList.slice(0,5).map(e=>e.k));
      return ps.filter(p=>{
        for(let i=0;i<p.nodes.length-1;i++){
          const a=p.nodes[i],b=p.nodes[i+1];
          if(top.has(a<b?a+"-"+b:b+"-"+a)) return true;
        } return false;
      });
    }
    if(f.type==="longest"){ const A=this.A; return A&&A.longest?[A.longest]:[] }
    if(f.type==="signature"){
      const A=this.A; if(!A||!A.repeatTop) return [];
      // every path whose ordered route matches the top-repeat route key
      return ps.filter(p=>p.nodes.join(">")===A.repeatTop.rk);
    }
    if(f.type==="uniques"){
      const A=this.A; if(!A) return ps;
      // routes that appear exactly once — one traveller, one path
      return ps.filter(p=>A.routeKey.get(p.nodes.join(">"))===1);
    }
    if(f.type==="fourline"){
      // paths whose stations span all four categories
      return ps.filter(p=>{
        const cs=new Set(p.nodes.map(i=>NODES[i].c));
        return cs.size===4;
      });
    }
    return ps;
  }
  gravity(){
    if(!this.opts.showAggregate) return null;
    const A=this.A; if(!A||!A.total) return null;
    let sx=0,sy=0,s=0;
    NODES.forEach(n=>{const w=A.traffic[n.id]; sx+=n.x*w; sy+=n.y*w; s+=w});
    if(!s) return null;
    return {x:sx/s, y:sy/s, k:Math.min(1, s/(A.total*6))};
  }
  drawAggregate(){
    const c=this.aggCache.getContext("2d");
    const dpr=Math.min(devicePixelRatio||1,2);
    c.setTransform(dpr,0,0,dpr,0,0);
    c.clearRect(0,0,this.w,this.h);
    if(!this.opts.showAggregate){ this.dirty=false; return }
    const theme=this.theme, dark=theme==="dark";
    c.globalCompositeOperation = dark?"lighter":"multiply";
    const g=this.gravity();
    const paths=this.visiblePaths();
    const focus=this.focus;
    const solo = Store.filter.type==="outlier";
    for(const p of paths){
      const pts=splinePoints(pathPts(p), g).map(q=>this.toScreen(q));
      let a = p.seeded ? (dark?0.19:0.14) : (dark?0.36:0.27);
      let lw = p.seeded?1.1:1.9;
      if(solo){ a = dark?0.95:0.78; lw = 3.6 }
      else if(Store.filter.type==="heaviest"){ a*=1.5; lw+=0.5 }
      if(focus && focus.type==="path"){ const on=focus.id===p.id; a=on?(dark?.95:.8):a*.18; lw=on?3.4:lw }
      if(focus && focus.type==="cat"){ const on=p.nodes.some(i=>NODES[i].c===focus.c); if(!on) a*=.16 }
      if(focus && focus.type==="node"){ const on=p.nodes.includes(focus.id); if(!on) a*=.2; else a*=1.7 }
      // "paths" (cascade) dims every underlying path uniformly — the motion overlay
      // brightens one at a time on top, so we don't want any base-layer boosting.
      if(focus && focus.type==="paths"){ a*=.14 }
      strokeGradientPath(c, pts, p.nodes.map(i=>NODES[i].c), theme,
        {lineWidth:lw, alpha:a});
    }
    c.globalCompositeOperation="source-over"; c.globalAlpha=1;
    this.dirty=false;
  }
  loop(ts){
    this.A = analyse(Store.paths);
    if(this.dirty) this.drawAggregate();
    const ctx=this.ctx, theme=this.theme, dark=theme==="dark";
    const bg=this.css("--bg"), ink=this.css("--ink"), ink2=this.css("--ink-2");
    ctx.clearRect(0,0,this.w,this.h);
    ctx.fillStyle=bg; ctx.fillRect(0,0,this.w,this.h);
    this.pulse=ts/1000;

    const inj=this.inject;
    let dim=1;
    if(inj && this.opts.showAggregate){
      const e=(ts-inj.t0)/1000;
      dim = e<0.35 ? 1-(e/0.35)*0.85 : (e>2.6 ? 0.15+Math.min(1,(e-2.6)/0.9)*0.85 : 0.15);
      if(e>3.8) this.inject=null;
    }
    if(this.opts.showAggregate){
      ctx.save(); ctx.globalAlpha=dim;
      ctx.drawImage(this.aggCache,0,0,this.w,this.h);
      ctx.restore();
    }

    if(this.opts.showAggregate && this.focus && this.focus.type==="edge"){
      const e=this.focus.e;
      const pts=splinePoints([NODES[e.a],NODES[e.b]].map(n=>({x:n.x,y:n.y})), this.gravity()).map(q=>this.toScreen(q));
      ctx.save(); ctx.globalCompositeOperation=dark?"lighter":"source-over";
      ctx.strokeStyle=catColor(NODES[e.a].c,theme); ctx.lineWidth=4; ctx.globalAlpha=.55+Math.sin(this.pulse*2.4)*.2;
      ctx.beginPath(); pts.forEach((q,i)=> i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)); ctx.stroke(); ctx.restore();
    }
    if(this.opts.showAggregate && this.focus && this.focus.motion){
      this.drawMotion(ctx, ts, theme, dark);
    }

    const A=this.A;
    const lm=this.labelMetrics();
    const liveNodes = (this.opts.showAggregate && Store.filter.type!=="all")
      ? new Set(this.visiblePaths().flatMap(p=>p.nodes)) : null;

    for(const n of NODES){
      const s=this.toScreen(n);
      const traffic = this.opts.showAggregate ? (A.traffic[n.id]||0) : 0;
      const heat = (this.opts.showAggregate && A.total) ? Math.min(1,traffic/Math.max(3,A.total*0.35)) : 0;
      const col=catColor(n.c,theme);
      let em=1;
      if(liveNodes && liveNodes.size) em = liveNodes.has(n.id)?1:.24;
      if(this.focus){
        if(this.focus.type==="node") em = this.focus.id===n.id?1:.22;
        if(this.focus.type==="cat")  em = this.focus.c===n.c?1:.22;
        if(this.focus.type==="edge") em = (this.focus.e.a===n.id||this.focus.e.b===n.id)?1:.22;
        if(this.focus.type==="path"){const p=Store.paths.find(x=>x.id===this.focus.id); em=p&&p.nodes.includes(n.id)?1:.22}
      }
      const active = this.draft && this.draft.nodes.includes(n.id);
      const hot = this.hot===n.id;
      // Physical scaling in response to bulletin motions — "the busiest station"
      // bulletin now actually makes that dot bigger and breathe. Category glow
      // does the same on every node in the line, staggered by node id so the
      // group ripples rather than pulsing in unison.
      let focusScale = 1;
      if(this.focus && this.focus.motion && this.opts.showAggregate && !this.inject){
        // While an injection animation is playing, hold the nodes at their base
        // size — the injection is the only motion on the map for those 3–4s.
        const T = (ts - (this.focusT0||ts)) / 1000;
        if(this.focus.motion==="pulse" && this.focus.type==="node" && this.focus.id===n.id){
          focusScale = 1.55 + 0.55*Math.sin(T*2.6);
        } else if(this.focus.motion==="glow" && this.focus.type==="cat" && this.focus.c===n.c){
          focusScale = 1.18 + 0.20*Math.sin(T*1.5 + n.id*0.42);
        } else if(this.focus.motion==="traverse" && this.focus.type==="path"){
          // Punch each station on the focused path slightly, so it reads as
          // "these are the stations that path visits" without the trail alone.
          const p = Store.paths.find(x=>x.id===this.focus.id);
          if(p && p.nodes.includes(n.id)) focusScale = 1.15 + 0.08*Math.sin(T*3 + n.id*0.3);
        }
      }
      // stations must read clearly as "stations" from a projector at the back of a room even
      // with zero data — traffic makes them bigger and brighter, it must never be what makes
      // them visible at all.
      const r=(4.6+heat*5.0)*(this.opts.role==="tablet"?1.2:1)*focusScale;

      if(this.opts.showAggregate && heat>0.05 && !this.opts.interactive){
        const ph=((this.pulse*0.5)+(n.id*0.137))%1;
        ctx.save(); ctx.globalAlpha=(1-ph)*0.22*heat*em;
        ctx.strokeStyle=col; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(s.x,s.y,r+ph*26,0,7); ctx.stroke(); ctx.restore();
      }
      if(active||hot){
        ctx.save(); ctx.globalAlpha=hot&&!active?.35:.75;
        ctx.strokeStyle=col; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(s.x,s.y,r+8+(active?Math.sin(this.pulse*4)*1.5:0),0,7); ctx.stroke(); ctx.restore();
      }
      ctx.save();
      // a faint permanent tint under the ring — idle stations still read as filled markers,
      // not empty holes, before any data exists
      ctx.beginPath(); ctx.arc(s.x,s.y,r,0,7);
      ctx.fillStyle = (active||heat>0.5) ? col : this.css("--node-fill");
      ctx.globalAlpha=em; ctx.fill();
      if(!(active||heat>0.5)){
        ctx.beginPath(); ctx.arc(s.x,s.y,r,0,7);
        ctx.fillStyle=col; ctx.globalAlpha=em*(dark?0.16:0.12); ctx.fill();
      }
      ctx.globalAlpha=em;
      ctx.lineWidth=2.1; ctx.strokeStyle=col; ctx.stroke();
      ctx.restore();

      if(this.opts.labels){
        const L=this.labelRect(n, ctx, lm);
        ctx.save();
        ctx.textBaseline="top";
        const my=L.ly+L.h/2, gap=Math.abs(my-s.y);
        if(gap > r+lm.fs*1.1){
          ctx.globalAlpha=em*.32; ctx.strokeStyle=col; ctx.lineWidth=1;
          const above = my < s.y;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y+(above?-r-1:r+1));
          ctx.lineTo(s.x, above?L.ly+L.h+1:L.ly-1);
          ctx.stroke();
        }
        ctx.globalAlpha=em*(dark?.7:.86);
        ctx.fillStyle=bg;
        ctx.fillRect(L.x0, L.ly-1, L.tw+6, L.h);
        ctx.globalAlpha=em*(active||hot?1:.92);
        ctx.fillStyle=(active||hot)?ink:ink2;
        ctx.textAlign="left";
        ctx.fillText(L.txt, L.x0+3, L.ly);
        ctx.restore();
      }
    }

    if(this.draft && this.draft.nodes.length){
      // The pointer tail (live cursor while dragging) has no station and no colour.
      // Treat it as the same colour as the current tip so the visible rubber-band
      // extends the last segment cleanly — the gradient completes AT the last
      // placed station and the tail carries that station's colour outward.
      const worldPts = this.draft.nodes.map(i=>({x:NODES[i].x,y:NODES[i].y}));
      const cats = this.draft.nodes.map(i=>NODES[i].c);
      if(this.draft.pointer){
        worldPts.push(this.draft.pointer);
        cats.push(cats[cats.length-1]);
      }
      const sp=splinePoints(worldPts,null).map(q=>this.toScreen(q));
      strokeGradientPath(ctx, sp, cats, theme, {lineWidth:3, alpha:.95});
    }

    if(inj && this.opts.showAggregate){
      const e=(ts-inj.t0)/1000;
      const pts=splinePoints(pathPts(inj.path), this.gravity()).map(q=>this.toScreen(q));
      const cats=inj.path.nodes.map(i=>NODES[i].c);
      // colour cues at the head/ring use the tip's colour (the station the reveal
      // is currently arriving at), matching the last-drawn segment's end.
      const prog=Math.max(0,Math.min(1,(e-0.3)/1.9));
      const cut=Math.floor(prog*(pts.length-1));
      const tipCat = cats[Math.min(cats.length-1, Math.floor(cut/SPLINE_STEPS)+1)];
      const tipCol = catColor(tipCat, theme);
      const alpha = e>2.6 ? Math.max(0,1-(e-2.6)/1.0) : 1;
      strokeGradientPath(ctx, pts, cats, theme, {
        lineWidth:3.4, alpha, composite: dark?"lighter":"source-over", lastCutIndex: cut
      });
      ctx.save();
      ctx.globalCompositeOperation=dark?"lighter":"source-over";
      if(prog<1 && pts[cut]){
        const h=pts[cut];
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(h.x,h.y,5.5,0,7); ctx.fillStyle=dark?"#fff":tipCol; ctx.fill();
        ctx.globalAlpha=.35*alpha; ctx.beginPath(); ctx.arc(h.x,h.y,16,0,7); ctx.fillStyle=tipCol; ctx.fill();
      }
      if(prog>=1){
        const rr=(e-2.2)*230;
        if(rr>0&&rr<420){
          const last=pts[pts.length-1];
          ctx.globalAlpha=Math.max(0,.6-rr/420*.6);
          ctx.strokeStyle=tipCol; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(last.x,last.y,rr,0,7); ctx.stroke();
        }
      }
      ctx.restore();
    }
    requestAnimationFrame(this.loop);
  }
  playInjection(path){ this.inject={path, t0:performance.now()}; }
  setFocus(f){
    this.focus=f;
    // reset the motion clock so every new bulletin starts its animation at t=0,
    // otherwise a cascade of 8 paths joined mid-cycle would show whatever path was
    // "current" in the previous bulletin's timeline.
    this.focusT0=performance.now();
    this.dirty=true;
  }

  /* --------------------------------------------------------------------------
     MOTIONS — overlays that sit on top of the dimmed aggregate. Each motion
     type is a canvas draw call driven by (ts - focusT0), so they animate
     continuously as long as the same focus is active. No state between frames.
     -------------------------------------------------------------------------- */
  drawMotion(ctx, ts, theme, dark){
    const f = this.focus; if(!f || !f.motion) return;
    // Suppress motion overlays while an injection animation is running — the
    // injection is the sole animation during a cast and we don't want a
    // traversing token, pulse ring or cascade drawing over it. (The projection's
    // Store.sub already delays the insight bulletin until injection is done;
    // this guard covers any other scenario that sets focus mid-injection.)
    if(this.inject) return;
    const T = (ts - (this.focusT0||ts)) / 1000;
    const g = this.gravity();

    // -- helpers ----------------------------------------------------------
    const traverseAlong = (worldIds, cycleSec, col) => {
      if(!worldIds || worldIds.length<2) return;
      const wp = worldIds.map(i=>NODES[i]);
      const sp = splinePoints(wp.map(p=>({x:p.x,y:p.y})), g).map(q=>this.toScreen(q));
      const t = (T % cycleSec) / cycleSec;
      const idx = Math.min(sp.length-1, Math.floor(t * (sp.length-1)));
      const trailLen = Math.min(28, idx);
      ctx.save();
      ctx.globalCompositeOperation = dark?"lighter":"source-over";
      ctx.strokeStyle = col; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.lineWidth = 3.4;
      for(let i=idx-trailLen; i<idx; i++){
        if(i<0) continue;
        const a = (i - (idx-trailLen))/trailLen;
        ctx.globalAlpha = a*a * (dark?0.95:0.7);
        ctx.beginPath(); ctx.moveTo(sp[i].x,sp[i].y); ctx.lineTo(sp[i+1].x,sp[i+1].y); ctx.stroke();
      }
      const h = sp[idx];
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(h.x, h.y, 16, 0, 7);
      ctx.fillStyle = col; ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(h.x, h.y, 5.5, 0, 7);
      ctx.fillStyle = dark?"#fff":col; ctx.fill();
      ctx.restore();
    };

    if(f.motion === "traverse"){
      let ids = null;
      if(f.type === "edge") ids = [f.e.a, f.e.b];
      else if(f.type === "path"){
        const p = Store.paths.find(x=>x.id===f.id);
        if(p) ids = p.nodes;
      }
      if(!ids) return;
      const col = catColor(NODES[ids[0]].c, theme);
      traverseAlong(ids, ids.length<=2 ? 2.2 : 3.2, col);
    }
    else if(f.motion === "pulse"){
      if(f.type !== "node") return;
      const n = NODES[f.id]; const s = this.toScreen(n);
      const col = catColor(n.c, theme);
      // two out-of-phase rings so there's always something visibly expanding
      for(const off of [0, 0.5]){
        const t = ((T*0.55)+off) % 1;
        ctx.save();
        ctx.globalAlpha = (1-t) * (dark?0.7:0.5);
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, 14 + t*68, 0, 7); ctx.stroke();
        ctx.restore();
      }
      // and a solid core scaling with the beat so the station itself grows
      const beat = 0.5 + 0.5*Math.sin(T*3);
      ctx.save();
      ctx.globalAlpha = 0.28*beat;
      ctx.beginPath(); ctx.arc(s.x, s.y, 22, 0, 7);
      ctx.fillStyle = col; ctx.fill();
      ctx.restore();
    }
    else if(f.motion === "glow"){
      if(f.type !== "cat") return;
      const cs = NODES.filter(n=>n.c === f.c);
      const col = catColor(f.c, theme);
      for(const n of cs){
        const sp = this.toScreen(n);
        // staggered per node so the whole line "breathes"
        const t = ((T*0.6) + n.id*0.07) % 1;
        ctx.save();
        ctx.globalAlpha = (1-t) * (dark?0.55:0.4);
        ctx.strokeStyle = col; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 10 + t*44, 0, 7); ctx.stroke();
        ctx.restore();
      }
    }
    else if(f.motion === "cascade"){
      const ids = f.ids || []; if(!ids.length) return;
      const per = 1.7;                          // seconds per path
      const total = per * ids.length;
      const t = T % total;
      const idx = Math.min(ids.length-1, Math.floor(t / per));
      const phase = (t - idx*per) / per;        // 0..1 within one path's window
      const p = Store.paths.find(x=>x.id===ids[idx]); if(!p) return;
      const wp = p.nodes.map(i=>NODES[i]);
      const cats = p.nodes.map(i=>NODES[i].c);
      const sp = splinePoints(wp.map(pt=>({x:pt.x,y:pt.y})), g).map(q=>this.toScreen(q));
      // reveal from head to tail, hold, then fade out — makes each path feel drawn
      const REV=0.55, HOLD=0.82;
      let visN, alpha;
      if(phase < REV){ visN = Math.floor(sp.length * (phase/REV)); alpha = 0.92 }
      else if(phase < HOLD){ visN = sp.length; alpha = 0.92 }
      else { visN = sp.length; alpha = 0.92 * (1 - (phase-HOLD)/(1-HOLD)) }
      strokeGradientPath(ctx, sp, cats, theme, {
        lineWidth:3.2, alpha, composite: dark?"lighter":"source-over",
        lastCutIndex: Math.max(0, visN-1)
      });
      // token at the moving head during the reveal phase — coloured by the segment
      // the head is currently arriving at
      if(phase < REV && visN > 0 && visN < sp.length){
        const h = sp[visN];
        const tipCat = cats[Math.min(cats.length-1, Math.floor(visN/SPLINE_STEPS)+1)];
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(h.x, h.y, 4.5, 0, 7);
        ctx.fillStyle = dark?"#fff":catColor(tipCat, theme); ctx.fill();
        ctx.restore();
      }
    }
  }
}
