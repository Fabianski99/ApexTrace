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
// Solo mantenemos en memoria ubicaciones exitosas. Los fallos de descarga
// deben poder reintentarse al instalar nuevos mapas sin recargar todo el sitio.
const promises=new Map();
const timeoutFetch=async(url,{refresh=false}={})=>{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),7000);
  try {
    const bust=refresh?`${url}${url.includes('?')?'&':'?'}refresh=${Date.now()}`:url;
    const res=await fetch(bust,{signal:ctrl.signal,cache:'no-store'});
    if(!res.ok)throw Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
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
/** Load prevalidated map XY positions generated by the offline installer.
 * No distance-only projection is permitted for circuits of uncertain geometry.
 */
export function parseCalibratedGuide(value,track){
  const key=circuitId(track), expected=guideFor(key).count;
  if(value?.schema!=='apextrace-corners-calibrated-v2'||value.status!=='ready'||
      value.year!==2025||circuitId(value.track)!==key||
      !Array.isArray(value.turns)||value.turns.length!==expected)return null;
  const turns=[];
  for(let i=0;i<value.turns.length;i++){
    const t=value.turns[i],p=t.mapPosition;
    if(t.number!==i+1||!Number.isFinite(p?.x)||!Number.isFinite(p?.y)||
       p.x<0||p.x>640||p.y<0||p.y>430)return null;
    turns.push({number:t.number,mapPosition:{x:p.x,y:p.y},
      origin:'multiviewer-calibrated',approximate:true});
  }
  return {source:`MultiViewer 2025 + calibración geométrica automática (aproximada; error ≈${value.calibration?.rmsMeters??'?'} m)`,
    length:null,turns,calibrated:true};
}
/**
 * Carga mapas precalculados (sin acceso a archivos privados del PC).
 * refresh=true permite comprobar inmediatamente si el instalador creó el JSON
 * en la carpeta public/data del MISMO React que está ejecutándose.
 */
export async function loadTurnAnnotations(track,{refresh=false}={}){
  const key=circuitId(track);
  if(!key)return null;
  if(refresh)promises.delete(key);
  if(promises.has(key))return promises.get(key);
  const path=`/data/corners-calibrated/${key}.json`;
  const task=(async()=>{
    let issue='';
    try{
      const file=await timeoutFetch(path,{refresh});
      const guide=parseCalibratedGuide(file,key);
      if(guide)return {...guide,assetPath:path};
      issue=`El archivo ${path} existe, pero no es compatible con ${key} (año, secuencia, cantidad de curvas o coordenadas).`;
    } catch(error) {
      issue=`No se pudo abrir ${path}: ${error.message}.`;
    }
    // Mantener las referencias visuales existentes, sin afirmar que son oficiales.
    if(key==='monza')return {...MONZA_REFERENCE,assetPath:path,warning:issue};
    if(key==='jeddah'){
      try{
        const guide=parse(await timeoutFetch('/data/corners/jeddah.json',{refresh}),key);
        if(guide)return {...guide,assetPath:'/data/corners/jeddah.json',warning:issue};
      }catch{}
    }
    return {source:'Calibración no disponible',length:null,turns:[],assetPath:path,
      warning:`${issue} La lista T permanece visible, pero no se inventarán posiciones. Si ejecutaste el instalador, comprueba que el JSON esté en el public/data del proyecto React actual; en Vercel debes publicarlo en GitHub y desplegar de nuevo.`};
  })();
  promises.set(key,task);
  // Resultados vacíos o incompatibles nunca quedan memorizados indefinidamente.
  task.then(result=>{if(!result?.turns?.length&&promises.get(key)===task)promises.delete(key);})
      .catch(()=>{if(promises.get(key)===task)promises.delete(key);});
  return task;
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
