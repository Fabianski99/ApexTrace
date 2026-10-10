/** ApexTrace v0.8.3: browser-local circuit turn corrections (no network calls). */
import { circuitId } from './circuits';
import { pointAtPct } from './trackGeometry';

const PREFIX='apextrace:manual-turns:v083:';
const safe=(v)=>Number.isFinite(v)&&v>=0&&v<=640;
export const validMapPoint=p=>p&&safe(p.x)&&Number.isFinite(p.y)&&p.y>=0&&p.y<=430;
export function readTurnPlacements(track){
  try{const raw=JSON.parse(localStorage.getItem(PREFIX+circuitId(track))||'{}');
    return Object.fromEntries(Object.entries(raw).filter(([key,p])=>Number.isInteger(+key)&&+key>0&&+key<=40&&validMapPoint(p)));}
  catch{return {};}
}
export function writeTurnPlacement(track,number,point){
  if(!Number.isInteger(number)||number<1||number>40||!validMapPoint(point))return readTurnPlacements(track);
  const next={...readTurnPlacements(track),[number]:{x:+point.x.toFixed(2),y:+point.y.toFixed(2)}};
  try{localStorage.setItem(PREFIX+circuitId(track),JSON.stringify(next));}catch{/* Storage optional */}
  return next;
}
export function removeTurnPlacement(track,number){
  const next={...readTurnPlacements(track)};delete next[number];
  try{localStorage.setItem(PREFIX+circuitId(track),JSON.stringify(next));}catch{/* Storage optional */}
  return next;
}
export function nearestGeometryPoint(geometry,x,y){
  if(!geometry?.points?.length)return null;
  let best=null,dist=Infinity;
  for(const p of geometry.points){const d=(p.x-x)**2+(p.y-y)**2;if(d<dist){dist=d;best=p;}}
  return best ? {...best,distance:Math.sqrt(dist)}:null;
}
export function mappedTurnPct(geometry,lap,mapPoint,registration=null){
  if(!validMapPoint(mapPoint))return null;
  const alignment=registration;if(!alignment)return null;
  let best=null,error=Infinity;
  for(let i=0;i<=400;i++){
    const pct=i/4,p=pointAtPct(geometry,alignment,pct);
    if(!p)continue;
    const d=(p.x-mapPoint.x)**2+(p.y-mapPoint.y)**2;
    if(d<error){best=pct;error=d;}
  }
  // A manually placed label must be near the actual centerline.
  return error<=144?best:null;
}

export function exportTurnPlacements(track){
  const positions=readTurnPlacements(track);
  return JSON.stringify({schema:'apextrace-turns-v1',track:circuitId(track),
    note:'Ubicaciones dibujadas manualmente; no son coordenadas oficiales',
    turns:Object.entries(positions).map(([number,p])=>({number:Number(number),...p}))
      .sort((a,b)=>a.number-b.number)},null,2);
}
