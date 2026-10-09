import importlib.util
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'apextrace_recorder.py'
spec = importlib.util.spec_from_file_location('at_http', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LocalApiTests(unittest.TestCase):
    def test_local_http_status_and_cors(self):
        with tempfile.TemporaryDirectory() as tmp:
            recorder = module.Recorder(Path(tmp))
            http = ThreadingHTTPServer(('127.0.0.1', 0), module.make_http_handler(recorder))
            thread = threading.Thread(target=http.serve_forever, daemon=True)
            thread.start()
            try:
                conn = HTTPConnection('127.0.0.1', http.server_address[1], timeout=4)
                conn.request('GET', '/api/status', headers={'Origin': 'http://localhost:5173'})
                response = conn.getresponse()
                body = json.loads(response.read())
                self.assertEqual(response.status, 200)
                self.assertEqual(response.getheader('Access-Control-Allow-Origin'), 'http://localhost:5173')
                self.assertTrue(body['listening'])
                conn.close()
                conn = HTTPConnection('127.0.0.1', http.server_address[1], timeout=4)
                conn.request('GET', '/api/laps', headers={'Origin': 'https://unknown-site.example'})
                response = conn.getresponse()
                body = json.loads(response.read())
                self.assertEqual(body['laps'], [])
                self.assertIsNone(response.getheader('Access-Control-Allow-Origin'))
                conn.close()
            finally:
                http.shutdown()
                thread.join(timeout=2)
                http.server_close()

if __name__ == '__main__':
    unittest.main()
