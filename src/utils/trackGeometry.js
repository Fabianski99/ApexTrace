// Pure functions: invoked only when a circuit or chosen lap changes, never on playhead frames.
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function resampleLoop(source,n){
  let pts=source.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  if(pts.length<10)return null;
  if(Math.hypot(pts[0].x-pts.at(-1).x,pts[0].y-pts.at(-1).y)>0.001)pts=[...pts,pts[0]];
  const distances=[0];for(let i=1;i<pts.length;i++)distances.push(distances.at(-1)+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y));
  const total=distances.at(-1);if(total<20)return null;
  const out=[];let k=1;
  for(let i=0;i<n;i++){
    const d=total*i/n;while(k<distances.length-1&&distances[k]<d)k++;
    const f=(d-distances[k-1])/(distances[k]-distances[k-1]||1);
    out.push({x:pts[k-1].x+(pts[k].x-pts[k-1].x)*f,y:pts[k-1].y+(pts[k].y-pts[k-1].y)*f});
  }
  return out;
}
export function prepareTrack(coords){
  if(!Array.isArray(coords)||coords.length<15)return null;
  const lat0=coords.reduce((a,c)=>a+c[1],0)/coords.length*Math.PI/180;
  const cx=coords.reduce((a,c)=>a+c[0],0)/coords.length;
  const cy=coords.reduce((a,c)=>a+c[1],0)/coords.length;
  const projected=coords.map(([lon,lat])=>({x:(lon-cx)*111320*Math.cos(lat0),y:(cy-lat)*111320}));
  const loop=resampleLoop(projected,256);if(!loop)return null;
  const minX=Math.min(...loop.map(p=>p.x)),maxX=Math.max(...loop.map(p=>p.x));
  const minY=Math.min(...loop.map(p=>p.y)),maxY=Math.max(...loop.map(p=>p.y));
  const spanX=Math.max(30,maxX-minX),spanY=Math.max(30,maxY-minY);
  const scale=Math.min(550/spanX,342/spanY);
  const normalized=loop.map(p=>({x:320+(p.x-(minX+maxX)/2)*scale,y:209+(p.y-(minY+maxY)/2)*scale}));
  const path=normalized.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')+' Z';
  // Geometry-only bend hints; NOT official FIA corner labels.
  const bends=[];
  for(let i=0;i<256;i++){
    const a=normalized[(i+250)%256],b=normalized[i],c=normalized[(i+6)%256];
    const ux=b.x-a.x,uy=b.y-a.y,vx=c.x-b.x,vy=c.y-b.y;
    const angle=Math.abs(Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy));
    if(angle>.30)bends.push({i,angle,x:b.x,y:b.y});
  }
  const strongest=[];
  for(const bend of bends.sort((a,b)=>b.angle-a.angle)){
    if(strongest.every(p=>Math.min(Math.abs(p.i-bend.i),256-Math.abs(p.i-bend.i))>11))strongest.push(bend);
    if(strongest.length>=15)break;
  }
  return {source:loop,points:normalized,path,span:Math.hypot(spanX,spanY),bends:strongest};
}

const at=(points,pct)=>{const i=clamp(Math.round(pct*4),0,400);return points[i];};
const wrap=(v,n)=>((v%n)+n)%n;
function interpolate(points,phase){
  const n=points.length;const f=wrap(phase,n),i=Math.floor(f),fraction=f-i;
  const a=points[i],b=points[(i+1)%n];return {x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction};
}
/**
 * Fit GPS reference ring to F1 game's world X/Z sampled by % lap distance.
 * Searches direction and start/finish offset. Fit is only accepted if the
 * entire recording is coherent. This prevents presenting arbitrary dots as real positions.
 */
export function alignLapToTrack(track,lap){
  if(!track||!lap?.points||lap.points.length<400)return null;
  const points=lap.points;const N=64;
  const recorded=[];for(let i=0;i<N;i++){
    const p=at(points,i*100/N);
    if(!Number.isFinite(p?.x)||!Number.isFinite(p?.z))return null;
    recorded.push({x:p.x,y:p.z});
  }
  // Guard against malformed/discontinuous UDP motion samples.
  const jumps=recorded.slice(1).map((p,i)=>Math.hypot(p.x-recorded[i].x,p.y-recorded[i].y));
  const median=[...jumps].sort((a,b)=>a-b)[Math.floor(jumps.length/2)];
  if(median<1||jumps.some(d=>d>Math.max(180,median*9)))return null;
  const ref=Array.from({length:N},(_,i)=>interpolate(track.source,i*track.source.length/N));
  const centroid=(arr)=>({x:arr.reduce((v,p)=>v+p.x,0)/arr.length,y:arr.reduce((v,p)=>v+p.y,0)/arr.length});
  const pc=centroid(recorded),qc=centroid(ref);
  const p0=recorded.map(p=>({x:p.x-pc.x,y:p.y-pc.y}));
  const variance=p0.reduce((v,p)=>v+p.x*p.x+p.y*p.y,0);
  if(variance<10000)return null;
  let best={error:Infinity};
  for(const direction of [1,-1])for(let shift=0;shift<N;shift++){
    // Solve rotation+scale and its reflected equivalent, evaluate similarity RMS.
    for(const reflect of [1,-1]){
      let xx=0,xy=0,qvar=0;
      for(let i=0;i<N;i++){
        const q=ref[wrap(shift+direction*i,N)];const x=q.x-qc.x, y=(q.y-qc.y)*reflect;
        xx+=p0[i].x*x+p0[i].y*y;
        xy+=p0[i].y*x-p0[i].x*y;
        qvar+=x*x+y*y;
      }
      const correlation=Math.hypot(xx,xy);
      const errorSq=Math.max(0,(variance-correlation*correlation/(qvar||1))/N);
      if(errorSq<best.error)best={error:errorSq,shift,direction,reflect};
    }
  }
  const rms=Math.sqrt(best.error);
  const lapRange=Math.hypot(
    Math.max(...recorded.map(p=>p.x))-Math.min(...recorded.map(p=>p.x)),
    Math.max(...recorded.map(p=>p.y))-Math.min(...recorded.map(p=>p.y))
  );
  if(!Number.isFinite(rms)||rms/Math.max(lapRange,1)>.20)return null;
  return {phase:best.shift/N,direction:best.direction,quality:1-rms/Math.max(lapRange,1)};
}
export function pointAtPct(track,registration,pct){
  if(!track||!registration)return null;
  const u=registration.phase+registration.direction*clamp(pct,0,100)/100;
  return interpolate(track.points,u*track.points.length);
}
