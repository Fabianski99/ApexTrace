import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronRight, Clock3, Flag, Gauge, MapPinned, Search, Target, WifiOff, Play, Pause, RotateCcw, Timer } from 'lucide-react';
import TrackMap from './TrackMap';
import { CIRCUITS, circuitId, loadCircuitAtlas, getCircuit } from '../utils/circuits';
import { prepareTrack, alignLapToTrack, lapPercentAtMapPosition } from '../utils/trackGeometry';
import { shortDate, timeLabel } from '../utils/analysis';
import { detectBrakingEvents, compareTurnSamples } from '../utils/cornerAnalysis';
import AdvancedCornerAnalysis from './AdvancedCornerAnalysis';
import { CornerCoach, MapDrivingKey } from './DrivingCoach';
import { markersForTurn, buildDeltaSections } from '../utils/drivingInsights';
import { guideFor, lapTurnStats, loadTurnAnnotations, numberedTurns } from '../utils/trackGuide';
import useLapPlayback from '../hooks/useLapPlayback';
import { secondsAtPercent } from '../utils/lapPlayback';

const EMPTY_ARRAY=Object.freeze([]);
const isValid=l=>l.game==='F1 25'&&l.verified&&l.valid!==false;
const lapOrder=(a,b)=>(b.importedAt||0)-(a.importedAt||0);
const bestLap=laps=>laps.filter(isValid).reduce((a,b)=>!a||b.time<a.time?b:a,null);
const inTrack=(lap,track)=>circuitId(lap.track)===circuitId(track);
const segments=[{start:0,end:33.333,label:'Tramo A'},{start:33.333,end:66.667,label:'Tramo B'},{start:66.667,end:100,label:'Tramo C'}];
const sampled=(points,pct)=>points?.[Math.min(points.length-1,Math.max(0,Math.round((points.length-1)*pct/100)))]||null;
const segmentTime=(s)=>Number.isFinite(s)?`${s.toFixed(3)} s`:'—';

const Preview=memo(function Preview({shape}){
  return <div className="hub-card-preview">{shape?<svg viewBox="0 0 640 430" aria-hidden="true"><path d={shape.path}/></svg>:<div className="hub-preview-empty"><MapPinned size={28}/><small>Trazado disponible al cargar el atlas</small></div>}</div>;
});

const CircuitTile=memo(function CircuitTile({circuit,shape,stats,onOpen}){
  const guide=guideFor(circuit.id);
  return <button className="hub-tile" onClick={()=>onOpen(circuit.id)} aria-label={`Abrir circuito ${circuit.id}`}>
    <div className="hub-tile-heading"><span className="hub-flag" aria-hidden="true">{guide.flag}</span><span className="hub-tile-region">{guide.region}</span><ChevronRight size={17}/></div>
    <Preview shape={shape}/>
    <div className="hub-tile-body"><span className="trace-overline">{circuit.grandPrix}</span><strong>{circuit.id}</strong><small>{circuit.name}</small></div>
    <div className="hub-tile-footer"><span><Flag size={13}/>{guide.count} curvas numeradas</span><span><Clock3 size={13}/>{stats.best?timeLabel(stats.best.time):'Sin registros'}</span></div>
  </button>;
});

const TurnList = memo(function TurnList({turns,chosen,onSelect,statsByTurn}){
  return <div className="hub-turn-list" role="list" aria-label="Curvas numeradas del circuito">
    {turns.map(t=>{
      const stats=statsByTurn.get(t.number),active=t.number===chosen;
      return <button key={t.number} className={`hub-turn-row ${active?'active':''}`} onClick={()=>onSelect(t)} role="listitem">
        <span className="hub-turn-number">{t.label}</span>
        <span className="hub-turn-row-copy"><b>{t.name||`Curva ${t.number}`}</b><small>{t.pct!=null?`≈ ${t.pct.toFixed(1)}% · ${t.origin==='automatic-estimate'?'estimación por trayectoria':t.origin==='circuit-2025'?'referencia de 2025':t.origin==='apextrace'?'estimación local':'dato comunitario'}`:t.mapPosition?'Marcador en mapa · selecciona una vuelta para analizar':'Ubicación pendiente de calibración'}</small></span>
        {stats&&<span className="hub-turn-speed">{stats.minSpeed}<small>km/h mín.</small></span>}
        <ChevronRight size={15}/>
      </button>;
    })}
  </div>;
});

const LapInsights = memo(function LapInsights({lap,all,track,goCompare}){
  const valid=all.filter(isValid),best=bestLap(all);
  const last=valid.slice().sort(lapOrder).slice(0,5);
  const avg=last.length?last.reduce((v,l)=>v+l.time,0)/last.length:null;
  const segmentsData=lap?segments.map(s=>{
    const a=sampled(lap.points,s.start),b=sampled(lap.points,s.end);
    const pts=lap.points.filter(p=>p.pct>=s.start&&p.pct<=s.end);
    return {...s,time:a&&b?b.t-a.t:null,minSpeed:pts.length?Math.round(Math.min(...pts.map(p=>p.speed))):null};
  }):[];
  return <div className="hub-performance">
    <div className="hub-stat-grid">
      <div><span>Mejor vuelta válida</span><strong>{best?timeLabel(best.time):'—'}</strong><small>{best?.car||'Aún sin registros'}</small></div>
      <div><span>Últimas 5 válidas · media</span><strong>{avg?timeLabel(avg):'—'}</strong><small>Consistencia, no récord</small></div>
      <div><span>Vueltas archivadas</span><strong>{all.length}</strong><small>{valid.length} válidas</small></div>
      <div><span>Última sesión</span><strong>{all.length?shortDate(all.slice().sort(lapOrder)[0].date):'—'}</strong><small>Datos del Recorder</small></div>
    </div>
    <div className="hub-note"><Target size={18}/><p><strong>En qué fijarte:</strong> {guideFor(track).tip} Las observaciones dependen de tus propios datos; no son referencias de pilotos profesionales.</p></div>
    {lap?<><div className="hub-subhead"><h3>Tramos de estudio</h3><p>Tres partes iguales por distancia. No son los sectores cronometrados oficiales del juego.</p></div>
      <div className="hub-sectors">{segmentsData.map(s=><div key={s.label} className="hub-sector"><span>{s.label}<small>{Math.round(s.start)}–{Math.round(s.end)}%</small></span><strong>{s.time!=null?segmentTime(s.time):'—'}</strong><small>Vel. mín. {s.minSpeed??'—'} km/h</small></div>)}</div>
      <button className="trace-btn-red hub-wide" onClick={()=>goCompare(lap,0)}>Abrir comparador de telemetría <ArrowRight size={16}/></button>
    </>:<div className="hub-empty-message">Registra una vuelta en este circuito con ApexTrace Recorder para activar el desglose de velocidad y tiempos.</div>}
  </div>;
});

export default function TrackHub({laps,onCompare}){
  const [filter,setFilter]=useState(''),[region,setRegion]=useState('Todos'),[activeId,setActiveId]=useState(''),[lapId,setLapId]=useState(''),[turnNumber,setTurnNumber]=useState(1),[tab,setTab]=useState('curves'),[referenceId,setReferenceId]=useState('');
  const [atlas,setAtlas]=useState(null),[mapError,setMapError]=useState(false);
  const [annotations,setAnnotations]=useState(null),[annotationsPending,setAnnotationsPending]=useState(false),[annotationRefresh,setAnnotationRefresh]=useState(0);
  
  useEffect(()=>{let live=true;loadCircuitAtlas().then(value=>{if(live)setAtlas(value);}).catch(()=>{if(live)setMapError(true);});return()=>{live=false;};},[]);
  const previews=useMemo(()=>atlas?Object.fromEntries(CIRCUITS.map(c=>[c.id,prepareTrack(atlas[c.id])])):{},[atlas]);
  const lapsByTrack=useMemo(()=>{
    const grouped=new Map();for(const lap of laps){const key=circuitId(lap.track);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(lap);}
    return grouped;
  },[laps]);
  const statsByTrack=useMemo(()=>Object.fromEntries(CIRCUITS.map(c=>{
    const items=lapsByTrack.get(circuitId(c.id))||[];return [c.id,{count:items.length,best:bestLap(items)}];
  })),[lapsByTrack]);
  const results=useMemo(()=>CIRCUITS.filter(c=>{
    const guide=guideFor(c.id);return (region==='Todos'||region===guide.region)&&`${c.id} ${c.grandPrix} ${c.name} ${c.location}`.toLowerCase().includes(filter.toLowerCase().trim());
  }),[region,filter]);
  const active=getCircuit(activeId);
  const circuitLaps=useMemo(()=>active?[...(lapsByTrack.get(circuitId(active.id))||[])].sort(lapOrder):[],[active,lapsByTrack]);
  const lap=useMemo(()=>lapId==='__none__'?null:circuitLaps.find(l=>l.id===lapId)||bestLap(circuitLaps)||circuitLaps[0]||null,[circuitLaps,lapId]);
  const { percent:pct, playing, rate, setRate, seek:setPct, playPause, reset:resetPlayback, stop:stopPlayback }=useLapPlayback(lap);
  useEffect(()=>{
    if(!activeId){setAnnotations(null);return;}
    let mounted=true;setAnnotations(null);setAnnotationsPending(true);
    loadTurnAnnotations(activeId,{refresh:annotationRefresh>0}).then(value=>{if(mounted)setAnnotations(value);}).catch(error=>{if(mounted)setAnnotations({turns:[],warning:`Error al cargar las curvas: ${error.message}`});}).finally(()=>{if(mounted)setAnnotationsPending(false);});
    return()=>{mounted=false;};
  },[activeId,annotationRefresh]);
  const shape=active?previews[active.id]:null;
  const alignment=useMemo(()=>alignLapToTrack(shape,lap),[shape,lap]);
  // Locations come from the geometry-calibrated atlas, not assumed percentages.
  const turns=useMemo(()=>{
    if(!active)return [];
    return numberedTurns(active.id,annotations).map(turn=>{
      const pct=turn.mapPosition
        ?lapPercentAtMapPosition(shape,alignment,turn.mapPosition)
        :turn.pct;
      return {...turn,pct:Number.isFinite(pct)?pct:null};
    });
  },[active?.id,annotations,shape,alignment]);
  const estimatesUsed=Boolean(annotations?.turns?.some(t=>t.origin==='automatic-estimate'));
  const selectedTurn=turns.find(t=>t.number===turnNumber)||turns[0];
  // v0.7: detect events from the brake channel, independently of speed minima.
  const brakingEvents=useMemo(()=>lap?detectBrakingEvents(lap):[],[lap]);
  const zones=useMemo(()=>brakingEvents.map((b,i)=>({label:`F${i+1}`, title:`Frenada ${i+1}`,pct:b.startPct,speed:b.minSpeed,peakBrake:b.peakBrake,startM:b.startM,duration:b.duration})),[brakingEvents]);
  const references=useMemo(()=>lap?circuitLaps.filter(l=>l.id!==lap.id&&l.game==='F1 25'&&l.verified&&l.valid!==false):[],[lap,circuitLaps]);
  const reference=references.find(l=>l.id===referenceId)||bestLap(references)||null;
  const cornerItems=useMemo(()=>lap&&!estimatesUsed?compareTurnSamples(lap,reference,turns):[],[lap,reference,turns,estimatesUsed]);
  const statsByTurn=useMemo(()=>new Map(turns.map(t=>[t.number,estimatesUsed?null:lapTurnStats(lap,t)])),[lap,turns,estimatesUsed]);
  const turnStats=statsByTurn.get(selectedTurn?.number)??null;
  const focusedCorner=cornerItems.find(t=>t.number===turnNumber)||null;
  const focusedMarkers=useMemo(()=>markersForTurn(lap,focusedCorner),[lap,focusedCorner]);
  const heatSections=useMemo(()=>lap&&reference?buildDeltaSections(lap,reference):EMPTY_ARRAY,[lap,reference]);
  const historyStats={total:laps.length,visited:[...lapsByTrack.keys()].filter(k=>CIRCUITS.some(c=>circuitId(c.id)===k)).length};
  const openTrack=id=>{setActiveId(id);setTab('curves');setLapId('');setReferenceId('');resetPlayback();setTurnNumber(1);window.scrollTo({top:0,behavior:'smooth'});};
  const pickTurn=useCallback(turn=>{stopPlayback();setTurnNumber(turn.number);if(Number.isFinite(turn.pct))setPct(turn.pct);},[stopPlayback,setPct]);
  const handleMapTurn=useCallback(number=>{stopPlayback();setTurnNumber(number);const turn=turns.find(t=>t.number===number);if(Number.isFinite(turn?.pct))setPct(turn.pct);},[turns,stopPlayback,setPct]);
  const reset=()=>{stopPlayback();setActiveId('');setFilter('');setLapId('');window.scrollTo({top:0,behavior:'smooth'});};
  return <div className="trace-stack hub-root">
    {!active?<>
      <div className="hub-index-hero"><div><span className="trace-overline">TRACK HUB / F1 25</span><h1>Conoce cada <em>circuito.</em></h1><p>24 trazados para explorar. Estudia sus curvas, consulta tus tiempos y abre el comparador desde una misma ficha.</p></div><div className="hub-count"><strong>24</strong><span>CIRCUITOS DEL CALENDARIO</span></div></div>
      <div className="hub-index-toolbar"><label className="hub-search"><Search size={18}/><input aria-label="Buscar circuito" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Buscar Monza, Jeddah, Spa…"/></label><label className="hub-region"><MapPinned size={16}/><select aria-label="Filtrar región" value={region} onChange={e=>setRegion(e.target.value)}>{['Todos','Europa','Asia','América','Oceanía'].map(v=><option key={v}>{v}</option>)}</select></label><span className="hub-index-count">{results.length} circuitos</span></div>
      <div className="hub-index-summary"><span><Flag size={16}/>{historyStats.visited} / 24 visitados</span><span><Gauge size={16}/>{historyStats.total} vueltas registradas</span><span><BookOpen size={16}/>Guía independiente del Recorder</span></div>
      {mapError&&<div className="hub-note"><WifiOff size={17}/><p>No se pudieron cargar los trazados en este navegador. Las tarjetas siguen disponibles; ejecuta el instalador local de mapas para recuperar las siluetas.</p></div>}
      <div className="hub-card-grid">{results.map(c=><CircuitTile key={c.id} circuit={c} shape={previews[c.id]} stats={statsByTrack[c.id]} onOpen={openTrack}/>)}</div>
      {!results.length&&<div className="hub-empty-message">No hay circuitos que coincidan con la búsqueda.</div>}
    </>:<>
      <div className="hub-detail-heading"><button className="hub-back" onClick={reset}><ArrowLeft size={16}/> Todos los circuitos</button><div className="hub-detail-title"><span className="hub-detail-flag" aria-hidden="true">{guideFor(active.id).flag}</span><div><span className="trace-overline">TRACK HUB / {active.grandPrix.toUpperCase()}</span><h1>{active.id}<span className="trace-dot">.</span></h1><p>{active.name} · {guideFor(active.id).type}</p></div></div></div>
      <div className="hub-stat-row"><div><small>CURVAS NUMERADAS</small><strong>{guideFor(active.id).count}</strong></div><div><small>MEJOR VUELTA VÁLIDA</small><strong>{bestLap(circuitLaps)?timeLabel(bestLap(circuitLaps).time):'—'}</strong></div><div><small>VUELTAS ARCHIVADAS</small><strong>{circuitLaps.length}</strong></div><div><small>CURVAS CON UBICACIÓN</small><strong>{turns.filter(t=>Number.isFinite(t.pct)||t.mapPosition).length}/{turns.length}</strong></div></div>
      <div className="hub-detail-layout"><div className="hub-map-column">
        <div className="hub-lap-picker"><label><Gauge size={16}/> <span>Vuelta en el mapa</span><select aria-label="Vuelta seleccionada" value={lap?.id||'__none__'} onChange={e=>{stopPlayback();setLapId(e.target.value);setReferenceId('');setPct(0);}}><option value="__none__">Solo circuito</option>{circuitLaps.map(l=><option key={l.id} value={l.id}>{`V${l.lapNumber} · ${l.car} · ${timeLabel(l.time)}`}</option>)}</select></label></div>
        <TrackMap expanded trackName={active.id} lap={lap} pct={pct} onSeek={lap?setPct:undefined} corners={tab==='braking'?zones:EMPTY_ARRAY} turns={tab==='curves'||tab==='analysis'?turns:EMPTY_ARRAY} activeTurn={turnNumber} onTurnSelect={handleMapTurn} focusMarkers={tab==='analysis'?focusedMarkers:EMPTY_ARRAY} mapMode={tab==='analysis'&&reference?'delta':'normal'} heatSections={heatSections}/>
        {tab==='analysis'&&focusedMarkers.length>0&&<MapDrivingKey markers={focusedMarkers} heat={Boolean(reference)}/>}
        <div className="hub-player" aria-label="Reproducción individual de vuelta">
          <div className="hub-player-top">
            <div className="hub-player-actions">
              <button className="hub-player-play" onClick={playPause} disabled={!lap} aria-label={playing?'Pausar vuelta':'Reproducir vuelta'} title={playing?'Pausar':'Reproducir'}>{playing?<Pause size={20} fill="currentColor"/>:<Play size={20} fill="currentColor"/>}</button>
              <button className="hub-player-reset" onClick={resetPlayback} disabled={!lap} title="Volver al inicio" aria-label="Reiniciar vuelta"><RotateCcw size={17}/></button>
              <div className="hub-player-heading"><strong>{lap?`Reproducción · V${lap.lapNumber}`:'Reproducción de vuelta'}</strong><span>{lap?'Sigue el coche y selecciona cualquier punto del trazado':'Selecciona una vuelta para activar los controles'}</span></div>
            </div>
            <div className="hub-player-end"><span className="hub-player-time"><Timer size={15}/> {lap?timeLabel(secondsAtPercent(lap,pct)):'0:00.000'} <small>/ {lap?timeLabel(lap.time):'0:00.000'}</small></span>
              <label className="hub-player-speed">Velocidad <select aria-label="Velocidad de reproducción" value={rate} disabled={!lap} onChange={e=>setRate(Number(e.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label></div>
          </div>
          <input className="hub-player-range" aria-label="Posición de la vuelta" type="range" min="0" max="100" step="0.25" value={pct} disabled={!lap} onChange={e=>setPct(Number(e.target.value))} style={{'--progress':`${pct}%`}}/>
          <div className="hub-player-bottom"><span>INICIO · 0%</span><b>{pct.toFixed(1)}% DEL RECORRIDO</b><span>META · 100%</span></div>
        </div>
        <div className="hub-note hub-map-accuracy"><CheckCircle2 size={18}/><p>Las curvas se ubican automáticamente usando datos compatibles del circuito o, si faltan, una estimación por tu trayectoria X/Z. Los puntos estimados pueden diferir de las curvas oficiales; verifica antes de usarlos como referencias de frenada.</p></div>
      </div>
      <section className="trace-card hub-data-panel"><div className="hub-tab-bar" role="tablist" aria-label="Explorar circuito"><button role="tab" aria-selected={tab==='curves'} className={tab==='curves'?'active':''} onClick={()=>setTab('curves')}>Curvas</button><button role="tab" aria-selected={tab==='braking'} className={tab==='braking'?'active':''} onClick={()=>setTab('braking')}>Frenadas</button><button role="tab" aria-selected={tab==='performance'} className={tab==='performance'?'active':''} onClick={()=>setTab('performance')}>Rendimiento</button><button role="tab" aria-selected={tab==='analysis'} className={tab==='analysis'?'active':''} onClick={()=>setTab('analysis')}>Analizar conducción</button></div>
        {tab==='curves'&&<><div className="hub-data-intro"><span className="trace-overline">CORNER DIRECTORY</span><h2>Guía de curvas</h2><p>{annotationsPending?'Comprobando anotaciones de curvas…':estimatesUsed?annotations?.warning:annotations?.warning?annotations.warning:annotations?`${turns.filter(t=>t.pct!=null||t.mapPosition).length} ubicaciones automáticas. ${annotations.source||'Datos comunitarios'}.`:'Numeración disponible. Registra una vuelta para estimar posiciones.'}</p></div>
          {(annotations?.warning||!annotations?.turns?.length)&&!annotationsPending&&<div className="trace-corner-loader-notice" role="status"><p>{annotations?.warning||'Todavía no se han cargado posiciones de curvas para este circuito.'}</p><button type="button" className="trace-btn-ghost" onClick={()=>setAnnotationRefresh(v=>v+1)} disabled={annotationsPending}>Reintentar carga de curvas</button></div>}
          <div className="hub-curves-layout"><TurnList turns={turns} chosen={turnNumber} onSelect={pickTurn} statsByTurn={statsByTurn}/>
          <div className="hub-turn-focus"><span className="hub-focus-label">CURVA SELECCIONADA · {selectedTurn?.label}</span><strong>{selectedTurn?.name||`Curva ${selectedTurn?.number}`}</strong>
            <p>{Number.isFinite(selectedTurn?.pct)?
              `Posición ${selectedTurn?.origin==='automatic-estimate'?'estimada por la trayectoria (NO oficial)':'de referencia aproximada'}: ${selectedTurn.pct.toFixed(1)}% de vuelta.`:
              'Aún sin ubicación: importa una vuelta completa con posiciones X/Z o instala las referencias automáticas.'}</p>
            {(active?.id==='Bahrain'||active?.id==='Baku')&&<p className="hub-turn-source-note">{active.id==='Baku'?'Bakú: 20 curvas':'Bahréin: 15 curvas'}. Para obtener referencias automáticas de 2025, ejecuta tools/Instalar_Mapas_Offline.bat y recarga la web. Las posiciones son aproximadas; no debes colocarlas a mano.</p>}
            {turnStats&&<div className="hub-focus-metrics"><span>Vel. mínima ~<b>{turnStats.minSpeed} km/h</b></span><span>Freno máximo ~<b>{turnStats.maxBrake}%</b></span><span>Acelerador medio ~<b>{turnStats.meanThrottle}%</b></span></div>}
            <div className="c07-nav-actions"><button className="trace-btn-red hub-wide" disabled={!lap||!Number.isFinite(selectedTurn?.pct)} onClick={()=>lap&&onCompare(lap,selectedTurn.pct)}>Comparar en {selectedTurn?.label} <ArrowRight size={16}/></button><button className="trace-btn-ghost hub-wide" disabled={estimatesUsed||!Number.isFinite(selectedTurn?.pct)} onClick={()=>setTab('analysis')}>Analizar frenada y salida · {selectedTurn?.label} <Gauge size={16}/></button></div>
          </div></div></>}
        {tab==='braking'&&<><div className="hub-data-intro"><span className="trace-overline">BRAKING ANALYSIS</span><h2>Mis puntos de frenada</h2><p>Eventos reales del pedal de freno: inicio, presión máxima y duración. No tienen por qué corresponder uno a uno con las curvas T.</p></div>
          {zones.length?<div className="hub-turn-list">{zones.map(z=><button key={z.label} className="hub-turn-row" onClick={()=>setPct(z.pct)}><span className="hub-turn-number">{z.label}</span><span className="hub-turn-row-copy"><b>{z.title}</b><small>Inicio: {Math.round(z.startM)} m · {z.pct.toFixed(1)} % de vuelta</small></span><span className="hub-turn-speed">{Math.round(z.peakBrake)} %<small>{z.duration.toFixed(2)} s de frenada</small></span><ChevronRight size={15}/></button>)}</div>:<div className="hub-empty-message">No se han detectado frenadas significativas en esta vuelta, o no hay un registro seleccionado.</div>}
          {lap&&<button className="trace-btn-red hub-wide" onClick={()=>onCompare(lap,pct)}>Analizar frenadas en comparador <ArrowRight size={16}/></button>}</>}
        {tab==='analysis'&&<>
          <div className="hub-data-intro"><span className="trace-overline">DRIVING ENGINEERING / v0.7</span><h2>Rendimiento por curva</h2><p>Compara cada curva con otra vuelta del circuito, aunque sea de un equipo diferente. Analiza frenadas y salida usando telemetría registrada.</p></div>
          {lap&&<div className="v081-reference-explainer"><label className="c07-reference-picker">¿Con qué vuelta comparar?<select value={referenceId} onChange={e=>setReferenceId(e.target.value)}><option value="">{references.length?'Automática: tu mejor vuelta válida compatible':'Sin otra vuelta válida compatible'}</option>{references.map(l=><option key={l.id} value={l.id}>V{l.lapNumber} · {timeLabel(l.time)} · {l.car}</option>)}</select></label>
            <p>{reference?<><strong>Referencia actual: V{reference.lapNumber} · {timeLabel(reference.time)} · {reference.car}.</strong> Es una vuelta guardada o importada en ApexTrace; {referenceId?'la elegiste manualmente.':'se eligió automáticamente como la más rápida válida de ese circuito.'}</>:'Sin vuelta de referencia. Las métricas corresponden únicamente a tu vuelta seleccionada.'}</p></div>}
          {estimatesUsed&&<div className="hub-note"><BookOpen size={18}/><p>Estas T proceden de una estimación geométrica, no de un mapa de curvas confirmado. Los consejos por curva están desactivados hasta instalar las referencias automáticas; puedes seguir estudiando las frenadas reales y comparar las vueltas.</p></div>}
          <CornerCoach item={focusedCorner} onExplore={Number.isFinite(focusedCorner?.pct)?()=>{stopPlayback();setPct(focusedCorner.pct);}:null}/>
          {focusedCorner&&<div className="v08-focus-summary"><strong>Marcadores en el mapa</strong><span><b>F</b> Inicio de frenada · <b>M</b> Velocidad mínima · <b>G</b> Primer gas sostenido ≥85 %</span><small>El punto más lento no es necesariamente el vértice geométrico. Estos marcadores representan muestras de tu propia vuelta.</small></div>}
          <details className="v08-detail-disclosure"><summary>Ver presión, velocidades y distancias detalladas</summary>
            <AdvancedCornerAnalysis items={cornerItems} turns={turns} selectedTurn={turnNumber} lap={lap} reference={reference} onSelect={(number,p)=>{stopPlayback();setTurnNumber(number);if(Number.isFinite(p))setPct(p);}} onOpenComparison={lap?p=>onCompare(lap,p,reference?.id||null):null}/>
          </details>
        </>}
        {tab==='performance'&&<><div className="hub-data-intro"><span className="trace-overline">PERSONAL PERFORMANCE</span><h2>Tu rendimiento</h2><p>Estadísticas locales de este circuito y consejos de estudio.</p></div><LapInsights lap={lap} all={circuitLaps} track={active.id} goCompare={onCompare}/></>}
      </section></div>
      <div className="hub-footer-hint"><BookOpen size={17}/><span>Próxima mejora posible: límites oficiales de sectores S1/S2/S3 desde datos verificados del circuito o del protocolo F1 25. No utilizamos divisiones ficticias como sectores oficiales.</span></div>
    </>}
  </div>;
}
