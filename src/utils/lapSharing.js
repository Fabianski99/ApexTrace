import { normalizeF125Lap } from './f125';

// Files stay in this browser: no cloud upload, analytics or network request.
const LAP_SCHEMA = 'apextrace-f1-lap-v1';
const PACK_SCHEMA = 'apextrace-f1-pack-v1';
export const MAX_IMPORT_FILES = 100;
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_PACK_LAPS = 200;
const MAX_TOTAL_LAPS = 300;

function safeName(name) {
  return String(name || 'f1-25').normalize('NFKD').replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 90);
}

export function toRecorderJSON(lap) {
  if (!lap || lap.game !== 'F1 25') throw new Error('Solo se pueden compartir vueltas de F1 25.');
  // Use an allow-list so that unrelated internal fields or future personal
  // metadata never escape into downloaded files.
  return {
    schema: LAP_SCHEMA,
    id: lap.id,
    game: 'F1 25',
    sessionKey: lap.sessionKey || lap.id,
    filename: lap.filename || `${lap.id}.json`,
    lapNumber: lap.lapNumber,
    track: lap.track,
    car: lap.car,
    date: lap.date,
    valid: lap.valid !== false,
    time: lap.time,
    distance: lap.distance,
    points: (lap.points || []).map(({ pct, t, speed, throttle, brake, gear, rpm, steering, x, z }) => ({
      pct, t, speed, throttle, brake, gear, rpm, steering,
      ...(Number.isFinite(x) && Number.isFinite(z) ? { x, z } : {}),
    })),
  };
}

export function buildSharePack(laps) {
  if (!Array.isArray(laps) || !laps.length) throw new Error('Selecciona al menos una vuelta.');
  if (laps.length > MAX_PACK_LAPS) throw new Error(`Exporta como máximo ${MAX_PACK_LAPS} vueltas a la vez.`);
  return { schema: PACK_SCHEMA, version: 1, exportedAt: new Date().toISOString(), laps: laps.map(toRecorderJSON) };
}

export function parseSharedJSON(value) {
  if (value?.schema === LAP_SCHEMA) return [normalizeF125Lap(value)];
  if (value?.schema === PACK_SCHEMA) {
    if (!Array.isArray(value.laps) || !value.laps.length || value.laps.length > MAX_PACK_LAPS)
      throw new Error(`El paquete debe contener entre 1 y ${MAX_PACK_LAPS} vueltas.`);
    return value.laps.map(normalizeF125Lap);
  }
  throw new Error('Se esperaba una vuelta del Recorder o un paquete exportado de ApexTrace.');
}

export async function readSharedFiles(inputFiles) {
  const files = Array.from(inputFiles || []);
  if (!files.length) return [];
  if (files.length > MAX_IMPORT_FILES) throw new Error(`Selecciona como máximo ${MAX_IMPORT_FILES} archivos por importación.`);
  const result = [];
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.json')) throw new Error(`${file.name}: se necesita un archivo JSON.`);
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: supera el límite de 32 MB.`);
    let raw;
    try { raw = JSON.parse(await file.text()); }
    catch { throw new Error(`${file.name}: no contiene JSON válido.`); }
    let parsed;
    try { parsed = parseSharedJSON(raw); }
    catch (error) { throw new Error(`${file.name}: ${error.message}`); }
    result.push(...parsed);
    if (result.length > MAX_TOTAL_LAPS) throw new Error(`Puedes importar como máximo ${MAX_TOTAL_LAPS} vueltas en una operación.`);
  }
  // Deduplicate within a single import before making one IndexedDB transaction.
  return [...new Map(result.map(lap => [lap.id, lap])).values()];
}

function downloadObject(payload, fileName) {
  const data = new Blob([JSON.stringify(payload)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Keep the object URL through the click/download handoff.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function exportLap(lap) {
  const name = safeName(`${lap.track}_${lap.car}_V${lap.lapNumber}_${Number(lap.time).toFixed(3)}`);
  downloadObject(toRecorderJSON(lap), `ApexTrace_${name}.json`);
}

export function exportLapPack(laps) {
  const pack = buildSharePack(laps);
  downloadObject(pack, `ApexTrace_F125_${laps.length}_vueltas.json`);
}
