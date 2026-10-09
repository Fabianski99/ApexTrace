/** Convert validated F1 25 Recorder JSON to the exact lap model used by ApexTrace. */
export function normalizeF125Lap(raw) {
  if (!raw || raw.schema !== 'apextrace-f1-lap-v1' || typeof raw.id !== 'string' ||
      !/^f125_[0-9]+_[0-9]+_[0-9]+$/.test(raw.id)) {
    throw new Error('El archivo no es una vuelta compatible de ApexTrace Recorder.');
  }
  if (!Number.isFinite(raw.time) || raw.time <= 0 || raw.time > 600 ||
      !Number.isFinite(raw.distance) || raw.distance < 500 || raw.distance > 12000 ||
      !Array.isArray(raw.points) || raw.points.length !== 401) {
    throw new Error(`Datos incompletos o duración incorrecta en ${raw.id}.`);
  }
  const props = ['pct', 't', 'speed', 'throttle', 'brake', 'gear', 'rpm', 'steering'];
  const points = raw.points.map((point, index) => {
    if (!point || props.some(key => !Number.isFinite(point[key])) ||
        Math.abs(point.pct - index / 4) > .03 || point.t < 0 || point.t > raw.time + .02 ||
        point.speed < 0 || point.speed > 450 || point.throttle < -1 || point.throttle > 101 ||
        point.brake < -1 || point.brake > 101) {
      throw new Error(`La telemetría ${raw.id} contiene un punto inválido (${index}).`);
    }
    const parsed = Object.fromEntries(props.map(key => [key, point[key]]));
    // v0.3 lap files have no coordinates. Treat those as unavailable, never invent a track position.
    for (const axis of ['x', 'z']) {
      const val = point[axis];
      parsed[axis] = Number.isFinite(val) && Math.abs(val) < 100000 ? val : null;
    }
    return parsed;
  });
  const safe = (value, fallback) => typeof value === 'string' && value.trim() ? value.slice(0, 120) : fallback;
  const date = !Number.isNaN(Date.parse(raw.date)) ? raw.date : new Date().toISOString();
  return {
    id: raw.id, sessionKey: safe(raw.sessionKey, raw.id), filename: safe(raw.filename, `${raw.id}.json`),
    game: 'F1 25', track: safe(raw.track, 'Circuito desconocido'),
    car: safe(raw.car, 'Equipo desconocido'), driver: 'Mi piloto',
    date, importedAt: Number.isFinite(raw.importedAt) ? raw.importedAt : Date.now(),
    lapNumber: Number.isInteger(raw.lapNumber) && raw.lapNumber > 0 ? raw.lapNumber : 1,
    time: raw.time, verified: true, valid: raw.valid !== false,
    brakeUnit: '%', distance: raw.distance,
    maxSpeed: Math.round(Math.max(...points.map(point => point.speed))),
    available: { speed: true, throttle: true, brake: true, gear: true, rpm: true, steering: true },
    positionRecorded: points.filter(p => p.x != null && p.z != null).length >= 280,
    points,
  };
}

export const RECORDER_BASE = 'http://127.0.0.1:8765';

export async function fetchRecorder(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${RECORDER_BASE}${path}`, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`El Recorder respondió HTTP ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
