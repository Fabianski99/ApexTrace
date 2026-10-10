/**
 * F1 25: last-resort corner placement from one recorded lap's world X/Z path.
 * This is an APPROXIMATION, not an FIA corner map or a coaching reference.
 * The first detected bend after start/finish is labeled T1; applies only
 * when a credible complete lap with world-position data exists.
 * Runs once when selected lap changes, never while moving the playhead.
 */
const wrap = (index, length) => (index % length + length) % length;
const average = (values, center, radius) => {
  let total = 0;
  for (let d = -radius; d <= radius; d++) total += values[wrap(center + d, values.length)];
  return total / (2 * radius + 1);
};

export function inferTurnsFromLap(lap, count) {
  if (!Number.isInteger(count) || count < 3 || count > 35 || !Array.isArray(lap?.points)) return null;
  // 400 distinct 0.25%-of-distance samples (the 401st repeats the finish).
  const n = Math.min(400, lap.points.length - 1);
  if (n < 300) return null;
  const pts = lap.points.slice(0, n);
  if (pts.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.z))) return null;
  const coords = pts.map(p => ({ x: p.x, y: p.z }));
  const steps = coords.map((p, i) => {
    const q = coords[(i + 1) % n];
    return Math.hypot(p.x - q.x, p.y - q.y);
  });
  const median = [...steps].sort((a,b) => a-b)[Math.floor(n / 2)];
  // Incomplete, motion-less and discontinuous UDP recordings aren't suitable.
  if (!(median > 0.3) || steps.some(v => v > Math.max(150, median * 15))) return null;
  const bends = coords.map((p, i) => {
    const prev = coords[wrap(i - 4, n)], next = coords[wrap(i + 4, n)];
    const ax = p.x - prev.x, ay = p.y - prev.y;
    const bx = next.x - p.x, by = next.y - p.y;
    const cross = ax * by - ay * bx;
    const dot = ax * bx + ay * by;
    return Math.abs(Math.atan2(cross, dot));
  });
  const smoothed = bends.map((_,i) => average(bends,i,2));
  const localPeaks = [];
  for (let i = 0; i < n; i++) {
    const value = smoothed[i];
    if (value < 0.065) continue;
    if ([-3,-2,-1,1,2,3].some(off => smoothed[wrap(i + off,n)] > value)) continue;
    const p = pts[i];
    localPeaks.push({ index:i, pct:Number.isFinite(p.pct) ? p.pct : i * 100 / n, strength:value });
  }
  // Require enough distinguishable changes of direction. Do not invent
  // additional corner numbers by equally dividing the track.
  if (localPeaks.length < count) return null;
  const selected = [];
  for (const candidate of localPeaks.sort((a,b) => b.strength-a.strength)) {
    const farEnough=selected.every(p => {
      const d = Math.abs(p.index-candidate.index);
      return Math.min(d,n-d) >= Math.max(3,Math.floor(n/count * 0.22));
    });
    if (farEnough) selected.push(candidate);
    if (selected.length === count) break;
  }
  if (selected.length !== count) return null;
  selected.sort((a,b) => a.index-b.index);
  return {
    source: 'Detección automática aproximada de cambios de dirección de tu vuelta (no FIA)',
    length: null,
    inferred: true,
    turns: selected.map((p,i) => ({
      number:i+1, pct:p.pct, approximate:true, origin:'automatic-estimate',
    })),
    warning: 'Curvas estimadas automáticamente a partir de X/Z. La numeración puede desviarse en curvas enlazadas: no es una ubicación oficial ni debe usarse como indicación exacta de frenada.',
  };
}
