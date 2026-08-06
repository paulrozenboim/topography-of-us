/* ============================================================
   REHEARSAL DATA — only ever loaded by settings.html.
   Every path this file creates is tagged seeded:true so it can be told apart
   from real casts and cleared independently (see Store.clearSeeded).
   ============================================================ */
"use strict";

const byCat = c => NODES.filter(n=>n.c===c);
function pick(a){ return a[(Math.random()*a.length)|0] }

function randomPath(seeded=true){
  const startCat = pick(["F","F","F","R","R","C","M"]);
  const start = pick(byCat(startCat));
  const nodes=[start.id];
  const len = 3 + Math.floor(Math.random()*4); // 3–6 stops, matches the real min/max spirit
  let cur=start;
  const drift={F:["F","R","C","M","M"],R:["R","C","M","F","C"],C:["C","M","R","C"],M:["M","C","M","R"]};
  for(let i=1;i<len;i++){
    const c=pick(drift[cur.c]);
    const pool=byCat(c).filter(n=>!nodes.includes(n.id))
      .sort((a,b)=>Math.hypot(a.x-cur.x,a.y-cur.y)-Math.hypot(b.x-cur.x,b.y-cur.y)).slice(0,6);
    if(!pool.length) break;
    const nx=pick(pool); nodes.push(nx.id); cur=nx;
  }
  return {id:uid(), t:Date.now()-(seeded?Math.random()*3.6e6:0), nodes, seeded};
}

function seedPaths(n){
  const spines=[
    ["Burnout","Solitude","Stillness","Curiosity"],
    ["Doubt","Vulnerability","Trust"],
    ["Fear","Vulnerability","Care","Belonging"],
    ["Frustration","Conflict","Compromise","Community"],
    ["Grief","Memory","Tradition","Hope"],
    ["Stagnation","Curiosity","Courage"]
  ];
  const out=[];
  for(let i=0;i<n;i++){
    if(Math.random()<0.42){
      const s=pick(spines);
      const cut=Math.max(3,Math.min(s.length, 3+Math.floor(Math.random()*(s.length-2))));
      out.push({id:uid(), t:Date.now()-Math.random()*3.6e6, seeded:true,
        nodes:s.slice(0,cut).map(nm=>NODE_BY_NAME[nm].id)});
    } else out.push(randomPath(true));
  }
  out.forEach(p=>Store.addPath(p,{animate:false}));
}
