/**
 * Converts between elapsed seconds and lap-distance percentage using F1 25
 * telemetry timestamps. This keeps playback faithful to time: the car moves
 * more slowly through a corner than on a straight.
 * Pure, dependency-free helpers, reused by the Circuit Hub playhead.
 */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function usablePoints(lap) {
  return Array.isArray(lap?.points) && lap.points.length > 1 ? lap.points : null;
}

export function secondsAtPercent(lap, percent) {
  const pts = usablePoints(lap);
  const duration = Number(lap?.time) || 0;
  const pc = clamp(Number(percent) || 0, 0, 100);
  if (!pts) return duration * pc / 100;
  // Most Recorder sessions contain 401 points, but don't assume this.
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (pts[mid].pct < pc) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return clamp(Number(pts[0].t) || 0, 0, duration || Infinity);
  const a = pts[lo - 1], b = pts[lo];
  if (![a.pct, a.t, b.pct, b.t].every(Number.isFinite)) return duration * pc / 100;
  const f = clamp((pc - a.pct) / (b.pct - a.pct || 1), 0, 1);
  return a.t + (b.t - a.t) * f;
}

export function percentAtSeconds(lap, elapsed) {
  const pts = usablePoints(lap);
  const duration = Number(lap?.time) || 0;
  const time = clamp(Number(elapsed) || 0, 0, duration);
  if (!pts) return duration > 0 ? 100 * time / duration : 0;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (pts[mid].t < time) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return clamp(Number(pts[0].pct) || 0, 0, 100);
  const a = pts[lo - 1], b = pts[lo];
  if (![a.pct, a.t, b.pct, b.t].every(Number.isFinite)) return duration > 0 ? 100 * time / duration : 0;
  const f = clamp((time - a.t) / (b.t - a.t || 1), 0, 1);
  return clamp(a.pct + (b.pct - a.pct) * f, 0, 100);
}
