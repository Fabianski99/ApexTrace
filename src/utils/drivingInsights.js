import { circuitId } from './circuits';
/** ApexTrace v0.8 — math over existing F1 25 samples, not synthetic telemetry.
 * This module is pure, called when selected laps or turns change, never per frame.
 * Percentage samples represent distance, not equal durations.
 */
const good = Number.isFinite;
const bound = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function sampleAt(lap, pct) {
  const p = lap?.points;
  if (!Array.isArray(p) || p.length < 2) return null;
  const x = bound(pct, 0, 100) * (p.length - 1) / 100;
  const i = Math.min(p.length - 2, Math.floor(x));
  const fraction = x - i;
  const a = p[i], b = p[i + 1];
  if (!good(a?.t) || !good(b?.t)) return null;
  const interp = key => good(a[key]) && good(b[key]) ? a[key] + (b[key] - a[key]) * fraction : null;
  return { pct: bound(pct,0,100), t: interp('t'), speed: interp('speed'), brake:interp('brake'), throttle:interp('throttle') };
}

export function percentAtSeconds(lap, t) {
  const p=lap?.points;
  if(!p?.length || !good(t)) return null;
  if(t<=p[0].t)return 0;
  if(t>=p.at(-1).t)return 100;
  let l=0,r=p.length-1;
  while(r-l>1){const m=(l+r)>>1;if(p[m].t<t)l=m;else r=m;}
  const duration=p[r].t-p[l].t;
  if(!(duration>0))return 100*l/(p.length-1);
  return 100*(l+bound((t-p[l].t)/duration,0,1))/(p.length-1);
}

/** Delta is A minus B: positive means A loses time during this specific span. */
export function buildDeltaSections(a,b, count=24) {
  if(!a?.points || !b?.points || a.game!=='F1 25' || b.game!=='F1 25' || circuitId(a.track)!==circuitId(b.track))return [];
  return Array.from({length:count},(_,i)=>{
    const start=100*i/count, end=100*(i+1)/count;
    const aa=sampleAt(a,start),ab=sampleAt(a,end),ba=sampleAt(b,start),bb=sampleAt(b,end);
    const delta=aa&&ab&&ba&&bb ? (ab.t-aa.t)-(bb.t-ba.t) : null;
    return {index:i+1,start,end,mid:(start+end)/2,delta,
      state:!good(delta)||Math.abs(delta)<.035?'even':delta>0?'loss':'gain'};
  });
}

/** Best observed non-overlapping minisector per valid lap.
 * The result is a theoretical floor, not a drivably achievable lap time.
 */
export function theoreticalIdeal(laps, track, count=20) {
  const compatible=laps.filter(l=>l.game==='F1 25' && l.verified && l.valid!==false && circuitId(l.track)===circuitId(track) && l.points?.length>=100 && good(l.time) && l.time>0);
  if(compatible.length<2)return null;
  const baseDistance=compatible[0].distance;
  const eligible=compatible.filter(l=>good(l.distance)&&good(baseDistance)&&Math.abs(l.distance-baseDistance)/baseDistance<.03);
  if(eligible.length<2)return null;
  const parts=[];
  for(let i=0;i<count;i++){
    const start=100*i/count,end=100*(i+1)/count;
    const ranked=eligible.map(l=>{const x=sampleAt(l,start),y=sampleAt(l,end);return {lapId:l.id,lapNumber:l.lapNumber,seconds:x&&y?y.t-x.t:null};})
      .filter(row=>good(row.seconds)&&row.seconds>0).sort((a,b)=>a.seconds-b.seconds);
    if(!ranked.length)return null;
    parts.push({start,end,...ranked[0]});
  }
  const best=eligible.reduce((a,b)=>!a||b.time<a.time?b:a,null);
  const ideal=parts.reduce((sum,p)=>sum+p.seconds,0);
  // Guard against protocol precision/noise producing a paradoxically slow theoretical lap.
  return {seconds:Math.min(best.time,ideal),improvement:Math.max(0,best.time-ideal),bestTime:best.time,lapCount:eligible.length,parts};
}

/** Only mark meaningful telemetry events. A slowest point != geometric apex. */
export function markersForTurn(lap, turnItem) {
  if(!lap || !turnItem || !good(turnItem.pct))return [];
  const out=[];
  if(good(turnItem.brake?.startPct))out.push({pct:turnItem.brake.startPct,label:'F',kind:'brake',title:'Inicio del evento de frenada detectado'});
  const low=lap.points.filter(p=>p.pct>=turnItem.startPct && p.pct<=turnItem.endPct && good(p.speed)).sort((a,b)=>a.speed-b.speed)[0];
  if(low)out.push({pct:low.pct,label:'M',kind:'minimum',title:`Punto más lento (${Math.round(low.speed)} km/h). No equivale necesariamente al apex geométrico.`});
  if(good(turnItem.fullThrottlePct))out.push({pct:turnItem.fullThrottlePct,label:'G',kind:'throttle',title:'Primera zona detectada con acelerador ≥ 85 % sostenido'});
  return out;
}

/** Small, actionable and cautious UI copy. Never asserts that a later brake is intrinsically better. */
export function simpleCornerAdvice(item) {
  if(!item)return {tone:'neutral',headline:'Elige una curva',explanation:'Selecciona una curva para estudiar frenada, paso y salida.',action:'Los datos detallados estarán debajo.'};
  if(!item.reference||!good(item.delta))return {tone:'neutral',headline:`Estudia ${item.label} en tu vuelta`,explanation:'Los marcadores muestran lo que registró tu coche, sin compararlo con otro piloto.',action:'Selecciona otra vuelta del mismo circuito para descubrir diferencias.'};
  if(item.delta>.055){
    if(good(item.brakingDifferenceM)&&item.brakingDifferenceM < -9)return {tone:'loss',headline:`Pierdes ${item.delta.toFixed(3)} s en ${item.label}`,explanation:`Frenaste unos ${Math.round(-item.brakingDifferenceM)} m antes que en tu otra vuelta. Eso puede explicar parte de la diferencia, pero no confirma que debas frenar más tarde.`,action:'Revisa la velocidad de entrada y sobre todo la salida antes de experimentar con la frenada.'};
    if(good(item.brakingDifferenceM)&&item.brakingDifferenceM > 9 && good(item.speedDifference) && item.speedDifference < -5)return {tone:'loss',headline:`Pierdes ${item.delta.toFixed(3)} s en ${item.label}`,explanation:'Frenaste después, pero la velocidad mínima fue más baja. La entrada podría estar perjudicando el paso por curva.',action:'Compara cuándo empiezas a soltar el freno y cuándo puedes acelerar de nuevo.'};
    if(good(item.throttleDifference)&&item.throttleDifference < -10)return {tone:'loss',headline:`Pierdes ${item.delta.toFixed(3)} s en ${item.label}`,explanation:'A la salida usaste menos acelerador que en la referencia durante la ventana estudiada.',action:'Revisa si abriste gas más tarde; acelerar antes solo ayuda si mantienes estabilidad y tracción.'};
    return {tone:'loss',headline:`Pierdes ${item.delta.toFixed(3)} s en ${item.label}`,explanation:'Esta curva merece revisión, aunque la telemetría no permite atribuir la pérdida a una sola maniobra.',action:'Observa la velocidad mínima y compara la salida de ambas vueltas.'};
  }
  if(item.delta<-.055)return {tone:'gain',headline:`Ganas ${Math.abs(item.delta).toFixed(3)} s en ${item.label}`,explanation:'En esta parte tu vuelta A fue más rápida. Es una buena referencia personal de conducción.',action:'Comprueba qué mantuviste en la frenada y salida para repetirlo.'};
  return {tone:'neutral',headline:`Ritmo parecido en ${item.label}`,explanation:'Las diferencias de tiempo en este tramo son pequeñas.',action:'Prioriza las curvas que muestran mayores pérdidas antes de modificar esta.'};
}

export function prioritySegments(sections) {
  return sections.filter(s=>good(s.delta)&&s.delta>.05).sort((a,b)=>b.delta-a.delta).slice(0,3);
}
