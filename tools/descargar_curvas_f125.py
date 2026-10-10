"""Download 2025 F1 circuit turn positions locally (optional, standard library).

Includes Bahrain GP (15 turns) and Baku GP (20 turns), replacing incompatible or missing community annotations.
Source: MultiViewer Circuit API also used by FastF1's circuit-information flow.
The 'length' field is in decimeters and is converted to meters (/10).
Requires Internet, does not run in the background and NEVER downloads lap data.
Only the validated small output JSON is stored under public/data/corners-auto/.
"""
from pathlib import Path
from urllib.request import Request, urlopen
import json

ROOT=Path(__file__).resolve().parents[1]
DIR=ROOT/'public'/'data'/'corners-auto'
CIRCUITS=[('bahrain',63,15,5412), ('baku',144,20,6003)]

def normalize_api(data, slug, expected, length):
    corners=data.get('corners', [])
    if not isinstance(corners,list) or len(corners)!=expected:
        raise ValueError(f'Esperadas {expected} curvas, recibidas {len(corners)}')
    turns=[]
    for i,c in enumerate(corners):
        if int(c.get('number',-1))!=i+1:
            raise ValueError('Numeracion incompleta/no consecutiva')
        # API lap distance is in decimeters, not a map coordinate.
        dist=float(c['length'])/10
        if not (0<=dist<length):raise ValueError('Distancia fuera del trazado')
        turns.append({'number':i+1,'distance':round(dist,2)})
    if any(b['distance']<=a['distance'] for a,b in zip(turns,turns[1:])):
        raise ValueError('Distancias no crecientes: datos incompatibles')
    return {'schema':'apextrace-corner-distances-v1','track':slug,'year':2025,
            'length':length,'source':'MultiViewer 2025 / FastF1 (curvas aproximadas, no oficiales)',
            'turns':turns}

def main():
    DIR.mkdir(parents=True,exist_ok=True)
    for slug,key,count,length in CIRCUITS:
        url=f'https://api.multiviewer.app/api/v1/circuits/{key}/2025'
        try:
            req=Request(url,headers={'User-Agent':'ApexTrace/0.8.5 (+local circuit guide)'})
            with urlopen(req,timeout=15) as response: data=json.load(response)
            guide=normalize_api(data,slug,count,length)
            target=DIR/f'{slug}.json'
            target.write_text(json.dumps(guide,ensure_ascii=False,indent=2),encoding='utf-8')
            print(f'[OK] {slug}: {len(guide["turns"])} curvas importadas automaticamente a {target}')
        except Exception as e:
            print(f'[AVISO] {slug}: {e}')
            print('Los mapas anteriores no se modifican. Si no hay datos 2025, la estimacion X/Z es solo visual.')

if __name__=='__main__':main()
