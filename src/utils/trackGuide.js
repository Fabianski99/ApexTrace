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
const CACHE_PREFIX='apextrace:corner-guide-v06:';
const promises=new Map();
const timeoutFetch=async (url)=>{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),5500);
  try{const res=await fetch(url,{signal:ctrl.signal,cache:'force-cache'});if(!res.ok)throw Error('HTTP '+res.status);return res.json();}
  finally{clearTimeout(timer);}
};
const parse=(value)=>{
  if(!value||!Array.isArray(value.corners)||!Number.isFinite(value.lapLengthKm)||value.lapLengthKm<1)return null;
  const max=value.lapLengthKm*1000;
  const seen=new Set();
  const corners=value.corners.filter(c=>{
    if(!Number.isInteger(c.number)||c.number<1||c.number>40||seen.has(c.number))return false;
    seen.add(c.number);return true;
  }).map(c=>({number:c.number,name:typeof c.name==='string'?c.name.slice(0,65):'',type:typeof c.type==='string'?c.type:'',distance:Number.isFinite(c.distanceFromSf)&&c.distanceFromSf>=0&&c.distanceFromSf<max?c.distanceFromSf:null,approximate:value._accuracy!=null,origin:'community'}));
  return {source:'RaceHooks — datos comunitarios (MIT)',length:max,turns:corners};
};
export async function loadTurnAnnotations(track){
  const key=circuitId(track);const slug=SLUGS[key]||key;
  if(!key)return null;
  // Las notas comunitarias de Monza son incompletas: no esconder T8–T11.
  if(key==='monza')return Promise.resolve(MONZA_REFERENCE);
  if(promises.has(key))return promises.get(key);
  const task=(async()=>{
    try{const cached=localStorage.getItem(CACHE_PREFIX+key);if(cached){const data=parse(JSON.parse(cached));if(data)return data;}}catch{/* private browser */}
    const urls=[`/data/corners/${slug}.json`,
      `https://raw.githubusercontent.com/racehooks/racehooks-corner-map/main/data/circuits/${slug}.json`,
      `https://cdn.jsdelivr.net/gh/racehooks/racehooks-corner-map@main/data/circuits/${slug}.json`];
    for(const url of urls){try{const json=await timeoutFetch(url),parsed=parse(json);if(!parsed)continue;
      try{localStorage.setItem(CACHE_PREFIX+key,JSON.stringify(json));}catch{/* optional */}
      return parsed;
    }catch{/* try another provider */}}
    return null;
  })();
  promises.set(key,task);return task;
}
export function numberedTurns(track,annotations){
  const {count}=guideFor(track);
  const known=new Map(annotations?.turns?.map(t=>[t.number,t])||[]);
  return Array.from({length:count},(_,i)=>({number:i+1,label:`T${i+1}`,...(known.get(i+1)||{}),
    pct:Number.isFinite(known.get(i+1)?.distance) ? 100*known.get(i+1).distance/annotations.length : null}));
}
export function lapTurnStats(lap,turn){
  if(!lap?.points?.length||!Number.isFinite(turn?.pct))return null;
  const data=lap.points.filter(p=>Math.abs(p.pct-turn.pct)<=2.25);
  if(!data.length)return null;
  return {minSpeed:Math.round(Math.min(...data.map(p=>p.speed))),maxBrake:Math.round(Math.max(...data.map(p=>p.brake))),meanThrottle:Math.round(data.reduce((s,p)=>s+p.throttle,0)/data.length)};
}
