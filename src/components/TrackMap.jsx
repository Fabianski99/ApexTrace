import { memo, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Map, Navigation2, RefreshCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { getCircuit, loadCircuitAtlas } from '../utils/circuits';
import { prepareTrack, alignLapToTrack, pointAtPct } from '../utils/trackGeometry';
import { percentAtSeconds, sampleAt } from '../utils/drivingInsights';

/** Static geometry never recalculates on playhead updates. */
const CourseDrawing=memo(function CourseDrawing({shape,zones,turns,activeTurn,onTurnSelect}){
  return <>
    <path d={shape.path} className="trace-map-halo"/>
    <path d={shape.path} className="trace-map-track"/>
    {!turns.length&&shape.bends.map(b=><circle key={b.i} cx={b.x} cy={b.y} r="3" className="trace-bend-hint"/>)}
    {zones.map(z=><g className="trace-corner-point" key={z.label}>
      <title>{z.title} · {z.pct.toFixed(1)}% · mínimo estimado de velocidad</title>
      <circle cx={z.x} cy={z.y} r="11" className="zone"/><text x={z.x} y={z.y+3.5} textAnchor="middle">{z.label}</text>
    </g>)}
  </>;
});

/** Numbered turns are above the colored delta line, so labels stay readable. */
const TurnPins=memo(function TurnPins({turns,activeTurn,onTurnSelect}){
  return <>
    {turns.map(turn=><g key={turn.number} className={`hub-turn-dot ${activeTurn===turn.number?'active':''} ${turn.showLabel?'':'hub-turn-minimal'}`} transform={`translate(${turn.x} ${turn.y})`} role={onTurnSelect?'button':undefined} tabIndex={onTurnSelect?0:undefined}
      aria-label={`Seleccionar curva T${turn.number}`}
      onClick={event=>{if(!onTurnSelect)return;event.stopPropagation();onTurnSelect(turn.number);}}
      onKeyDown={event=>{if(!onTurnSelect)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();onTurnSelect?.(turn.number);}}}>
      <title>T{turn.number}{turn.name?` · ${turn.name}`:''} · ubicación aproximada; amplía el mapa para ver más números</title>
      <circle className="hub-turn-hit" r="11"/>
      <circle className="hub-turn-icon" r={turn.showLabel?7.6:3.3}/>
      {turn.showLabel&&<text textAnchor="middle" y="2.7">{turn.number}</text>}
    </g>)}
  </>;
});

/** These SVG layers are static while the playhead moves (up to 30 FPS). */
const StaticTelemetryLayers=memo(function StaticTelemetryLayers({segments,markers}){
  return <>
    {segments.map(s=><path key={s.index} d={s.path} stroke={s.state==='loss'?'#ff465c':'#2bd9ac'} strokeWidth="6" strokeLinecap="round" fill="none" opacity=".94" pointerEvents="none"><title>{s.state==='loss'?'A pierde':'A gana'} {Math.abs(s.delta).toFixed(3)} segundos en este tramo</title></path>)}
    {markers.map((m,i)=><g key={`${m.kind}-${i}`} className={`v08-track-marker v08-track-${m.kind}`} transform={`translate(${m.x} ${m.y})`} pointerEvents="none"><title>{m.title}</title><circle r="6.5"/><text textAnchor="middle" y="2.6">{m.label}</text></g>)}
  </>;
});

/** Atlas is common to Circuit Hub and comparison; only coordinates change on seek. */
function TrackMap({lap,trackName,pct=0,onSeek,corners=[],compact=false,expanded=false,turns=[],activeTurn=null,onTurnSelect,comparisonLap=null,heatSections=[],mapMode='normal',focusMarkers=[]}){
  const target=trackName||lap?.track||'';
  const catalog=getCircuit(target);
  const [atlas,setAtlas]=useState(null),[status,setStatus]=useState('loading'),[attempt,setAttempt]=useState(0);
  const [zoom,setZoom]=useState(1),[center,setCenter]=useState({x:320,y:215});
  // The selected measured event is the ONLY extra marker drawn. No F/M/G overlap.
  const [activeEventKind,setActiveEventKind]=useState('brake');
  useEffect(()=>{let mounted=true;
    loadCircuitAtlas(attempt>0).then(data=>{if(mounted){setAtlas(data);setStatus('ready');}}).catch(()=>{if(mounted)setStatus('error');});
    return ()=>{mounted=false;};
  },[attempt]);
  const geometry=useMemo(()=>prepareTrack(catalog&&atlas?.[catalog.id]),[atlas,catalog?.id]);
  const alignment=useMemo(()=>alignLapToTrack(geometry,lap),[geometry,lap]);
  const marker=geometry&&alignment?pointAtPct(geometry,alignment,pct):null;
  // Ghost uses the SAME elapsed time as A, rather than the same lap percentage.
  // It is only shown if both recordings have credible X/Z calibration.
  const otherAlignment=useMemo(()=>alignLapToTrack(geometry,comparisonLap),[geometry,comparisonLap]);
  const elapsed=sampleAt(lap,pct)?.t;
  const otherPct=comparisonLap&&Number.isFinite(elapsed)?percentAtSeconds(comparisonLap,elapsed):null;
  const ghost=mapMode==='ghost'&&geometry&&otherAlignment&&Number.isFinite(otherPct)
    ?pointAtPct(geometry,otherAlignment,otherPct):null;
  const paintedSegments=useMemo(()=>{
    if(!geometry||!alignment||mapMode!=='delta'||!heatSections?.length)return [];
    return heatSections.filter(s=>s.state!=='even').map(s=>{
      const coords=[];
      for(let i=0;i<=8;i++){
        const at=s.start+(s.end-s.start)*i/8;
        const point=pointAtPct(geometry,alignment,at);
        if(point)coords.push(`${i?'L':'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`);
      }
      return {...s,path:coords.join(' ')};
    });
  },[geometry,alignment,mapMode,heatSections]);
  const detailMarkers=useMemo(()=>geometry&&alignment?focusMarkers.map(m=>{
    const point=pointAtPct(geometry,alignment,m.pct);
    return point?{...m,...point}:null;
  }).filter(Boolean):[],[geometry,alignment,focusMarkers]);
  const zoneMarkers=useMemo(()=>geometry&&alignment?corners.map(z=>{
    const p=pointAtPct(geometry,alignment,z.pct);return p?{...z,...p}:null;
  }).filter(Boolean):[],[geometry,alignment,corners]);
  const turnMarkers=useMemo(()=>{
    if(!geometry)return [];
    return turns.filter(t=>Number.isFinite(t.pct)||t.mapPosition).map(t=>{
      // Alignment based on actual recorded X/Z is preferred. With no coherent
      // positioning, the GeoJSON ring's origin isn't verified as start/finish:
      // no misplaced numbered markers are drawn.
      if(t.mapPosition)return {...t,...t.mapPosition};
      if(!alignment)return null;
      const point=pointAtPct(geometry,alignment,t.pct);
      return point?{...t,...point}:null;
    }).filter(Boolean);
  },[geometry,alignment,turns]);
  // Distribución de etiquetas: evita ocultar el trazado en circuitos densos.
  // Todos los puntos siguen siendo seleccionables; el zoom revela etiquetas
  // adicionales sin añadir cálculos al movimiento de la vuelta.
  const readableTurnMarkers=useMemo(()=>{
    if(!turnMarkers.length)return turnMarkers;
    const minGap=15.5/zoom;
    const priority=[...turnMarkers].sort((a,b)=>
      Number(b.number===activeTurn)-Number(a.number===activeTurn)
      || (a.number%3)-(b.number%3) || a.number-b.number
    );
    const labeled=[];
    const show=new Set();
    for(const turn of priority){
      if(labeled.every(other=>Math.hypot(turn.x-other.x,turn.y-other.y)>=minGap)){
        labeled.push(turn);show.add(turn.number);
      }
    }
    // SVG pinta la curva seleccionada al final para asegurar su visibilidad.
    return turnMarkers.map(turn=>({...turn,showLabel:show.has(turn.number)}))
      .sort((a,b)=>Number(a.number===activeTurn)-Number(b.number===activeTurn));
  },[turnMarkers,activeTurn,zoom]);
  // Keep the full curve directory in the Circuit Hub's normal view. In analysis
  // and in the comparador, display only the selected curve; never cover the map
  // with every T marker while the car and performance layers are active.
  const visibleTurns=useMemo(()=>
    expanded && mapMode==='normal' ? readableTurnMarkers
    : readableTurnMarkers.filter(turn=>turn.number===activeTurn),
    [expanded,mapMode,readableTurnMarkers,activeTurn]);
  const visibleEvent=detailMarkers.find(m=>m.kind===activeEventKind)||detailMarkers[0]||null;
  const visibleEventLayer=useMemo(()=>visibleEvent?[visibleEvent]:[],[visibleEvent]);
  // Zoom belongs only to the expanded Circuit Hub; the comparison remains untouched.
  // Keep the camera fixed during playback to avoid costly full-map movement.
  useEffect(()=>{setZoom(1);setCenter({x:320,y:215});},[target]);
  const anchor=turnMarkers.find(t=>t.number===activeTurn)||marker||{x:320,y:215};
  const changeZoom=next=>{
    const value=Math.max(1,Math.min(3,next));
    setZoom(value);
    setCenter(value===1?{x:320,y:215}:{x:anchor.x,y:anchor.y});
  };
  useEffect(()=>{
    if(zoom<=1)return;
    const selected=turnMarkers.find(t=>t.number===activeTurn);
    if(selected)setCenter({x:selected.x,y:selected.y});
  },[activeTurn,turnMarkers,zoom]);
  const viewWidth=640/zoom,viewHeight=430/zoom;
  const viewBox=`${center.x-viewWidth/2} ${center.y-viewHeight/2} ${viewWidth} ${viewHeight}`;
  function seek(e){
    if(!geometry)return;
    if(!alignment||!onSeek)return;
    const matrix=e.currentTarget.getScreenCTM();
    if(!matrix)return;
    const location=e.currentTarget.createSVGPoint();
    location.x=e.clientX;location.y=e.clientY;
    const {x,y}=location.matrixTransform(matrix.inverse());
    let best=Infinity,next=0;
    for(let i=0;i<=200;i++){
      const p=pointAtPct(geometry,alignment,i/2),distance=(p.x-x)**2+(p.y-y)**2;
      if(distance<best){best=distance;next=i/2;}
    }
    if(best<2500)onSeek(next);
  }
  return <section className={`trace-map-panel ${compact?'compact':''} ${expanded?'hub-expanded-map':''}`}>
    <div className="trace-panel-head"><div><span className="trace-overline">CIRCUIT ATLAS / F1 25</span><h3>{catalog?.id||target||'Selecciona un circuito'}</h3><p>{catalog?.name||'Mapa de referencia independiente de las vueltas'}</p></div><span className="trace-panel-icon"><Map size={20}/></span></div>
    {geometry ? <>
      <div className="trace-map-surface">
        <div className="trace-map-coordinate">TRAZADO DE REFERENCIA <span>•</span> {catalog.grandPrix}</div>
        {expanded&&<div className="hub-map-zoom" aria-label="Ampliación del circuito">
          <button disabled={zoom===1} aria-label="Alejar mapa" title="Alejar" onClick={()=>changeZoom(zoom-0.5)}><ZoomOut size={18}/></button>
          <span>{Math.round(zoom*100)}%</span>
          <button disabled={zoom>=3} aria-label="Acercar mapa" title="Acercar en torno al coche o curva" onClick={()=>changeZoom(zoom+0.5)}><ZoomIn size={18}/></button>
          <button disabled={zoom===1} aria-label="Restablecer ampliación" title="Ver todo el circuito" onClick={()=>changeZoom(1)}><Maximize2 size={17}/></button>
        </div>}
        <svg className={`trace-map-svg ${onSeek&&alignment?'clickable':''}`} viewBox={viewBox} role="img" aria-label={`Mapa de ${catalog.id}${marker?`, vehículo al ${pct.toFixed(1)} por ciento`:''}`} onClick={seek}>
          <CourseDrawing shape={geometry} zones={mapMode==='normal'?zoneMarkers:[]} turns={visibleTurns}/>
          <StaticTelemetryLayers segments={paintedSegments} markers={visibleEventLayer}/>
          <TurnPins turns={visibleTurns} activeTurn={activeTurn} onTurnSelect={onTurnSelect}/>
          {ghost&&<g className="v08-ghost-marker" transform={`translate(${ghost.x} ${ghost.y})`} pointerEvents="none"><title>Vuelta B al mismo tiempo transcurrido · {otherPct.toFixed(1)}% del circuito</title><circle r="15" opacity=".19"/><circle r="7"/><text y="-12" textAnchor="middle">B</text></g>}
          {marker&&<g className="trace-driver-marker"><circle cx={marker.x} cy={marker.y} r="13" className="trace-driver-glow"/><circle cx={marker.x} cy={marker.y} r="8" className="trace-driver-ring"/><circle cx={marker.x} cy={marker.y} r="3.8" className="trace-driver-core"/>{mapMode==='ghost'&&<text className="v08-a-label" x={marker.x} y={marker.y-13} textAnchor="middle">A</text>}</g>}
        </svg>
        <div className="trace-map-current"><Navigation2 size={14}/>{lap?`${pct.toFixed(1)}%`:'Mapa base'} <span>{marker?'posición calibrada':lap?'sin calibración':'sin vuelta seleccionada'}</span></div>
      </div>
      {detailMarkers.length>0&&<div className="v081-event-selector" aria-label="Mostrar un solo evento de conducción">
        <span className="v081-selector-title">Punto de la curva:</span>
        {detailMarkers.map(m=><button key={m.kind} type="button" className={visibleEvent?.kind===m.kind?'selected':''} aria-pressed={visibleEvent?.kind===m.kind}
          onClick={()=>{setActiveEventKind(m.kind);if(Number.isFinite(m.pct))onSeek?.(m.pct);}} title={m.title}>
          <b>{m.label}</b> {m.kind==='brake'?'Inicio de frenada':m.kind==='minimum'?'Punto más lento':'Gas sostenido'}
        </button>)}
        <small>Son posiciones medidas; no indican una maniobra ideal.</small>
      </div>}
      {mapMode==='ghost'&&<p className="v08-map-method">{ghost?'A y B avanzan con el mismo tiempo transcurrido desde sus respectivas líneas de meta. Su separación ilustra la diferencia de recorrido.':'Ghost disponible solo cuando ambas vueltas tienen coordenadas X/Z compatibles y calibradas.'}</p>}
      {mapMode==='delta'&&<p className="v08-map-method">{paintedSegments.length?'Los tramos coloreados muestran la diferencia de tiempo local entre A y B.':alignment&&heatSections.length?'Las diferencias locales no superan ±0.035 s por tramo.':'Necesitamos vueltas compatibles y posición X/Z calibrada para colorear el trazado.'}</p>}
      <div className="trace-map-foot"><span><i className="trace-foot-dot"/>{marker?'Coche sincronizado':'Posición no disponible'}</span><span><i className="trace-foot-zone"/>Zonas de velocidad mínima</span><span>{turnMarkers.length?`${turnMarkers.length} curvas ubicadas (revisa su fuente)`:'Ubicaciones pendientes de calibrar'}</span></div>
      {turns.length>0&&!alignment&&turnMarkers.length===0&&<p className="trace-map-explainer">Curvas numeradas en la lista. Para ubicarlas sobre el mapa necesitamos una vuelta con coordenadas X/Z calibradas; no colocamos marcadores con posiciones supuestas.</p>}
      {lap&&!alignment&&<p className="trace-map-explainer">La vuelta no tiene suficientes coordenadas compatibles para sincronizar el coche. Los gráficos y tiempos siguen disponibles.</p>}
      {!lap&&!turns.length&&<p className="trace-map-explainer">El mapa está disponible sin vueltas. Selecciona una grabación para ver tu posición.</p>}
    </>:<div className="trace-map-unavailable"><AlertCircle size={31}/><h4>{status==='loading'?'Cargando trazados…':status==='error'?'No se pudo cargar el atlas':'Trazado no disponible'}</h4><p>{status==='error'?'Comprueba la conexión o ejecuta tools/Instalar_Mapas_Offline.bat.':'El catálogo de trazados es independiente de tus vueltas.'}</p>{status==='error'&&<button className="trace-btn-ghost" onClick={()=>{setStatus('loading');setAttempt(a=>a+1);}}><RefreshCw size={15}/> Reintentar</button>}</div>}
    <p className="trace-atlas-source">Trazados: bacinger/f1-circuits (MIT). Curvas: {turns.some(t=>t.origin==='automatic-estimate')?'estimación automática por X/Z (no oficial)':turns.some(t=>t.origin==='multiviewer-calibrated')?'MultiViewer 2025 ajustado al GeoJSON (aproximado, no medición FIA)':catalog.id==='Monza'?'ApexTrace (11 referencias aproximadas)':turns.some(t=>t.origin==='circuit-2025')?'MultiViewer / FastF1 2025 (posiciones aproximadas)':catalog.id==='Bahrain'||catalog.id==='Baku'?'2025 local si está disponible; si no, estimaciones no oficiales':'Sin ubicaciones validadas; ejecuta el calibrador automático'}. No se asumen límites de sectores oficiales.</p>
  </section>;
}
export default memo(TrackMap);
