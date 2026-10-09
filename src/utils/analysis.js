export const timeLabel = (seconds, digits = 3) => {
  if (!Number.isFinite(seconds)) return '—';
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(digits).padStart(digits + 3, '0')}`;
};
export const signedTime = seconds => `${seconds > 0 ? '+' : ''}${Number(seconds || 0).toFixed(3)} s`;
export const shortDate = date => new Date(date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
export const sameCarTrack = (a, b) => !!(a && b && a.id !== b.id && a.game === 'F1 25' && b.game === 'F1 25' && a.track === b.track && a.car === b.car);
const nearest = (points, pct) => points[Math.min(points.length - 1, Math.max(0, Math.round(pct / 100 * (points.length - 1))))];

/** Only detect braking/low-speed zones. Labels aren't official circuit turn numbers. */
const MONZA_ZONE_NAMES = [
  [17, 'T1–2 · Variante del Rettifilo'], [37, 'T4–5 · Variante della Roggia'],
  [45, 'T6 · Lesmo 1'], [50, 'T7 · Lesmo 2'],
  [68, 'T8–10 · Variante Ascari'], [90, 'T11 · Curva Alboreto'],
];
function zoneName(track, pct, fallback) {
  if (track !== 'Monza') return fallback;
  const candidate = MONZA_ZONE_NAMES.reduce((a, b) => Math.abs(b[0]-pct) < Math.abs(a[0]-pct) ? b : a);
  return Math.abs(candidate[0]-pct) <= 4.5 ? candidate[1] : fallback;
}
export function findCornerZones(points, track = '') {
  if (!points || points.length < 50) return [];
  const speeds = points.map((_, i) => {
    const sub = points.slice(Math.max(0, i - 4), Math.min(points.length, i + 5));
    return sub.reduce((sum, p) => sum + p.speed, 0) / sub.length;
  });
  const candidates = [];
  for (let i = 12; i < points.length - 12; i++) {
    if (speeds[i] > 255 || speeds[i] !== Math.min(...speeds.slice(i - 6, i + 7))) continue;
    const prior = Math.max(...speeds.slice(i - 26, i));
    const after = Math.max(...speeds.slice(i + 1, i + 27));
    const prominence = Math.min(prior - speeds[i], after - speeds[i]);
    if (prominence > 14) candidates.push({ index: i, pct: points[i].pct, speed: speeds[i], prominence });
  }
  const accepted = [];
  for (const c of candidates.sort((a, b) => b.prominence - a.prominence)) {
    if (accepted.every(x => Math.abs(x.pct - c.pct) > 3.5)) accepted.push(c);
  }
  return accepted.sort((a, b) => a.pct - b.pct).map((c, i) => ({ ...c, label: `Z${i + 1}`, title: zoneName(track, c.pct, `Zona ${i + 1}`) }));
}

export function makeComparison(a, b) {
  if (!sameCarTrack(a, b)) return null;
  const size = Math.min(a.points.length, b.points.length);
  const data = [];
  for (let i = 0; i < size; i++) {
    const p = a.points[i], q = b.points[i];
    data.push({pct: p.pct, tA: p.t, tB: q.t, speedA:p.speed, speedB:q.speed,
      throttleA:p.throttle, throttleB:q.throttle, brakeA:p.brake, brakeB:q.brake,
      gearA:p.gear, gearB:q.gear, rpmA:p.rpm, rpmB:q.rpm, delta: p.t - q.t });
  }
  const corners = findCornerZones(a.points, a.track);
  const sections = Array.from({length: 10}, (_, i) => {
    const start = i * 10, end = (i + 1) * 10;
    const from = nearest(data, start), to = nearest(data, end);
    const slice = data.filter(p => p.pct >= start && p.pct <= end);
    const mean = key => slice.reduce((acc,p) => acc + (p[key] || 0),0) / (slice.length || 1);
    return {index:i, start,end, delta: to.delta-from.delta, minSpeedA:Math.min(...slice.map(p=>p.speedA)),
      minSpeedB:Math.min(...slice.map(p=>p.speedB)), brakeA:mean('brakeA'),brakeB:mean('brakeB'),
      throttleA:mean('throttleA'), throttleB:mean('throttleB')};
  });
  const cornerZones = corners.map((c, index) => {
    const start = index === 0 ? Math.max(0, c.pct - 3.5) : (corners[index-1].pct+c.pct)/2;
    const end = index === corners.length-1 ? Math.min(100,c.pct+4) : (c.pct+corners[index+1].pct)/2;
    return {...c, start, end, delta:nearest(data,end).delta - nearest(data,start).delta};
  });
  return { data, corners:cornerZones, sections, totalDelta: a.time-b.time};
}

export function buildInsights(result, a, b) {
  if (!result) return [];
  const {sections, corners, totalDelta}=result;
  const worst = [...sections].sort((x,y)=>y.delta-x.delta)[0];
  const best = [...sections].sort((x,y)=>x.delta-y.delta)[0];
  const messages = [];
  if (totalDelta > .025) messages.push({type:'warning',title:'La vuelta A es más lenta',body:`La vuelta A tarda ${signedTime(totalDelta)} más que B. El gráfico de delta positivo indica dónde se acumula esa pérdida.`});
  else if (totalDelta < -.025) messages.push({type:'good', title:'La vuelta A es más rápida',body:`La vuelta A aventaja a B por ${Math.abs(totalDelta).toFixed(3)} s. Un delta descendente representa tiempo recuperado.`});
  else messages.push({type:'neutral',title:'Ritmo muy parecido',body:'Los tiempos son casi idénticos. Examina el delta por tramos para ver dónde cambia el ritmo.'});
  if (worst && worst.delta > .035) {
    const minDiff=worst.minSpeedA-worst.minSpeedB;
    messages.push({type:'warning',title:`Mayor pérdida · ${worst.start}–${worst.end}%`,body:`En ese tramo A pierde ${worst.delta.toFixed(3)} s. La velocidad mínima de A es ${Math.abs(Math.round(minDiff))} km/h ${minDiff < 0 ? 'menor' : minDiff > 0 ? 'mayor' : 'diferente (sin cambio neto)'} que la de B. Compara las frenadas y la salida.`});
  }
  if (best && best.delta < -.035) messages.push({type:'good',title:`Mayor ganancia · ${best.start}–${best.end}%`,body:`En este tramo A recupera ${Math.abs(best.delta).toFixed(3)} s respecto a B. Úsalo como referencia para tus siguientes vueltas.`});
  const slowCorner=[...corners].sort((x,y)=>y.delta-x.delta)[0];
  if(slowCorner && slowCorner.delta > .05) messages.push({type:'neutral',title:`Revisa ${slowCorner.label}`,body:`En torno al ${slowCorner.pct.toFixed(1)}% del trazado, la zona de baja velocidad acumula aproximadamente ${slowCorner.delta.toFixed(3)} s de pérdida. Es una detección automática, no una curva oficial.`});
  return messages.slice(0,4);
}
