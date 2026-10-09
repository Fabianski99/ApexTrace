"""ApexTrace v0.6: install the reference track atlas and optional corner notes.

Run once from Windows using Instalar_Mapas_Offline.bat. Uses only Python stdlib.
- Base GeoJSON: bacinger/f1-circuits (MIT)
- Turn notes: racehooks/racehooks-corner-map (MIT, community approximations)
Failures of turn notes do not destroy the base map or existing stored laps.
"""
from pathlib import Path
from urllib.request import urlopen, Request
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'data'
ATLAS = 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson'
ATLAS_LICENSE = 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/LICENSE.md'
CORNERS_BASE = 'https://raw.githubusercontent.com/racehooks/racehooks-corner-map/main'
SLUGS = [
    'melbourne', 'shanghai', 'suzuka', 'bahrain', 'jeddah', 'miami',
    'imola', 'monaco', 'barcelona', 'montreal', 'austria', 'silverstone',
    'spa', 'budapest', 'zandvoort', 'monza', 'baku', 'singapore', 'austin',
    'mexico-city', 'interlagos', 'las-vegas', 'qatar', 'abu-dhabi'
]

def fetch(url):
    with urlopen(Request(url, headers={'User-Agent':'ApexTrace/0.6'}),timeout=18) as res:
        return res.read()

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print('Descargando atlas de trazados F1...')
    try:
        contents = fetch(ATLAS)
        obj = json.loads(contents)
        if obj.get('type') != 'FeatureCollection' or len(obj.get('features', [])) < 24:
            raise ValueError('GeoJSON incompleto')
        (OUT/'f1-circuits.geojson').write_bytes(contents)
        print(f'  OK: {len(obj["features"])} trazados.')
        try:(OUT/'LICENSE_circuits.md').write_bytes(fetch(ATLAS_LICENSE))
        except Exception:print('  Nota: consulta la licencia MIT de bacinger en GitHub.')
    except Exception as err:
        print(f'  AVISO: no se pudo actualizar el atlas: {err}')
        if not (OUT/'f1-circuits.geojson').exists():
            print('  Necesitaras Internet en el navegador para cargar los mapas.')
    target = OUT/'corners'
    target.mkdir(exist_ok=True)
    imported = 0
    print('Descargando ubicaciones de curvas aportadas por la comunidad...')
    for slug in SLUGS:
        try:
            data = fetch(f'{CORNERS_BASE}/data/circuits/{slug}.json')
            obj = json.loads(data)
            if not isinstance(obj.get('corners'),list) or not isinstance(obj.get('lapLengthKm'),(float,int)):
                raise ValueError('sin datos válidos de curvas')
            (target/f'{slug}.json').write_bytes(data)
            imported += 1
        except Exception:
            print(f'  Sin anotaciones de curvas para: {slug}')
    try:(target/'LICENSE_RaceHooks.txt').write_bytes(fetch(f'{CORNERS_BASE}/LICENSE'))
    except Exception:print('  Licencia MIT: https://github.com/racehooks/racehooks-corner-map')
    print(f'Listo: {imported}/{len(SLUGS)} archivos de anotaciones. Los faltantes pueden cargarse en línea.')
    print('Reinicia npm run dev y recarga ApexTrace.')

if __name__=='__main__': main()
