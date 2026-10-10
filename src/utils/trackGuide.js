/**
 * ApexTrace v0.6 — F1 25 Track Hub metadata.
 * Counts are circuit corner labels, not a geometric algorithm. They provide a
 * navigable index even without a lap. Locations are never fabricated.
 * The community annotation feed is optional and independently identified.
 */
import { circuitId } from './circuits';

const RECORDS = [
  ['Melbourne',14,'🇦🇺','Oceanía','Semipermanente','Cambios de dirección rápidos y frenadas fuertes; prioriza una salida limpia.'],
  ['Shanghai',16,'🇨🇳','Asia','Permanente','La primera secuencia exige paciencia; compara velocidad mínima y aceleración de salida.'],
  ['Suzuka',18,'🇯🇵','Asia','Permanente','Las eses premian la fluidez; no sacrifiques la siguiente curva por la anterior.'],
  ['Bahrain',15,'🇧🇭','Asia','Permanente','Observa la tracción al salir de curvas lentas y la consistencia en frenadas.'],
  ['Jeddah',27,'🇸🇦','Asia','Urbano','Las curvas rápidas encadenadas requieren precisión y entradas estables.'],
  ['Miami',19,'🇺🇸','América','Semipermanente','Alterna curvas rápidas con una zona muy lenta; revisa la tracción de salida.'],
  ['Imola',19,'🇮🇹','Europa','Permanente','Prioriza cambios de dirección suaves y evita perder velocidad en las chicanes.'],
  ['Monaco',19,'🇲🇨','Europa','Urbano','Premia la precisión y la progresividad en acelerador a la salida de curva.'],
  ['Catalunya',14,'🇪🇸','Europa','Permanente','Analiza especialmente la velocidad sostenida y las salidas hacia recta.'],
  ['Montreal',14,'🇨🇦','América','Semipermanente','Controlar las frenadas y salir recto de las chicanes marca diferencias.'],
  ['Spielberg',10,'🇦🇹','Europa','Permanente','Pocas curvas: pequeños errores de tracción tienen un gran impacto.'],
  ['Silverstone',18,'🇬🇧','Europa','Permanente','Combina apoyo a alta velocidad y precisión en secuencias enlazadas.'],
  ['Spa',19,'🇧🇪','Europa','Permanente','Busca continuidad en las curvas rápidas y vigila la velocidad de salida.'],
  ['Hungaroring',14,'🇭🇺','Europa','Permanente','El ritmo depende de enlazar bien las curvas sin comprometer las salidas.'],
  ['Zandvoort',14,'🇳🇱','Europa','Permanente','Las curvas peraltadas requieren referencias de velocidad y acelerador propias.'],
  ['Monza',11,'🇮🇹','Europa','Permanente','Cada frenada de chicane y la salida hacia recta son decisivas.'],
  ['Baku',20,'🇦🇿','Asia','Urbano','Alterna frenadas intensas con una recta extensa; cuida las salidas lentas.'],
  ['Singapore',19,'🇸🇬','Asia','Urbano','Busca consistencia y buena rotación en numerosas curvas lentas.'],
  ['Austin',20,'🇺🇸','América','Permanente','El primer sector enlazado exige precisión; observa la pérdida acumulada.'],
  ['Mexico',17,'🇲🇽','América','Permanente','Revisa velocidad mínima en curvas lentas y estabilidad en zonas rápidas.'],
  ['Interlagos',15,'🇧🇷','América','Permanente','Una buena salida a la recta principal puede decidir toda la vuelta.'],
  ['Las Vegas',17,'🇺🇸','América','Urbano','Las grandes frenadas y las salidas a rectas largas son prioritarias.'],
  ['Losail',16,'🇶🇦','Asia','Permanente','Circuito de ritmo sostenido: compara cuánto acelerador mantienes en apoyo.'],
  ['Abu Dhabi',16,'🇦🇪','Asia','Permanente','Combina velocidad punta con tracción en la parte final del trazado.'],
];
const GUIDE_MAP=Object.fromEntries(RECORDS.map(([id,count,flag,region,type,tip])=>[circuitId(id),{count,flag,region,type,tip}]));
export const guideFor=id=>GUIDE_MAP[circuitId(id)]||{count:0,flag:'🏁',region:'Otro',type:'Circuito',tip:'Compara tus vueltas y estudia cada sección del trazado.'};

// RaceHooks community annotations: MIT, may contain incomplete and/or approximate locations.
// Separate their metadata from the circuit turn-index to avoid mislabeling a turn.
const SLUGS={melbourne:'melbourne',catalunya:'barcelona',hungaroring:'budapest',spielberg:'austria',mexico:'mexico-city',losail:'qatar',abudhabi:'abu-dhabi',lasvegas:'las-vegas'};
// Monza (11 curvas): la fuente RaceHooks solo incluye 7 entradas.
// Las posiciones son REFERENCIAS APROXIMADAS, obtenidas de los patrones de
// dirección/velocidad de las vueltas de Monza incluidas en el proyecto;
// la numeración y los nombres siguen el mapa FIA/F1 2025.
// No son distancias FIA oficiales ni datos del Recorder de otra persona.
// Circuit metadata available through MultiViewer, also consumed by FastF1.
// API corner distances are approximate and intended for visualization.
// Add more circuits here only after their 2025 circuit keys have been confirmed.
const AUTO_2025 = {
  bahrain: { circuitKey:63, count:15, length:5412 },
  baku: { circuitKey:144, count:20, length:6003 },
};
const MONZA_REFERENCE = {
  source: 'ApexTrace: estimación local de Monza (11 curvas; posiciones orientativas)',
  length: 5793,
  turns: [
    [1, 'Prima Variante / Rettifilo', 16.0],
    [2, 'Prima Variante / Rettifilo', 17.7],
    [3, 'Curva Biassono (Grande)', 27.8],
    [4, 'Variante della Roggia', 36.5],
    [5, 'Variante della Roggia', 38.5],
    [6, 'Lesmo 1', 44.3],
    [7, 'Lesmo 2', 50.0],
    [8, 'Variante Ascari', 67.7],
    [9, 'Variante Ascari', 69.9],
    [10, 'Variante Ascari', 72.1],
    [11, 'Curva Alboreto (Parabolica)', 90.0],
  ].map(([number,name,pct])=>({
    number,name,distance:5793*pct/100,approximate:true,origin:'apextrace',
  })),
};
const CACHE_PREFIX='apextrace:corner-guide-v083:';
const promises=new Map();
const timeoutFetch=async (url)=>{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),5500);
  try{const res=await fetch(url,{signal:ctrl.signal,cache:'force-cache'});if(!res.ok)throw Error('HTTP '+res.status);return res.json();}
  finally{clearTimeout(timer);}
};
export const parse=(value,track)=>{
  if(!value||!Array.isArray(value.corners)||!Number.isFinite(value.lapLengthKm)||value.lapLengthKm<1)return null;
  const max=value.lapLengthKm*1000;
  // Never silently truncate/renumber feeds for different variants of a track.
  // E.g. RaceHooks lists 20 corners for Bahrain, FIA GP circuit has 15.
  const expected=guideFor(track).count;
  if(expected && (value.corners.length!==expected ||
      value.corners.some((c,i)=>c.number!==i+1)))return null;
  if(value.circuitId && circuitId(value.circuitId)!==circuitId(track) && value.circuitId!==(SLUGS[circuitId(track)]||''))return null;
  const seen=new Set();
  const corners=value.corners.filter(c=>{
    if(!Number.isInteger(c.number)||c.number<1||c.number>40||seen.has(c.number))return false;
    seen.add(c.number);return true;
  }).map(c=>({number:c.number,name:typeof c.name==='string'?c.name.slice(0,65):'',type:typeof c.type==='string'?c.type:'',distance:Number.isFinite(c.distanceFromSf)&&c.distanceFromSf>=0&&c.distanceFromSf<max?c.distanceFromSf:null,approximate:value._accuracy!=null,origin:'community'}));
  // Nonmonotonic, repeated or out-of-bounds distances cannot be safely mapped.
  if(corners.some(c=>!Number.isFinite(c.distance)) ||
     corners.some((c,i)=>i>0 && c.distance<=corners[i-1].distance))return null;
  return {source:'RaceHooks — anotaciones comunitarias (MIT; orientativas)',length:max,turns:corners};
};
/** Local 2025 circuit notes validated by the offline installer.
 * If missing, try the circuit API once; when unavailable the UI can estimate
 * direction changes from a complete recorded X/Z lap (with a clear disclaimer).
 */
export function parseAutomaticGuide(value,track){
  const key=circuitId(track),count=guideFor(key).count;
  if(value?.schema!=='apextrace-corner-distances-v1'||circuitId(value.track)!==key||
     value.year!==2025||!Array.isArray(value.turns)||value.turns.length!==count||
     !Number.isFinite(value.length)||value.length<1000)return null;
  const turns=[];
  for(const [i,t] of value.turns.entries()){
    if(t.number!==i+1||!Number.isFinite(t.distance)||t.distance<0||t.distance>=value.length||
       (i>0&&t.distance<=turns[i-1].distance))return null;
    turns.push({number:t.number,distance:t.distance,origin:'circuit-2025',approximate:true});
  }
  return {source:value.source||'Información de circuito 2025',length:value.length,turns};
}
function parseMultiviewer2025(value,track){
  const key=circuitId(track),config=AUTO_2025[key];
  if(!config||!Array.isArray(value?.corners)||value.corners.length!==config.count)return null;
  const {length}=config;
  const turns=[];
  for(const [i,c] of value.corners.entries()){
    const distance=Number(c?.length)/10;
    if(Number(c?.number)!==i+1||!Number.isFinite(distance)||distance<0||distance>=length||
      (i>0&&distance<=turns[i-1].distance))return null;
    turns.push({number:i+1,distance,origin:'circuit-2025',approximate:true});
  }
  return {source:'MultiViewer 2025 / FastF1 (distancias aproximadas, no oficiales)',length,turns};
}
export async function loadTurnAnnotations(track){
  const key=circuitId(track); const slug=SLUGS[key]||key;
  if(!key)return null;
  if(promises.has(key))return promises.get(key);
  const task=(async()=>{
    if(AUTO_2025[key]){
      const {circuitKey,count}=AUTO_2025[key];
      // First load the small file downloaded by the offline installer; it also
      // works in published builds when public/data is committed to GitHub.
      try{
        const local=parseAutomaticGuide(await timeoutFetch(`/data/corners-auto/${key}.json`),key);
        if(local)return local;
      }catch{/* Optional: not installed yet. */}
      // Best effort browser fallback. MultiViewer may not authorize a browser
      // origin (CORS); in that case installing locally is the reliable route.
      try{
        const live=parseMultiviewer2025(await timeoutFetch(`https://api.multiviewer.app/api/v1/circuits/${circuitKey}/2025`),key);
        if(live)return live;
      }catch{/* Cross-origin reads can fail; continue safely. */}
      // A compatible community guide is preferable to omitting all locations.
      // Reject mismatched turn counts, order, track variants, or bad distances.
      const slug=SLUGS[key]||key;
      for(const url of [`/data/corners/${slug}.json`,
        `https://raw.githubusercontent.com/racehooks/racehooks-corner-map/main/data/circuits/${slug}.json`]){
        try{const community=parse(await timeoutFetch(url),key);if(community)return community;}catch{}
      }
      return {source:`${key} — ${count} curvas del trazado GP`,length:null,turns:[],warning:
        `No hay posiciones compatibles para ${key}. Ejecuta tools/Instalar_Mapas_Offline.bat con Internet (fuente 2025: ${count} curvas). Se puede intentar una estimación por X/Z si tienes una vuelta completa; sus resultados no son una guía fiable de frenada.`};
    }
    if(key==='monza')return MONZA_REFERENCE;
    try{
      const cached=localStorage.getItem(CACHE_PREFIX+key);
      if(cached){const v=parse(JSON.parse(cached),track);if(v)return v;}
    }catch{/* Storage optional. */}
    const urls=[`/data/corners/${slug}.json`,
      `https://raw.githubusercontent.com/racehooks/racehooks-corner-map/main/data/circuits/${slug}.json`,
      `https://cdn.jsdelivr.net/gh/racehooks/racehooks-corner-map@main/data/circuits/${slug}.json`];
    for(const url of urls){try{
      const json=await timeoutFetch(url),parsed=parse(json,track);
      if(!parsed)continue;
      try{localStorage.setItem(CACHE_PREFIX+key,JSON.stringify(json));}catch{}
      return parsed;
    }catch{}}
    return {source:'Sin ubicaciones comunitarias compatibles',length:null,turns:[],warning:
      'No se encontraron anotaciones verificables. ApexTrace puede estimar posiciones a partir de una vuelta completa con X/Z; no equivalen a un mapa oficial.'};
  })();
  promises.set(key,task);return task;
}
export function numberedTurns(track,annotations){
  const {count}=guideFor(track);
  const known=new Map(annotations?.turns?.map(t=>[t.number,t])||[]);
  return Array.from({length:count},(_,i)=>({number:i+1,label:`T${i+1}`,...(known.get(i+1)||{}),
    pct:Number.isFinite(known.get(i+1)?.pct) ? known.get(i+1).pct : Number.isFinite(known.get(i+1)?.distance)&&Number.isFinite(annotations?.length)&&annotations.length>0 ? 100*known.get(i+1).distance/annotations.length : null}));
}
export function lapTurnStats(lap,turn){
  if(!lap?.points?.length||!Number.isFinite(turn?.pct))return null;
  const data=lap.points.filter(p=>Math.abs(p.pct-turn.pct)<=2.25);
  if(!data.length)return null;
  return {minSpeed:Math.round(Math.min(...data.map(p=>p.speed))),maxBrake:Math.round(Math.max(...data.map(p=>p.brake))),meanThrottle:Math.round(data.reduce((s,p)=>s+p.throttle,0)/data.length)};
}
