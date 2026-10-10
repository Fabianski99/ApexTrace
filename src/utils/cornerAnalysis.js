import { circuitId } from './circuits';
/**
 * ApexTrace v0.7 — análisis descriptivo F1 25.
 * Las coordenadas T proceden de anotaciones aproximadas y los laps guardan
 * 401 muestras por distancia. Nunca se presentan tiempos por curva como FIA.
 * No extraemos datos extra del Recorder ni utilizamos timers durante reproducción.
 */
const finite = Number.isFinite;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const at = (lap, pct) => {
  const points = lap?.points;
  if (!Array.isArray(points) || points.length < 2) return null;
  const pos = clamp(pct, 0, 100) / 100 * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(pos));
  const a = points[i], b = points[i + 1], fraction = pos - i;
  const lerp = (key) => finite(a?.[key]) && finite(b?.[key]) ? a[key] + fraction * (b[key] - a[key]) : null;
  return { pct, t: lerp('t'), speed: lerp('speed'), throttle: lerp('throttle'), brake: lerp('brake') };
};
const looksUsable = lap => Array.isArray(lap?.points) && lap.points.length > 50 && finite(lap.distance) && lap.distance > 0;
const meters = (lap, pct) => pct / 100 * lap.distance;
const round1 = n => Math.round(n * 10) / 10;

/** Frenadas contiguas con histéresis, filtrando pulsaciones minúsculas. */
export function detectBrakingEvents(lap) {
  if (!looksUsable(lap) || lap.available?.brake === false) return [];
  const points = lap.points;
  const events = [];
  let start = -1;
  let lastPressed = -1;
  let peak = 0;
  let peakIndex = -1;
  function close() {
    if (start < 0 || lastPressed < start) return;
    const p = points[start], q = points[lastPressed];
    const duration = q.t - p.t;
    if (finite(duration) && duration >= 0.07 && peak >= 20 && lastPressed - start >= 1) {
      let minSpeed = Infinity;
      let sum = 0;
      for (let k = start; k <= lastPressed; k++) {
        if (finite(points[k].speed)) minSpeed = Math.min(minSpeed, points[k].speed);
        sum += Number(points[k].brake) || 0;
      }
      events.push({id:`brake-${start}`,startPct:p.pct,endPct:q.pct,
        startM:meters(lap,p.pct),endM:meters(lap,q.pct),duration,
        peakBrake:round1(peak),meanBrake:round1(sum/(lastPressed-start+1)),
        minSpeed:finite(minSpeed)?round1(minSpeed):null,
        initialSpeed:round1(p.speed),peakPct:points[peakIndex].pct});
    }
    start = -1;lastPressed = -1;peak = 0;peakIndex = -1;
  }
  for (let i = 0; i < points.length; i++) {
    const brake = Number(points[i].brake) || 0;
    if (start < 0) {
      if (brake >= 14) {start=i;lastPressed=i;peak=brake;peakIndex=i;}
    } else if (brake > 7) {
      lastPressed=i;
      if (brake>peak){peak=brake;peakIndex=i;}
    } else {
      // 1 sample release: smooth isolated telemetry artifacts.
      const upcoming = points[i+1] && Number(points[i+1].brake)>=14;
      if (!upcoming) close();
    }
  }
  close();
  return events;
}

/** Each braking event can belong to ONE numbered turn at most. */
export function assignBrakingToTurns(events, turns) {
  const result = new Map();
  const located = turns.filter(t=>finite(t.pct));
  for (const event of events) {
    const matches = located.map(t=>({t,dist: t.pct-event.endPct}))
      .filter(item=>item.dist>=-1.25 && item.dist<=4.5)
      .sort((a,b)=>Math.abs(a.dist)-Math.abs(b.dist));
    const candidate = matches.find(x=>!result.has(x.t.number));
    if (candidate) result.set(candidate.t.number,event);
  }
  return result;
}

/** Deliberately small, overlap-limited window around a documented turn. */
function boundaries(turn, turns) {
  const centers = turns.filter(t=>finite(t.pct)).sort((a,b)=>a.pct-b.pct);
  const index = centers.findIndex(t=>t.number===turn.number);
  if (index<0) return null;
  const left = index ? (centers[index-1].pct+turn.pct)/2 : 0;
  const right = index<centers.length-1 ? (centers[index+1].pct+turn.pct)/2 : 100;
  const start = clamp(Math.max(left,turn.pct-2.25),0,100);
  const end = clamp(Math.min(right,turn.pct+2.25),0,100);
  if (end-start < 0.2) return null;
  return {start,end};
}

export function analyzeTurn(lap, turn, turns, brakeByTurn) {
  if (!looksUsable(lap) || !finite(turn?.pct)) return null;
  const limits = boundaries(turn,turns);
  if(!limits) return null;
  const {start,end} = limits;
  const points=lap.points.filter(p=>p.pct>=start && p.pct<=end);
  const first=at(lap,start),last=at(lap,end),apex=at(lap,turn.pct);
  if(!first||!last||!finite(first.t)||!finite(last.t))return null;
  const speeds=[first.speed,last.speed,...points.map(p=>p.speed)].filter(finite);
  if (!speeds.length) return null;
  const after=points.filter(p=>p.pct>=turn.pct);
  const throttleMean=after.length ? after.reduce((n,p)=>n+p.throttle,0)/after.length : apex?.throttle;
  // First sustained 85% press within 5% after the approximate apex, not a claim about traction.
  const post=lap.points.filter(p=>p.pct>=turn.pct && p.pct<=Math.min(100,turn.pct+5));
  let fullThrottlePct=null;
  for(let i=0;i<post.length-1;i++){
    if(post[i].throttle>=85&&post[i+1].throttle>=85){fullThrottlePct=post[i].pct;break;}
  }
  const apexToExitSeconds = last.t - (apex?.t ?? last.t);
  const exitAcceleration = finite(apex?.speed) && finite(last.speed) && apexToExitSeconds >= 0.12
    ? round1((last.speed-apex.speed)/(3.6*apexToExitSeconds)) : null;
  const fullThrottleDistance = finite(fullThrottlePct)
    ? round1(meters(lap,fullThrottlePct-turn.pct)) : null;
  const event=brakeByTurn?.get(turn.number)||null;
  return {number:turn.number,label:turn.label,name:turn.name||`Curva ${turn.number}`,
    pct:turn.pct,source:turn.origin||'community',approximate:true,
    startPct:start,endPct:end,segmentMeters:round1(meters(lap,end-start)),
    segmentTime:last.t-first.t,minSpeed:round1(Math.min(...speeds)),
    apexSpeed:finite(apex?.speed)?round1(apex.speed):null,
    exitSpeed:finite(last.speed)?round1(last.speed):null,
    meanExitThrottle:finite(throttleMean)?round1(throttleMean):null,
    fullThrottlePct,fullThrottleDistance,exitAcceleration,brake:event,
  };
}

export function analyzeTurns(lap, turns) {
  if (!looksUsable(lap) || !Array.isArray(turns)) return [];
  const events=detectBrakingEvents(lap),assigned=assignBrakingToTurns(events,turns);
  return turns.map(t=>analyzeTurn(lap,t,turns,assigned)).filter(Boolean);
}

/** Same circuit, with any F1 25 team. Comparison windows are approximate. */
export function compareTurnSamples(current, reference, turns) {
  const original=analyzeTurns(current,turns);
  if(!reference || current?.id===reference.id || current?.game!=='F1 25' || reference?.game!=='F1 25' || circuitId(current?.track)!==circuitId(reference?.track)){
    return original.map(item=>({...item,reference:null,delta:null}));
  }
  const refByTurn=new Map(analyzeTurns(reference,turns).map(t=>[t.number,t]));
  return original.map(item=>{
    const ref=refByTurn.get(item.number)||null;
    return {...item,reference:ref,delta:ref?item.segmentTime-ref.segmentTime:null,
      brakingDifferenceM:item.brake&&ref?.brake?round1(item.brake.startM-ref.brake.startM):null,
      speedDifference:ref?round1(item.minSpeed-ref.minSpeed):null,
      throttleDifference:ref&&finite(item.meanExitThrottle)&&finite(ref.meanExitThrottle)?round1(item.meanExitThrottle-ref.meanExitThrottle):null,
    };
  });
}

export function adviceForTurn(item) {
  if(!item)return [];
  const notes=[];
  if(!item.reference || !finite(item.delta)){
    notes.push('Se muestran datos de una sola vuelta. Selecciona otra vuelta válida del mismo circuito (cualquier equipo) para detectar diferencias.');
  }else if(item.delta>=0.05){
    notes.push(`En este tramo pierdes aproximadamente ${item.delta.toFixed(3)} s respecto a tu referencia propia.`);
    if(finite(item.brakingDifferenceM)&&item.brakingDifferenceM < -12){
      notes.push(`Comienzas la frenada unos ${Math.abs(Math.round(item.brakingDifferenceM))} m antes. Compara si podrías mantener velocidad sin comprometer la salida.`);
    }else if(finite(item.brakingDifferenceM)&&item.brakingDifferenceM > 12&&item.speedDifference < -6){
      notes.push('Frenas más tarde, pero tu velocidad mínima es menor. Revisa si estás prolongando demasiado la frenada o comprometiendo la entrada.');
    }
    if(finite(item.throttleDifference)&&item.throttleDifference < -12){
      notes.push('Mantienes menos acelerador después de la referencia de curva. Comprueba el momento de reapertura del gas y la tracción.');
    }
    if(notes.length===1)notes.push('Compara el gráfico de velocidad y los pedales antes de atribuir la pérdida a un solo factor.');
  }else if(item.delta<=-0.05){
    notes.push(`En este tramo ganas aproximadamente ${Math.abs(item.delta).toFixed(3)} s. Úsalo como referencia en futuras sesiones.`);
    if(finite(item.throttleDifference)&&item.throttleDifference>12)notes.push('Tu acelerador medio de salida es mayor en esta vuelta; comprueba que la ventaja se mantenga hasta la siguiente curva.');
  }else{
    notes.push('El tiempo de este tramo es muy similar al de tu referencia. Examina velocidad y pedales si buscas pequeñas diferencias.');
  }
  if(!item.brake)notes.push('No se ha asociado una frenada significativa a esta curva; puede ser una curva rápida, una zona de levantada de gas o una frenada compartida con otra curva.');
  return notes.slice(0,3);
}

export function summarizeCornerPerformance(items) {
  const comparable=items.filter(x=>finite(x.delta));
  return {measured:items.length,comparable:comparable.length,
    biggestLoss:[...comparable].filter(x=>x.delta>0.035).sort((a,b)=>b.delta-a.delta).slice(0,3),
    biggestGain:[...comparable].filter(x=>x.delta< -0.035).sort((a,b)=>a.delta-b.delta).slice(0,3)};
}
