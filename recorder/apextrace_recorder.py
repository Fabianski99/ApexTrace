"""ApexTrace Recorder v0.4 — F1 25 UDP (2025 format). Python 3.10+, stdlib only.

Captures only the local player's complete laps. Never sends data over the Internet.
Supports EA's 2025 UDP packet format (select 2025 in F1 25 settings).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import socket
import struct
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

FORMAT = 2025
HEADER_LENGTH = 29
MOTION_STRIDE = 60
LAP_STRIDE = 57
TELEMETRY_STRIDE = 60
PARTICIPANT_STRIDE = 57
TRACKS = {
    0: 'Melbourne', 2: 'Shanghai', 3: 'Bahrain', 4: 'Catalunya', 5: 'Monaco',
    6: 'Montreal', 7: 'Silverstone', 9: 'Hungaroring', 10: 'Spa', 11: 'Monza',
    12: 'Singapore', 13: 'Suzuka', 14: 'Abu Dhabi', 15: 'Austin', 16: 'Interlagos',
    17: 'Spielberg', 19: 'Mexico', 20: 'Baku', 26: 'Zandvoort', 27: 'Imola',
    29: 'Jeddah', 30: 'Miami', 31: 'Las Vegas', 32: 'Losail',
    39: 'Silverstone Reverse', 40: 'Spielberg Reverse', 41: 'Zandvoort Reverse',
}
TEAMS = {0:'Mercedes',1:'Ferrari',2:'Red Bull Racing',3:'Williams',4:'Aston Martin',
         5:'Alpine',6:'Racing Bulls',7:'Haas',8:'McLaren',9:'Sauber',
         41:'F1 Generic',104:'Equipo personalizado',129:'Konnersport',154:'APXGP'}


def unpack(fmt: str, data: bytes, offset: int):
    size = struct.calcsize(fmt)
    if offset < 0 or len(data) < offset + size:
        raise ValueError('Paquete UDP incompleto')
    return struct.unpack_from(fmt, data, offset)[0]


def parse_header(data: bytes):
    if len(data) < HEADER_LENGTH:
        raise ValueError('Cabecera incompleta')
    return {
        'format': unpack('<H', data, 0),
        'packet_id': data[6],
        'uid': unpack('<Q', data, 7),
        'session_time': unpack('<f', data, 15),
        'frame': unpack('<I', data, 19),
        'overall_frame': unpack('<I', data, 23),
        'player': data[27],
    }


def parse_lap(data: bytes, idx: int):
    off = HEADER_LENGTH + idx * LAP_STRIDE
    if idx >= 22 or len(data) < off + LAP_STRIDE:
        raise ValueError('Paquete de vueltas incompleto')
    return {
        'last_ms': unpack('<I', data, off),
        'ms': unpack('<I', data, off + 4),
        'distance': unpack('<f', data, off + 20),
        'number': data[off + 33],
        'pit': data[off + 34],
        'invalid': bool(data[off + 37]),
        'driver_status': data[off + 44],
    }


def parse_telemetry(data: bytes, idx: int):
    off = HEADER_LENGTH + idx * TELEMETRY_STRIDE
    if idx >= 22 or len(data) < off + TELEMETRY_STRIDE:
        raise ValueError('Paquete de telemetría incompleto')
    return {
        'speed': unpack('<H', data, off),
        'throttle': round(unpack('<f', data, off + 2) * 100, 3),
        'steering': round(unpack('<f', data, off + 6) * 100, 3),
        'brake': round(unpack('<f', data, off + 10) * 100, 3),
        'gear': unpack('<b', data, off + 15),
        'rpm': unpack('<H', data, off + 16),
    }


def parse_motion(data: bytes, idx: int):
    """2025 UDP PacketMotionData, car stride 60 bytes, X/Z world coordinates."""
    off = HEADER_LENGTH + idx * MOTION_STRIDE
    if idx >= 22 or len(data) < off + MOTION_STRIDE:
        raise ValueError('Paquete de movimiento incompleto')
    x = unpack('<f', data, off)
    z = unpack('<f', data, off + 8)
    if not (math.isfinite(x) and math.isfinite(z) and abs(x) < 100000 and abs(z) < 100000):
        raise ValueError('Coordenadas de movimiento inválidas')
    return {'x': round(x, 3), 'z': round(z, 3)}


def parse_session(data: bytes):
    if len(data) < 39:
        raise ValueError('Paquete de sesión incompleto')
    return {'track_length': unpack('<H', data, 33), 'track_id': unpack('<b', data, 36)}


def parse_team(data: bytes, idx: int):
    off = 30 + idx * PARTICIPANT_STRIDE
    if idx >= 22 or len(data) < off + PARTICIPANT_STRIDE:
        raise ValueError('Participantes incompletos')
    return data[off + 3]


def interpolate_samples(samples: list[dict], track_length: float, lap_time: float):
    """Resample by lap distance, same x axis (401 points) used by ACC viewer."""
    cleaned = []
    max_distance = 0.0
    for item in samples:
        d = item['distance']
        if math.isfinite(d) and d >= 0 and d <= track_length * 1.08:
            if d > max_distance + .01:
                cleaned.append((d, item))
                max_distance = d
    if len(cleaned) < 60 or cleaned[-1][0] < track_length * 0.78:
        raise ValueError('Cobertura insuficiente para comparar esta vuelta')
    if cleaned[0][0] > track_length * .12:
        raise ValueError('La captura comenzó después de la línea de meta')
    # Synthetic start and finish, using official game time for the endpoint.
    first = {**cleaned[0][1], 't': 0.0}
    last = {**cleaned[-1][1], 't': lap_time}
    nodes = [(0.0, first)] + cleaned + [(track_length, last)]
    result = []
    j = 0
    channels = ('t', 'speed', 'throttle', 'brake', 'gear', 'rpm', 'steering')
    for i in range(401):
        distance = track_length * i / 400
        while j + 2 < len(nodes) and nodes[j + 1][0] < distance:
            j += 1
        x0, a = nodes[j]
        x1, b = nodes[j + 1]
        fraction = min(1.0, max(0.0, (distance - x0) / (x1 - x0))) if x1 > x0 else 0.0
        row = {'pct': i / 4}
        for key in channels:
            value = a[key] + (b[key] - a[key]) * fraction
            row[key] = int(round(value)) if key == 'gear' else round(value, 4)
        # Position is optional: never substitute fabricated coordinates.
        for axis in ('x', 'z'):
            v0, v1 = a.get(axis), b.get(axis)
            row[axis] = round(v0 + (v1 - v0) * fraction, 3) if (v0 is not None and v1 is not None) else None
        if i == 400:
            row['t'] = round(lap_time, 4)
        result.append(row)
    return result


class Recorder:
    def __init__(self, folder: Path):
        self.folder = folder
        self.run_id = int(time.time_ns())
        self.folder.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.sessions: dict[int, dict] = {}
        self.frames: dict[tuple, dict] = {}
        self.last_packet_at = 0.0
        self.packet_count = 0
        self.saved_count = len(list(folder.glob('f125_*.json')))
        self.format_detected = None
        self.errors = []
        self.latest = None

    def status(self):
        with self.lock:
            age = time.monotonic() - self.last_packet_at if self.last_packet_at else None
            current = self.sessions.get(self.latest, {}) if self.latest else {}
            return {'recorder': 'ApexTrace v0.4', 'listening': True,
                    'connected': age is not None and age < 3, 'secondsSincePacket': round(age, 1) if age is not None else None,
                    'udpFormat': self.format_detected, 'packets': self.packet_count,
                    'savedLaps': self.saved_count, 'track': current.get('track'),
                    'car': current.get('car'), 'currentLap': current.get('lap_number'),
                    'currentLapMs': current.get('current_ms'), 'errors': self.errors[-3:]}

    def recent_laps(self):
        laps = []
        # Only own f125_*.json files, never follow URL input to a filename.
        for file in self.folder.glob('f125_*.json'):
            try:
                laps.append(json.loads(file.read_text(encoding='utf-8')))
            except (OSError, ValueError):
                pass
        return sorted(laps, key=lambda x: x.get('date', ''), reverse=True)

    def add_error(self, msg):
        if not self.errors or self.errors[-1] != msg:
            self.errors.append(msg)
            self.errors = self.errors[-10:]
            print('[AVISO]', msg, flush=True)

    def process(self, packet: bytes):
        try:
            h = parse_header(packet)
        except ValueError:
            return
        with self.lock:
            self.format_detected = h['format']
            self.last_packet_at = time.monotonic()
            self.packet_count += 1
            if h['format'] != FORMAT:
                self.add_error(f'Formato UDP {h["format"]} no compatible. Selecciona 2025 en F1 25.')
                return
            if h['player'] >= 22:
                return
            uid = h['uid']
            if uid not in self.sessions:
                self.sessions[uid] = {'track': 'Circuito desconocido', 'track_length': 0,
                    'car': 'F1 25 (equipo desconocido)', 'last_sample': None, 'samples': [],
                    'started_from_line': False, 'invalid': False, 'rewind': False,
                    'seq': 0, 'lap_number': 0, 'current_ms': 0, 'last_time': None}
            s = self.sessions[uid]
            self.latest = uid
            if h['packet_id'] == 1:
                try:
                    meta = parse_session(packet)
                    if 500 < meta['track_length'] < 12000:
                        s['track_length'] = meta['track_length']
                    s['track'] = TRACKS.get(meta['track_id'], f'Circuito {meta["track_id"]}')
                except ValueError:
                    pass
            elif h['packet_id'] == 4:
                try:
                    team = parse_team(packet, h['player'])
                    s['car'] = TEAMS.get(team, f'Equipo ID {team}')
                except ValueError:
                    pass
            elif h['packet_id'] == 3 and len(packet) >= 33:
                code = packet[29:33]
                if code == b'FLBK':
                    s['rewind'] = True
                    s['samples'] = []
                    s['started_from_line'] = False
                elif code == b'SEND':
                    s['samples'] = []
                    s['started_from_line'] = False
            elif h['packet_id'] in (0, 2, 6):
                key = (uid, h['overall_frame'])
                entry = self.frames.setdefault(key, {'h': h})
                try:
                    if h['packet_id'] == 0:
                        entry['motion'] = parse_motion(packet, h['player'])
                    elif h['packet_id'] == 2:
                        entry['lap'] = parse_lap(packet, h['player'])
                    else:
                        entry['telemetry'] = parse_telemetry(packet, h['player'])
                except ValueError:
                    return
                # Motion often arrives before the telemetry/lap pair, but can arrive later.
                # Keep a reference to the sample so late coordinates are not lost.
                if not entry.get('accepted') and 'lap' in entry and 'telemetry' in entry:
                    entry['accepted'] = True
                    entry['sample'] = self.accept_sample(s, entry['lap'], entry['telemetry'], h, entry.get('motion'))
                elif entry.get('accepted') and h['packet_id'] == 0 and entry.get('sample'):
                    entry['sample'].update(entry['motion'])
                # Discard any lost packet pairs so memory doesn't grow indefinitely.
                if len(self.frames) > 160:
                    for old in list(self.frames)[:80]:
                        self.frames.pop(old, None)

    def accept_sample(self, session, lap, telem, header, motion=None):
        track_length = session['track_length']
        if track_length < 500:
            return
        if not (math.isfinite(lap['distance']) and 0 <= lap['ms'] <= 600_000):
            return
        if not (0 <= telem['speed'] < 450 and all(-110 <= telem[k] <= 110 for k in ('throttle','brake','steering'))):
            return
        previous = session['last_sample']
        if previous and header['session_time'] < session['last_time'] - 0.25:
            session['rewind'] = True
            session['started_from_line'] = False
            session['samples'] = []
        session['last_time'] = header['session_time']
        sample = {**telem, **(motion or {}), 'distance': lap['distance'], 't': lap['ms']/1000}
        session['lap_number'] = lap['number']
        session['current_ms'] = lap['ms']
        boundary = False
        if previous:
            # Time Trial can reuse lap number. Require an actual timer/distance reset.
            crossed = previous['t'] > 25 and sample['t'] < 10 and sample['distance'] < min(330, track_length*.09)
            increment = lap['number'] == session.get('previous_number', lap['number']) + 1
            boundary = crossed and (increment or lap['last_ms'] >= 25_000)
            if sample['t'] < previous['t'] - .35 and not boundary:
                session['rewind'] = True
                session['started_from_line'] = False
                session['samples'] = []
        if boundary:
            if session['started_from_line'] and not session['rewind'] and lap['last_ms'] > 25_000:
                self.finish_lap(session, lap['last_ms'] / 1000, session['previous_number'])
            session['samples'] = []
            session['invalid'] = False
            session['rewind'] = False
            session['started_from_line'] = True
        elif previous is None and sample['t'] < 5 and sample['distance'] < min(200, track_length*.05):
            session['started_from_line'] = True
        if session['started_from_line'] and not session['rewind']:
            session['invalid'] = session['invalid'] or lap['invalid']
            if lap['pit'] or lap['driver_status'] in (0, 2, 3):
                session['invalid'] = True
            if len(session['samples']) < 18000:
                session['samples'].append(sample)
        session['previous_number'] = lap['number']
        session['last_sample'] = sample
        return sample if session['started_from_line'] and not session['rewind'] else None

    def finish_lap(self, session, elapsed, lap_num):
        if not (25 < elapsed < 600) or len(session['samples']) < 90:
            return
        try:
            points = interpolate_samples(session['samples'], session['track_length'], elapsed)
        except ValueError:
            return
        session['seq'] += 1
        uid = self.latest
        lap_id = f'f125_{uid}_{self.run_id}_{session["seq"]}'
        now = datetime.now(timezone.utc).isoformat()
        result = {
            'schema': 'apextrace-f1-lap-v1', 'id': lap_id, 'game': 'F1 25',
            'sessionKey': f'f125_{uid}', 'filename': lap_id + '.json',
            'lapNumber': max(lap_num or 0, session['seq']), 'track': session['track'],
            'car': session['car'], 'driver': 'Mi piloto', 'date': now,
            'importedAt': int(time.time() * 1000), 'verified': True,
            'valid': not session['invalid'], 'time': round(elapsed, 3),
            'brakeUnit': '%', 'distance': session['track_length'],
            'maxSpeed': round(max(item['speed'] for item in session['samples'])),
            'available': {key: True for key in ('speed','throttle','brake','gear','rpm','steering')},
            'positionRecorded': sum(1 for pt in points if pt.get('x') is not None and pt.get('z') is not None) >= 280,
            'points': points,
        }
        target = self.folder / (lap_id + '.json')
        temporary = target.with_suffix('.json.tmp')
        try:
            temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            os.replace(temporary, target)
            self.saved_count = len(list(self.folder.glob('f125_*.json')))
            state = 'válida' if result['valid'] else 'invalidada'
            print(f'[VUELTA] {session["track"]} / {session["car"]} / {elapsed:.3f}s / {state} → {target.name}', flush=True)
        except OSError as error:
            self.add_error(f'No se pudo guardar: {error}')


# The Recorder listens on loopback only. A public web page may read its API
# ONLY when its exact HTTPS Origin appears in web_origins.txt on this PC.
LOCAL_ORIGIN_PATTERN = re.compile(r'^http://(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$')


def permitted_origins():
    """Explicit user-managed allowlist; never support '*', prefixes or suffix matches."""
    config = Path(__file__).resolve().parent / 'web_origins.txt'
    result = set()
    if not config.exists():
        return result
    for text in config.read_text(encoding='utf-8').splitlines():
        origin = text.strip()
        if not origin or origin.startswith('#'):
            continue
        parsed = urlparse(origin)
        try:
            port_ok = parsed.port in (None, 443)
        except ValueError:
            port_ok = False
        if (parsed.scheme == 'https' and parsed.hostname and port_ok
                and parsed.path in ('', '/') and not parsed.params and not parsed.query
                and not parsed.fragment and not parsed.username and not parsed.password
                and parsed.netloc == parsed.hostname):
            result.add('https://' + parsed.hostname)
        else:
            print(f'[SEGURIDAD] Dominio omitido (se requiere origen HTTPS exacto): {origin}', flush=True)
    return result


def make_http_handler(recorder: Recorder, web_origins=None):
    allowed = set(web_origins if web_origins is not None else permitted_origins())

    class Handler(BaseHTTPRequestHandler):
        def origin_permitted(self):
            origin = self.headers.get('Origin', '')
            return not origin or bool(LOCAL_ORIGIN_PATTERN.fullmatch(origin) or origin in allowed)

        def end_headers(self):
            origin = self.headers.get('Origin', '')
            if origin and self.origin_permitted():
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
                self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type')
                self.send_header('Access-Control-Allow-Private-Network', 'true')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            super().end_headers()

        def do_OPTIONS(self):
            if not self.origin_permitted():
                self.send_error(403, 'Origen web no autorizado')
                return
            self.send_response(204)
            self.end_headers()

        def do_GET(self):
            if not self.origin_permitted():
                self.send_error(403, 'Origen web no autorizado')
                return
            path = urlparse(self.path).path
            if path == '/api/status':
                payload = recorder.status()
            elif path == '/api/laps':
                payload = {'laps': recorder.recent_laps()}
            else:
                self.send_error(404, 'Ruta desconocida')
                return
            body = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt, *args):
            return

    return Handler


def udp_loop(recorder: Recorder, sock: socket.socket, port: int):
    sock.settimeout(1.0)
    print(f'[UDP] Esperando F1 25 en 127.0.0.1:{port} (formato 2025)...', flush=True)
    while True:
        try:
            data, _ = sock.recvfrom(4096)
            recorder.process(data)
        except socket.timeout:
            continue
        except Exception as error:
            recorder.add_error(f'UDP: {error}')


def main():
    parser = argparse.ArgumentParser(description='ApexTrace Recorder para F1 25')
    parser.add_argument('--udp-port', type=int, default=20777)
    parser.add_argument('--http-port', type=int, default=8765)
    parser.add_argument('--data-dir', type=Path, default=Path(__file__).resolve().parent / 'laps')
    args = parser.parse_args()
    recorder = Recorder(args.data_dir)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.bind(('127.0.0.1', args.udp_port))
        http = ThreadingHTTPServer(('127.0.0.1', args.http_port), make_http_handler(recorder))
    except OSError as error:
        sock.close()
        raise SystemExit(f'No se pudieron abrir los puertos UDP {args.udp_port} / HTTP {args.http_port}: {error}')
    origins = permitted_origins()
    if origins:
        print('[WEB] Orígenes HTTPS autorizados: ' + ', '.join(sorted(origins)), flush=True)
    thread = threading.Thread(target=udp_loop, args=(recorder, sock, args.udp_port), daemon=True)
    thread.start()
    print(f'[API] http://127.0.0.1:{args.http_port}/api/status', flush=True)
    print(f'[DATOS] {args.data_dir.resolve()}\nPulsa Ctrl+C para detener.', flush=True)
    try:
        http.serve_forever(poll_interval=.5)
    except KeyboardInterrupt:
        print('\n[STOP] Recorder detenido')
    finally:
        http.server_close()
        sock.close()


if __name__ == '__main__':
    main()
