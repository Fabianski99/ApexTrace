"""ApexTrace v0.8.9: atlas universal F1 25 (solo biblioteca estándar).

Obtiene el calendario F1 2025 con los circuit_key correctos en OpenF1,
consulta las curvas XY de MultiViewer y las ajusta al trazado GeoJSON.
No se admiten ubicaciones por simple porcentaje de vuelta. Una calibración
incierta se marca PENDIENTE y NO se publica como si fuese precisa.
"""
from __future__ import annotations
import json, math, statistics, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlparse
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public' / 'data'
DEST = DATA / 'corners-calibrated'
YEAR = 2025
URL_MEETINGS = 'https://api.openf1.org/v1/meetings?year=2025'
URL_GEOJSON = 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson'

# Identificadores y totales del circuito GP de F1 25, no variantes de otras temporadas.
CIRCUITS = {
 'melbourne':(14, ['melbourne']), 'shanghai':(16,['shanghai']),
 'suzuka':(18,['suzuka']), 'bahrain':(15,['sakhir','bahrain']),
 'jeddah':(27,['jeddah']), 'miami':(19,['miami']),
 'imola':(19,['imola']), 'monaco':(19,['monaco','montecarlo']),
 'catalunya':(14,['barcelona','catalunya']), 'montreal':(14,['montreal']),
 'spielberg':(10,['spielberg','austria']), 'silverstone':(18,['silverstone']),
 'spa':(19,['spafrancorchamps','spa']), 'hungaroring':(14,['budapest','hungaroring']),
 'zandvoort':(14,['zandvoort']), 'monza':(11,['monza']),
 'baku':(20,['baku']), 'singapore':(19,['singapore']),
 'austin':(20,['austin']), 'mexico':(17,['mexicocity','mexico']),
 'interlagos':(15,['saopaulo','interlagos']), 'lasvegas':(17,['lasvegas']),
 'losail':(16,['lusail','losail','qatar']), 'abudhabi':(16,['abudhabi','yasmarina']),
}
LOCATIONS = {
 'melbourne':'Melbourne','shanghai':'Shanghai','suzuka':'Suzuka',
 'bahrain':'Sakhir','jeddah':'Jeddah','miami':'Miami','imola':'Imola',
 'monaco':'Monaco','catalunya':'Barcelona','montreal':'Montreal',
 'spielberg':'Spielberg','silverstone':'Silverstone','spa':'Spa Francorchamps',
 'hungaroring':'Budapest','zandvoort':'Zandvoort','monza':'Monza',
 'baku':'Baku','singapore':'Singapore','austin':'Austin',
 'mexico':'Mexico City','interlagos':'Sao Paulo','lasvegas':'Las Vegas',
 'losail':'Lusail','abudhabi':'Yas Marina',
}

def norm(s):return ''.join(c for c in str(s or '').lower() if c.isalnum() and c.isascii())

def get_json(url):
    req=Request(url, headers={'User-Agent':'ApexTrace/0.8.9 (track metadata installer)', 'Accept':'application/json'})
    with urlopen(req,timeout=25) as r:return json.load(r)

def match_meeting(key,meetings):
    aliases=[norm(a) for a in CIRCUITS[key][1]]
    found=[]
    for m in meetings:
        fields=[norm(m.get(k)) for k in ('location','circuit_short_name','meeting_name','circuit_name')]
        if any(a==f or (len(a)>4 and a in f) for a in aliases for f in fields):
            if isinstance(m.get('circuit_key'),int):found.append(m)
    # If API contains multiple dates for one circuit, prefer the last.
    return sorted(found,key=lambda m:m.get('date_start') or '')[-1] if found else None

def geo_features(geo):
    features={}
    for key in CIRCUITS:
        location=norm(LOCATIONS[key]);aliases=[norm(a) for a in CIRCUITS[key][1]]
        for f in geo.get('features',[]):
            prop=f.get('properties') or {}
            fields=[norm(prop.get(n)) for n in ('Location','Name')]
            if location in fields or any(a in fields for a in aliases):
                coords=(f.get('geometry') or {}).get('coordinates')
                if isinstance(coords,list) and len(coords)>15 and isinstance(coords[0],list):
                    features[key]=coords
                    break
    return features

def loop_points(coords,count=256):
    """Reproduce el proyector/resampler de src/utils/trackGeometry.js."""
    lon0=sum(c[0] for c in coords)/len(coords)
    lat0=sum(c[1] for c in coords)/len(coords)
    coslat=math.cos(math.radians(lat0))
    raw=[((lon-lon0)*111320*coslat,(lat0-lat)*111320) for lon,lat in coords]
    if math.dist(raw[0],raw[-1])>0.001:raw.append(raw[0])
    cumulative=[0.]
    for a,b in zip(raw,raw[1:]):cumulative.append(cumulative[-1]+math.dist(a,b))
    if cumulative[-1]<100:raise ValueError('Geometría demasiado corta')
    points=[];idx=1
    for i in range(count):
        d=cumulative[-1]*i/count
        while idx<len(cumulative)-1 and cumulative[idx]<d:idx+=1
        t=(d-cumulative[idx-1])/max(1e-9,cumulative[idx]-cumulative[idx-1])
        a,b=raw[idx-1],raw[idx]
        points.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
    minx,maxx=min(p[0] for p in points),max(p[0] for p in points)
    miny,maxy=min(p[1] for p in points),max(p[1] for p in points)
    scale=min(550/max(30,maxx-minx),342/max(30,maxy-miny))
    svg=[(320+(x-(minx+maxx)/2)*scale,209+(y-(miny+maxy)/2)*scale) for x,y in points]
    return points,svg,cumulative[-1]

def parse_corners(data,expected,key=None):
    raw=data.get('corners') or []
    if not isinstance(raw,list):raise ValueError('La respuesta no contiene una lista de curvas')
    # Hungaroring 2025: el plano FIA contiene T1..T14 y dos referencias
    # complementarias, T1A y T12A. MultiViewer las registra como entradas
    # individuales: 16 filas, pero solo 14 números de curva oficiales.
    # Filtramos ÚNICAMENTE esas dos entradas verificadas, nunca posiciones
    # arbitrarias, y validamos de nuevo toda la secuencia y la geometría.
    if key=='hungaroring' and len(raw)==expected+2:
        def id_turn(c):
            number=c.get('number')
            suffix=str(c.get('letter') or '').strip().upper()
            if isinstance(number,str):
                import re
                match=re.fullmatch(r'\s*(\d+)\s*([A-Za-z]?)\s*',number)
                if match:
                    number=int(match.group(1))
                    suffix=suffix or match.group(2).upper()
            return number,suffix
        extras=[id_turn(c) for c in raw if id_turn(c)[1]]
        normals=[c for c in raw if not id_turn(c)[1]]
        if sorted(extras)==[(1,'A'),(12,'A')] and len(normals)==expected:
            raw=normals
        else:
            raise ValueError('16 anotaciones, pero no coinciden con las extras FIA 1A y 12A')
    if len(raw)!=expected:raise ValueError(f'Cantidad distinta: {len(raw)} / {expected}')
    turns=[]
    for i,c in enumerate(raw):
        n=c.get('number')
        if n!=i+1:raise ValueError('Numeración no consecutiva')
        pos=c.get('trackPosition') or {}
        x,y=pos.get('x'),pos.get('y')
        if not all(isinstance(v,(int,float)) and math.isfinite(v) for v in (x,y)):
            raise ValueError('No hay coordenadas XY completas')
        turns.append({'number':i+1,'x':float(x),'y':float(y),'letter':str(c.get('letter',''))[:2]})
    return turns

def centroid(ps):return (sum(p[0] for p in ps)/len(ps),sum(p[1] for p in ps)/len(ps))

def nearest(point,path):
    # Point-to-segment distance (not nearest vertex), avoids 256-vertex jitter.
    x,y=point;best=(float('inf'),0,(0,0),0)
    for i,a in enumerate(path):
        b=path[(i+1)%len(path)]
        vx,vy=b[0]-a[0],b[1]-a[1]
        t=max(0.,min(1.,((x-a[0])*vx+(y-a[1])*vy)/(vx*vx+vy*vy+1e-12)))
        proj=(a[0]+t*vx,a[1]+t*vy)
        dist=(proj[0]-x)**2+(proj[1]-y)**2
        if dist<best[0]:best=(dist,i,proj,t)
    return best

def transform(p,theta,scale,tx,ty,mirror):
    x,y=p[0],p[1]*mirror
    return (tx+scale*(math.cos(theta)*x-math.sin(theta)*y),
            ty+scale*(math.sin(theta)*x+math.cos(theta)*y))

def procrustes(src,dst,mirror):
    flipped=[(x,y*mirror) for x,y in src]
    cp,cq=centroid(flipped),centroid(dst)
    a=b=den=0.
    for p,q in zip(flipped,dst):
        x,y=p[0]-cp[0],p[1]-cp[1]
        u,v=q[0]-cq[0],q[1]-cq[1]
        a+=x*u+y*v;b+=x*v-y*u;den+=x*x+y*y
    if den<1e-6:return None
    theta=math.atan2(b,a)
    scale=math.hypot(a,b)/den
    if not math.isfinite(scale) or scale<=0:return None
    tx=cq[0]-scale*(math.cos(theta)*cp[0]-math.sin(theta)*cp[1])
    ty=cq[1]-scale*(math.sin(theta)*cp[0]+math.cos(theta)*cp[1])
    return (theta,scale,tx,ty,mirror)

def order_score(indices,n):
    # Most neighboring turns must have the same progression around one loop.
    forward=[((indices[i+1]-indices[i])%n)/n for i in range(len(indices)-1)]
    backward=[((indices[i]-indices[i+1])%n)/n for i in range(len(indices)-1)]
    return min((sum(v>0.26 or v<0.001 for v in xs),sum(min(v,0.5) for v in xs),direction)
               for xs,direction in ((forward,1),(backward,-1)))

def projection_candidates(point, path, limit=24):
    """Keep spatially diverse closest candidate segments, including branches of chicanes.

    Unlike a single closest-point snap, this retains alternatives on parallel
    pieces of track for the sequence solver.
    """
    x,y=point; ranked=[]
    for i,a in enumerate(path):
        b=path[(i+1)%len(path)]
        vx,vy=b[0]-a[0],b[1]-a[1]
        frac=max(0.,min(1.,((x-a[0])*vx+(y-a[1])*vy)/(vx*vx+vy*vy+1e-12)))
        q=(a[0]+frac*vx,a[1]+frac*vy)
        ranked.append(((q[0]-x)**2+(q[1]-y)**2,i+frac,q))
    ranked.sort(key=lambda v:v[0])
    distinct=[]
    for candidate in ranked:
        u=candidate[1]
        if all(min(abs(u-v[1]),len(path)-abs(u-v[1]))>=0.7 for v in distinct):
            distinct.append(candidate)
        if len(distinct)>=limit: break
    return distinct


def ordered_projection(mapped, path, candidate_limit=24):
    """Place T1...Tn together in circuit order, not by nearest point independently.

    A dynamic program searches both route directions and allows exactly one
    wrap over the GeoJSON polygon. This avoids cross-branch snapping on city
    circuits where two road segments pass very close to each other.
    """
    n=len(path); m=len(mapped)
    if m<2:return None
    candidates=[projection_candidates(p,path,candidate_limit) for p in mapped]
    best=None
    min_step=0.07 # index units, sub-sample spacing allowed for chicanes
    max_step=.285*n
    for direction in (1,-1):
      # Each possible first-curve position defines the circular starting point.
      for first in candidates[0]:
        _,origin,_=first
        prev=[(first[0],0.,[first])]
        for j in range(1,m):
          cur=[]
          for candidate in candidates[j]:
            dist2,u,q=candidate
            progress=((u-origin)*direction)%n
            option=None
            for cost,last,chain in prev:
              step=progress-last
              if not (min_step<step<max_step): continue
              # Regularization is light: measured coordinates, not equal
              # angular spacing, determine the actual curve positions.
              value=cost+dist2+((max(0.,step/n-.21)*n)*0.85)**2
              if option is None or value<option[0]: option=(value,progress,chain+[candidate])
            if option:cur.append(option)
          prev=cur
          if not prev:break
        for cost,last,chain in prev:
          if last>=n-min_step:continue
          residual=math.sqrt(sum(c[0] for c in chain)/m)
          # Require a plausible loop closure. The arc from the last labeled
          # corner back to T1 may be long, but cannot exceed ~30% of a lap.
          closure=n-last
          if closure>max_step:continue
          score=cost
          if best is None or score<best[0]:best=(score,residual,chain,direction)
    if best is None:return None
    return best[2],best[1],best[3]


def initial_candidates(src,geo_points):
    """Broad initial search over rotation, reflection and scale."""
    spread=math.sqrt(sum(math.dist(p,centroid(src))**2 for p in src)/len(src))
    if spread<50:raise ValueError('Coordenadas XY degeneradas')
    target_spread=math.sqrt(sum(math.dist(p,centroid(geo_points))**2 for p in geo_points)/len(geo_points))
    scale0=target_spread/spread
    cp,cg=centroid(src),centroid(geo_points)
    seeds=[]
    for mirror in (1,-1):
      for angle in range(0,360,15):
        theta=math.radians(angle)
        c=math.cos(theta);s=math.sin(theta)
        tx=cg[0]-scale0*(c*cp[0]-s*mirror*cp[1]);ty=cg[1]-scale0*(s*cp[0]+c*mirror*cp[1])
        fit=(theta,scale0,tx,ty,mirror)
        for _ in range(5):
          mapped=[transform(p,*fit) for p in src]
          snap=[nearest(p,geo_points) for p in mapped]
          updated=procrustes(src,[v[2] for v in snap],mirror)
          if not updated:break
          fit=updated
        mapped=[transform(p,*fit) for p in src]
        projections=[nearest(p,geo_points) for p in mapped]
        ids=[p[1]+p[3] for p in projections]
        bad,_,_=order_score(ids,len(geo_points))
        rms=math.sqrt(sum(v[0] for v in projections)/len(projections))
        # Keep geometrically plausible seeds despite bad nearest-point order.
        seeds.append((rms, bad, fit))
    return sorted(seeds,key=lambda v:(v[0],v[1]))


def calibrate(raw_turns,geo_points,svg_points):
    """Globally fit points to the correct branch in official turn order."""
    src=[(v['x'],v['y']) for v in raw_turns]
    span=math.hypot(max(p[0] for p in geo_points)-min(p[0] for p in geo_points),
                    max(p[1] for p in geo_points)-min(p[1] for p in geo_points))
    seeds=initial_candidates(src,geo_points)
    # Try diverse initial placements, not only the one whose independent
    # nearest-point snap has lowest residual. Mirrors matter on urban tracks.
    chosen=[]
    for r,b,fit in seeds:
      if r>span*.15:continue
      if not any(abs(((fit[0]-old[0]+math.pi)%(2*math.pi))-math.pi)<.28 and fit[4]==old[4]
                 for old in chosen): chosen.append(fit)
      if len(chosen)>=18:break
    best=None
    for seed in chosen:
      fit=seed; mirror=fit[4]
      for _ in range(5):
        points=[transform(p,*fit) for p in src]
        assigned=ordered_projection(points,geo_points)
        if not assigned: break
        selections,rms,direction=assigned
        updated=procrustes(src,[c[2] for c in selections],mirror)
        if not updated:break
        fit=updated
      points=[transform(p,*fit) for p in src]
      assigned=ordered_projection(points,geo_points)
      if not assigned:continue
      selections,rms,direction=assigned
      if best is None or rms<best[0]:best=(rms,selections,direction)
    if best is None:raise ValueError('No se pudo obtener una secuencia T1–Tn continua sobre el trazado')
    rms,assigned,direction=best
    if rms/span>.034:
      raise ValueError(f'Ajuste ordenado insuficiente (error relativo {rms/span:.3f})')
    # Reject a single extreme outlier even if average RMS is small.
    errors=[math.sqrt(p[0]) for p in assigned]
    if max(errors)>max(90.,span*.065):
      raise ValueError(f'Curva aislada demasiado alejada del trazado ({max(errors):.1f} m)')
    results=[];n=len(geo_points)
    for c,(sq,phase,point) in zip(raw_turns,assigned):
      i=int(phase)%n; frac=phase-int(phase)
      x=svg_points[i][0]+(svg_points[(i+1)%n][0]-svg_points[i][0])*frac
      y=svg_points[i][1]+(svg_points[(i+1)%n][1]-svg_points[i][1])*frac
      results.append({'number':c['number'],'mapPosition':{'x':round(x,3),'y':round(y,3)},
                      'trackFraction':round((phase%n)/n,6),
                      'origin':'multiviewer-calibrated','approximate':True})
    return results,round(rms,2),round(rms/span,5)

def load_circuit_corners(meeting,key,expected,source_year=YEAR):
    """Load source geometry for a known GP, falling back to prior unchanged layouts.

    A fallback is only accepted after full curve-count/ordering and geometric
    validation. In particular, we never truncate Hungaroring's 16 to 14.
    """
    circuit_key=meeting['circuit_key']
    url=meeting.get('circuit_info_url') if source_year==YEAR else None
    if not isinstance(url,str) or urlparse(url).scheme!='https' or urlparse(url).hostname not in {'api.multiviewer.app','api.openf1.org'}:
        url=f'https://api.multiviewer.app/api/v1/circuits/{circuit_key}/{source_year}'
    return parse_corners(get_json(url), expected, key)


def installer():
    DEST.mkdir(parents=True,exist_ok=True)
    geo_file=DATA/'f1-circuits.geojson'
    geo=json.loads(geo_file.read_text(encoding='utf-8')) if geo_file.exists() else get_json(URL_GEOJSON)
    if not geo_file.exists():
        geo_file.parent.mkdir(parents=True,exist_ok=True)
        geo_file.write_text(json.dumps(geo),encoding='utf-8')
    geometry=geo_features(geo)
    meetings=get_json(URL_MEETINGS)
    if not isinstance(meetings,list):raise RuntimeError('OpenF1 no entregó calendario válido')
    report={'year':YEAR,'total':len(CIRCUITS),'ready':[],'pending':[],'details':{}}
    for key,(count,aliases) in CIRCUITS.items():
        previous=DEST/f'{key}.json'
        old=None
        if previous.exists():
            try:
                prior=json.loads(previous.read_text(encoding='utf-8'))
                if prior.get('status')=='ready' and prior.get('schema')=='apextrace-corners-calibrated-v2' and prior.get('count')==count:
                    old=prior
            except (ValueError,OSError):pass
        try:
            if key not in geometry:raise ValueError('No se encontró el trazado GP en el atlas GeoJSON')
            meeting=match_meeting(key,meetings)
            if not meeting:raise ValueError('No se encontró circuito 2025 en OpenF1')
            pts,svg,path_length=loop_points(geometry[key])
            attempts=[]
            winner=None
            # 2025 first. Fall back only where 2025 cannot be reliably matched;
            # older data must still pass EXACT 2025 turn count and same map geometry.
            # A 2023 layout may be different, hence never bypass geometric checks.
            for source_year in (2025,2024,2023):
                try:
                    turns=load_circuit_corners(meeting,key,count,source_year)
                    positioned,rms,relative=calibrate(turns,pts,svg)
                    if winner is None or rms<winner[0]:winner=(rms,relative,positioned,source_year)
                    if source_year==YEAR:break # Prefer validated 2025 positions; do not mix seasons needlessly.
                except Exception as problem:
                    attempts.append(f'{source_year}: {problem}')
            if winner is None:raise ValueError(' | '.join(attempts) or 'Sin referencias compatibles')
            rms,relative,positioned,source_year=winner
            calibration={'rmsMeters':rms,'relativeError':relative,'algorithm':'ordered-projection-v2',
                         'sourceYear':source_year}
            # Protect existing accepted calibrations against an inferior
            # replacement, including when alternate-year data is ambiguous.
            old_error=old.get('calibration',{}).get('rmsMeters',float('inf')) if old else float('inf')
            if old and (not isinstance(old_error,(int,float)) or rms>old_error-2):
                report['ready'].append(key)
                report['details'][key]={'result':'retained','rmsMeters':old_error,'sourceYear':old.get('calibration',{}).get('sourceYear',2025)}
                print(f'[CONSERVADO] {key}: calibración anterior ({old_error:.1f} m); nueva prueba {rms:.1f} m',flush=True)
                continue
            doc={'schema':'apextrace-corners-calibrated-v2','year':YEAR,'track':key,
                 'source':f'MultiViewer {source_year} / OpenF1 (aproximado; recorrido GP 2025 validado)',
                 'circuitKey':meeting['circuit_key'],'count':count,'status':'ready',
                 'calibration':calibration,'turns':positioned}
            previous.write_text(json.dumps(doc,indent=2,ensure_ascii=False),encoding='utf-8')
            report['ready'].append(key)
            report['details'][key]={'result':'calibrated','rmsMeters':rms,'sourceYear':source_year}
            marker='OK' if source_year==2025 else 'OK-HISTÓRICO'
            print(f'[{marker}] {key}: T1–T{count}; año de posiciones {source_year}; ajuste {rms:.1f} m',flush=True)
        except Exception as e:
            if old:
                print(f'[CONSERVADO] {key}: sigue vigente el resultado anterior; no se obtuvo uno mejor ({e})',flush=True)
                report['ready'].append(key)
                report['details'][key]={'result':'retained-after-error','reason':str(e)}
            else:
                report['pending'].append({'track':key,'reason':str(e)})
                report['details'][key]={'result':'pending','reason':str(e)}
                print(f'[PENDIENTE] {key}: {e}',flush=True)
        time.sleep(0.08)
    (DEST/'_status.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
    print(f'\n[FIN] {len(report["ready"])}/{len(CIRCUITS)} circuitos calibrados. Revisa corners-calibrated/_status.json.')
    print('Los pendientes no tendrán ubicaciones inventadas; la lista T seguirá visible.')
    return report

if __name__=='__main__':
    try:installer()
    except Exception as e:
        print(f'[ERROR] No fue posible iniciar la calibración: {e}',file=sys.stderr)
        sys.exit(1)
