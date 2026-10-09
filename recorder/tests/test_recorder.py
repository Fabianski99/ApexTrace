import importlib.util
import json
import math
import struct
import tempfile
import unittest
from pathlib import Path

module_path = Path(__file__).resolve().parents[1] / 'apextrace_recorder.py'
spec = importlib.util.spec_from_file_location('apextrace_recorder', module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def header(packet_id, frame=1, uid=1234567, session_time=0.0, player=0, fmt=2025):
    return struct.pack('<HBBBBBQfIIBB', fmt, 25, 1, 0, 1, packet_id, uid, session_time, frame, frame, player, 255)


def session_packet():
    b = bytearray(header(1) + bytes(720))
    struct.pack_into('<H', b, 33, 2000)
    struct.pack_into('<b', b, 36, 11) # Monza
    return bytes(b)


def participants_packet():
    b = bytearray(header(4) + bytes(1280))
    b[29] = 1
    b[33] = 8 # McLaren team
    return bytes(b)


def lap_packet(frame, lap_number, t, distance, last_ms=0, invalid=0):
    b = bytearray(header(2, frame=frame, session_time=frame/20) + bytes(57 * 22 + 2))
    struct.pack_into('<I', b, 29, last_ms)
    struct.pack_into('<I', b, 33, int(t*1000))
    struct.pack_into('<f', b, 49, distance)
    b[29+33] = lap_number
    b[29+37] = invalid
    b[29+44] = 1
    return bytes(b)


def telemetry_packet(frame):
    b = bytearray(header(6, frame=frame, session_time=frame/20) + bytes(60 * 22 + 3))
    struct.pack_into('<H', b, 29, 240)
    struct.pack_into('<f', b, 31, 0.85)
    struct.pack_into('<f', b, 35, -0.15)
    struct.pack_into('<f', b, 39, 0.5)
    struct.pack_into('<b', b, 44, 6)
    struct.pack_into('<H', b, 45, 12200)
    return bytes(b)


class ProtocolTests(unittest.TestCase):
    def test_official_layout(self):
        self.assertEqual(len(header(2)), 29)
        self.assertEqual(module.parse_header(header(2))['format'], 2025)
        self.assertEqual(module.parse_header(header(6))['packet_id'], 6)
        self.assertEqual(module.parse_session(session_packet()), {'track_length': 2000, 'track_id': 11})
        self.assertEqual(module.parse_team(participants_packet(), 0), 8)
        result = module.parse_telemetry(telemetry_packet(5), 0)
        self.assertEqual(result['gear'], 6)
        self.assertAlmostEqual(result['throttle'], 85, places=2)
        self.assertAlmostEqual(result['brake'], 50, places=2)
        self.assertEqual(result['rpm'], 12200)

    def test_full_lap_saved_and_normalized(self):
        with tempfile.TemporaryDirectory() as tmp:
            rec = module.Recorder(Path(tmp))
            rec.process(session_packet())
            rec.process(participants_packet())
            self.assertEqual(rec.sessions[1234567]['track'], 'Monza')
            self.assertEqual(rec.sessions[1234567]['car'], 'McLaren')
            # 40-second lap on 2 km track; 800 samples at 20 Hz.
            for frame in range(1, 821):
                lap = frame // 801 + 1
                elapsed = ((frame - 1) % 800)/20
                distance = min(1997, elapsed * 50)
                last = 40000 if frame >= 801 else 0
                rec.process(telemetry_packet(frame))
                rec.process(lap_packet(frame, lap, elapsed, distance, last_ms=last))
            files = list(Path(tmp).glob('*.json'))
            self.assertEqual(len(files), 1)
            lap = json.loads(files[0].read_text(encoding='utf-8'))
            self.assertEqual(lap['game'], 'F1 25')
            self.assertEqual(lap['track'], 'Monza')
            self.assertEqual(lap['car'], 'McLaren')
            self.assertTrue(lap['verified'])
            self.assertTrue(lap['valid'])
            self.assertEqual(lap['time'], 40)
            self.assertEqual(len(lap['points']), 401)
            self.assertEqual(lap['points'][-1]['pct'], 100)
            self.assertEqual(lap['points'][-1]['t'], 40)
            self.assertAlmostEqual(lap['points'][250]['brake'], 50, places=2)

    def test_invalid_lap_kept_marked_invalid(self):
        with tempfile.TemporaryDirectory() as tmp:
            rec = module.Recorder(Path(tmp))
            rec.process(session_packet())
            for frame in range(1, 810):
                elapsed = ((frame-1)%800)/20
                distance = min(1997, elapsed * 50)
                rec.process(lap_packet(frame, 1 if frame < 801 else 2, elapsed, distance,
                                       last_ms=40000 if frame >= 801 else 0, invalid=1 if frame == 300 else 0))
                rec.process(telemetry_packet(frame))
            data = rec.recent_laps()
            self.assertEqual(len(data), 1)
            self.assertFalse(data[0]['valid'])

    def test_unsupported_udp_format_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            rec = module.Recorder(Path(tmp))
            rec.process(header(2, fmt=2026))
            self.assertEqual(rec.status()['udpFormat'], 2026)
            self.assertIn('2025', rec.status()['errors'][-1])
            self.assertEqual(rec.saved_count, 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
