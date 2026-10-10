"""ApexTrace - verifica que el navegador pueda servir datos de curvas.
Sin librerías externas, no toca ningún JSON.
"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
MAPS = ROOT/'public'/'data'/'corners-calibrated'
COUNTS = {
'melbourne':14,'shanghai':16,'suzuka':18,'bahrain':15,'jeddah':27,
'miami':19,'imola':19,'monaco':19,'catalunya':14,'montreal':14,
'spielberg':10,'silverstone':18,'spa':19,'hungaroring':14,'zandvoort':14,
'monza':11,'baku':20,'singapore':19,'austin':20,'mexico':17,
'interlagos':15,'lasvegas':17,'losail':16,'abudhabi':16
}
print('ApexTrace: verificador de curvas publicadas')
print('Proyecto:', ROOT)
print('Carpeta esperada por React:', MAPS)
print('En Vercel, esta carpeta debe estar incluida en el commit/despliegue.')
ready = 0
for name, count in COUNTS.items():
    file = MAPS / f'{name}.json'
    if not file.exists():
        print(f'[FALTA] {name}: {file.name}')
        continue
    try:
        data=json.loads(file.read_text(encoding='utf-8'))
        turns=data.get('turns', [])
        good = (
            data.get('schema') == 'apextrace-corners-calibrated-v2' and
            data.get('status') == 'ready' and data.get('year') == 2025 and
            data.get('track') == name and len(turns)==count and
            all(t.get('number')==i+1 and
                isinstance(t.get('mapPosition'), dict) and
                isinstance(t['mapPosition'].get('x'), (int,float)) and
                isinstance(t['mapPosition'].get('y'), (int,float)) and
                0 <= t['mapPosition']['x'] <= 640 and
                0 <= t['mapPosition']['y'] <= 430
                for i,t in enumerate(turns))
        )
        if good:
            ready += 1
            print(f'[OK] {name}: T1-T{count}')
        else:
            print(f'[INVALIDO] {name}: esquema o referencias incompatibles con la web')
    except (OSError, ValueError, TypeError) as e:
        print(f'[ERROR] {name}: {e}')
print(f'RESULTADO LOCAL: {ready}/24 JSON válidos')
if ready < 24:
    print('NOTA: si un archivo falta, ejecuta tools/Instalar_Mapas_Offline.bat.')
print('Si usas Vercel, haz commit de public/data/corners-calibrated y despliega.')
