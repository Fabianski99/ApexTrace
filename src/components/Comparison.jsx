import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowLeftRight, ChevronRight, CircleAlert, Clock3, Gauge, Pause, Play, RotateCcw, Timer, Zap } from 'lucide-react';
import TelemetryChart from './TelemetryChart';
import TrackMap from './TrackMap';
import Insights from './Insights';
import AdvancedCornerAnalysis from './AdvancedCornerAnalysis';
import { CornerCoach, ComparisonOverview, MapDrivingKey } from './DrivingCoach';
import { buildDeltaSections, markersForTurn, theoreticalIdeal } from '../utils/drivingInsights';
import { guideFor, loadTurnAnnotations, numberedTurns } from '../utils/trackGuide';
import { getCircuit, loadCircuitAtlas } from '../utils/circuits';
import { prepareTrack, alignLapToTrack, lapPercentAtMapPosition } from '../utils/trackGeometry';
import { compareTurnSamples } from '../utils/cornerAnalysis';
import { makeComparison, sameCircuitLaps, signedTime, timeLabel } from '../utils/analysis';
import { circuitId } from '../utils/circuits';

const PEDAL_DOMAIN=[0,100];
const EMPTY_CORNERS=[];
const optionLabel = lap => `${lap.track} · ${lap.car} · ${timeLabel(lap.time)} · V${lap.lapNumber}${lap.valid===false?' (inválida)':''}`;

export default function Comparison({ laps, idA, idB, setIdA, setIdB, targetTrack = '', focus = null, onRecorder }) {
  const [pct,setPct]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [speed,setSpeed]=useState(2);
  const rafRef=useRef(0);
  const [turnAnnotations,setTurnAnnotations]=useState(null);
  const [advancedTurn,setAdvancedTurn]=useState(1);
  const [mapMode,setMapMode]=useState('delta');
  const a=laps.find(l=>l.id===idA);
  const b=laps.find(l=>l.id===idB);
  const compatible=sameCircuitLaps(a,b);
  const result=useMemo(()=>compatible?makeComparison(a,b):null,[compatible,a,b]);
  useEffect(()=>{let active=true;setTurnAnnotations(null);if(!compatible||!a)return;
    loadTurnAnnotations(a.track).then(v=>{if(active)setTurnAnnotations(v);}).catch(()=>{});
    return()=>{active=false;};
  },[compatible,a?.track]);
  const [atlas,setAtlas]=useState(null);
  useEffect(()=>{let live=true;loadCircuitAtlas().then(v=>{if(live)setAtlas(v)}).catch(()=>{});return()=>{live=false}},[]);
  const shape=useMemo(()=>a&&atlas?prepareTrack(atlas[getCircuit(a.track)?.id]):null,[a?.track,atlas]);
  const alignment=useMemo(()=>alignLapToTrack(shape,a),[shape,a]);
  const advancedTurns=useMemo(()=>{
    if(!compatible)return [];
    return numberedTurns(a.track,turnAnnotations).map(turn=>{
      const pct=turn.mapPosition?lapPercentAtMapPosition(shape,alignment,turn.mapPosition):turn.pct;
      return {...turn,pct:Number.isFinite(pct)?pct:null};
    });
  },[compatible,a?.track,turnAnnotations,shape,alignment]);
  const estimatedCorners=false;
  const advancedItems=useMemo(()=>compatible&&!estimatedCorners?compareTurnSamples(a,b,advancedTurns):[],[compatible,a,b,advancedTurns,estimatedCorners]);
  const sectionsV08=useMemo(()=>compatible?buildDeltaSections(a,b):[],[compatible,a,b]);
  const ideal=useMemo(()=>a?theoreticalIdeal(laps,a.track):null,[laps,a?.track]);
  const focusedItem=useMemo(()=>advancedItems.find(t=>t.number===advancedTurn)||null,[advancedItems,advancedTurn]);
  const focusMarkers=useMemo(()=>markersForTurn(a,focusedItem),[a,focusedItem]);
  const filteredLaps=useMemo(()=>targetTrack?laps.filter(l=>circuitId(l.track)===circuitId(targetTrack)):laps,[laps,targetTrack]);
  // B only shows the same circuit, without any team restriction.
  const referenceOptions=useMemo(()=>a?filteredLaps.filter(l=>l.id!==a.id && circuitId(l.track)===circuitId(a.track)):[],[a,filteredLaps]);
  useEffect(()=>{
    if(!a || (b && sameCircuitLaps(a,b)))return;
    // Automatically select the best valid compatible circuit lap, including other teams.
    const chosen=[...referenceOptions].filter(l=>l.valid!==false).sort((x,y)=>x.time-y.time)[0]||referenceOptions[0];
    if(idB!==(chosen?.id||''))setIdB(chosen?.id||'');
  },[a,b,idB,referenceOptions,setIdB]);
  useEffect(()=>{setPlaying(false);setPct(0);},[idA,idB]);
  useEffect(()=>{if(focus?.token!=null){setPlaying(false);setPct(Math.min(100,Math.max(0,focus.pct||0)));}},[focus?.token]);
  useEffect(()=>{
    if(!playing||!result||!a)return undefined;
    let prev=performance.now(),lastCommit=0;
    const tick=now=>{
      if(now-lastCommit>=32){ // Cap React updates at about 30fps; chart data stays memoized.
        const elapsed=Math.min(.10,(now-prev)/1000);prev=now;lastCommit=now;
        setPct(old=>Math.min(100,old+100*elapsed*speed/a.time));
      }
      rafRef.current=requestAnimationFrame(tick);
    };
    rafRef.current=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(rafRef.current);
  },[playing,result,a,speed]);
  useEffect(()=>{if(playing&&pct>=100)setPlaying(false)},[playing,pct]);
  const cursor= result?.data[Math.min(result.data.length-1,Math.max(0,Math.round(pct*4)))];
  const delta=a&&b?a.time-b.time:0;
  return <div className="trace-stack">
    <header className="trace-page-title"><div><span className="trace-overline">LAP ANALYSIS / 01</span><h1>Comparar vueltas<span className="trace-dot">.</span></h1><p>Compara dos vueltas del mismo circuito, aunque los pilotos hayan utilizado equipos diferentes.</p></div><div className="trace-header-decor"><Activity size={30}/></div></header>
    <div className="trace-compare-selectors">
      <label className="trace-lap-selector"><span><i className="trace-color-a"/> VUELTA A <em>Principal</em></span><select value={idA} onChange={e=>setIdA(e.target.value)}><option value="">Selecciona una vuelta</option>{filteredLaps.map(l=><option value={l.id} key={l.id}>{optionLabel(l)}</option>)}</select><strong>{a?timeLabel(a.time):'—'}</strong><small>{a?`${a.track} · ${a.car}`:'Esperando selección'}</small></label>
      <button className="trace-swap" title="Intercambiar A y B" onClick={()=>{setIdA(idB);setIdB(idA);}}><ArrowLeftRight size={21}/></button>
      <label className="trace-lap-selector"><span><i className="trace-color-b"/> VUELTA B <em>Referencia seleccionada</em></span><select value={idB} onChange={e=>setIdB(e.target.value)}><option value="">Selecciona una vuelta del circuito</option>{referenceOptions.map(l=><option value={l.id} key={l.id}>{optionLabel(l)}</option>)}</select><strong>{b?timeLabel(b.time):'—'}</strong><small>{b?`${b.track} · ${b.car}`:'Esperando selección'}</small></label>
    </div>
    {!a||!b ? <div className="trace-empty-large"><Activity size={37}/><h3>Selecciona dos vueltas</h3><p>Sincroniza tus vueltas de F1 25 desde el Recorder y escoge dos registros para comparar.</p><button onClick={onRecorder} className="trace-btn-red">Ir al Recorder <ChevronRight size={16}/></button></div> : !compatible ? <div className="trace-alert"><CircleAlert size={21}/><div><strong>Estas vueltas no son comparables.</strong><p>Elige dos vueltas diferentes del mismo circuito de F1 25. El equipo puede ser distinto.</p></div></div> : <>
      <div className="v081-reference-explainer v081-reference-comparator">
        <strong>Comparación de vueltas guardadas o importadas</strong>
        <p><b>A:</b> V{a.lapNumber} · {timeLabel(a.time)} · {a.car} (vuelta analizada). <b>B:</b> V{b.lapNumber} · {timeLabel(b.time)} · {b.car} (referencia seleccionada). Los deltas y valores B proceden de estos dos archivos F1 25.</p>
      </div>
      {a.car!==b.car&&<div className="trace-alert"><CircleAlert size={18}/><div><strong>Comparación entre equipos distintos: {a.car} vs {b.car}.</strong><p>Se permite comparar sin restricciones de coche. Para interpretar las diferencias como conducción, comprueba que ambos jugaron con rendimiento equivalente y condiciones similares; ApexTrace no puede verificar ese ajuste.</p></div></div>}
      {Number.isFinite(a.distance)&&Number.isFinite(b.distance)&&a.distance>0&&b.distance>0&&Math.abs(a.distance-b.distance)/Math.max(a.distance,b.distance)>.02&&<div className="trace-alert"><CircleAlert size={18}/>Distancias registradas distintas para este circuito. Comprueba que ambas vueltas usen la misma variante del trazado; la comparación porcentual podría ser inexacta.</div>}
      {(a.valid===false||b.valid===false)&&<div className="trace-alert"><CircleAlert size={18}/>Una de las vueltas fue invalidada por F1 25. Se muestra para analizar conducción, no como mejor tiempo válido.</div>}
      <div className="trace-metric-grid trace-compare-metrics">
        <div className="trace-metric"><span>DELTA A − B</span><strong className={delta>0?'trace-loss':delta<0?'trace-gain':''}>{signedTime(delta)}</strong><small>{delta>0?'A es más lenta':delta<0?'A es más rápida':'Igual ritmo'}</small></div>
        <div className="trace-metric"><span>VELOCIDAD PUNTA</span><strong>{a.maxSpeed} <em>/ {b.maxSpeed}</em> <small>km/h</small></strong><small>A / B</small></div>
        <div className="trace-metric"><span>DISTANCIA</span><strong>{(a.distance/1000).toFixed(2)} <small>km</small></strong><small>{a.track}</small></div>
        <div className="trace-metric"><span>DIFERENCIA ACTUAL</span><strong className={cursor?.delta>0?'trace-loss':'trace-gain'}>{signedTime(cursor?.delta||0)}</strong><small>A − B en el punto seleccionado</small></div>
      </div>
      <ComparisonOverview a={a} b={b} sections={sectionsV08} turnItems={advancedItems} ideal={ideal} onFocus={p=>{setPct(p);setPlaying(false);}}/>
      <section className="trace-sync-panel"><div className="trace-sync-top"><div><span className="trace-overline">SYNCHRONIZED PLAYHEAD</span><h3>Sigue tu vuelta en el circuito</h3></div><span className="trace-position-chip"><Zap size={14}/> {pct.toFixed(1)}% recorrido</span></div><div className="trace-sync-controls"><button className="trace-play" onClick={()=>{if(pct>=99.9)setPct(0);setPlaying(!playing);}} title={playing?'Pausar':'Reproducir'}>{playing?<Pause size={19}/>:<Play size={19} fill="currentColor"/>}</button><button className="trace-reset" onClick={()=>{setPlaying(false);setPct(0);}} title="Volver al inicio"><RotateCcw size={18}/></button><input className="trace-scrubber" type="range" min="0" max="100" step=".25" aria-label="Posición de la vuelta en porcentaje" value={pct} onChange={e=>{setPlaying(false);setPct(Number(e.target.value));}} style={{'--fill':`${pct}%`}}/><select className="trace-speed-control" aria-label="Velocidad de reproducción" value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option><option value={8}>8×</option></select></div><div className="trace-sync-time"><span><Clock3 size={13}/> A: {timeLabel(cursor?.tA)}</span><span>B: {timeLabel(cursor?.tB)}</span><span>Arrastra la línea o haz clic en cualquier gráfico</span></div></section>
      <section className="v08-map-workspace">
        <div className="v08-map-head"><div><span className="trace-overline">TRACK INTELLIGENCE / v0.8</span><h2>Entiende la diferencia en el mapa</h2><p>Un objetivo por vez: tiempo, separación o frenada. Selecciona una curva para localizar sus eventos y evita interpretar los símbolos como una trazada ideal.</p></div><div className="v08-mode-switch" role="group" aria-label="Vista del mapa">
          <button className={mapMode==='delta'?'active':''} onClick={()=>setMapMode('delta')}>Dónde pierdo / gano</button>
          <button className={mapMode==='ghost'?'active':''} onClick={()=>setMapMode('ghost')}>Ghost A vs B</button>
          <button className={mapMode==='brake'?'active':''} onClick={()=>setMapMode('brake')}>Frenada y salida</button>
        </div></div>
        <div className="v08-map-stage">
          <TrackMap lap={a} comparisonLap={b} trackName={a.track} pct={pct} corners={EMPTY_CORNERS} onSeek={value=>{setPct(value);setPlaying(false);}} mapMode={mapMode} heatSections={sectionsV08} focusMarkers={mapMode==='brake'?focusMarkers:[]} turns={mapMode==='brake'?advancedTurns:[]} activeTurn={advancedTurn} onTurnSelect={number=>{setAdvancedTurn(number);const turn=advancedTurns.find(t=>t.number===number);if(Number.isFinite(turn?.pct))setPct(turn.pct);setPlaying(false);}}/>
          <div className="v08-map-aside">
            <div className="v08-map-aside-intro"><span className="trace-overline">ENTRENAMIENTO PERSONAL</span><h3>Elige una curva</h3><p>Estudiamos tus dos vueltas. No usamos tiempos externos ni una trazada ideal inventada.</p></div>
            <label className="v08-turn-picker">Curva en el mapa<select value={advancedTurn} onChange={e=>{const num=Number(e.target.value);setAdvancedTurn(num);const t=advancedTurns.find(v=>v.number===num);if(Number.isFinite(t?.pct))setPct(t.pct);setPlaying(false);}}>{advancedTurns.map(t=><option key={t.number} value={t.number}>{t.label}{t.name?` · ${t.name}`:''}{!Number.isFinite(t.pct)?' (sin ubicación)':''}</option>)}</select></label>
            {estimatedCorners&&<p className="v08-map-disclaimer">Curvas T estimadas a partir de X/Z: se pueden localizar en el mapa, pero los consejos por curva estarán disponibles cuando instales las referencias de circuito 2025.</p>}
            <CornerCoach item={focusedItem} onExplore={focusedItem?()=>{setMapMode('brake');setPct(focusedItem.pct);setPlaying(false);}:null} compact/>
            <MapDrivingKey markers={mapMode==='brake'?focusMarkers:[]} heat={mapMode==='delta'} ghost={mapMode==='ghost'}/>
            <p className="v08-map-disclaimer">El punto M marca el lugar más lento de esta zona; no identifica el apex geométrico. Frenar más tarde no siempre es mejor.</p>
          </div>
        </div>
        <details className="v08-detail-disclosure"><summary>Ver las zonas de baja velocidad detectadas automáticamente</summary><div className="trace-zones-list">{result.corners.map(zone=><button className="trace-zone-row" onClick={()=>{setPct(zone.pct);setPlaying(false);}} key={zone.label}><b>{zone.label}</b><span><strong>{zone.title} · {zone.pct.toFixed(1)}%</strong><small>Velocidad mínima ~{Math.round(zone.speed)} km/h</small></span><em className={zone.delta>0?'trace-loss':'trace-gain'}>{signedTime(zone.delta)}</em><ChevronRight size={14}/></button>)}</div><p className="trace-method-note">Las zonas Z son mínimos de velocidad, no las curvas oficiales T.</p></details>
      </section>
      <div className="trace-section-header"><div><span className="trace-overline">DATA LAYERS</span><h2>Telemetría superpuesta</h2><p>Rojo: A · Azul: B · Línea blanca: posición sincronizada</p></div></div>
      <TelemetryChart title="Velocidad" description="Observa cuánto mantienes antes, durante y después de cada frenada" data={result.data} aKey="speedA" bKey="speedB" unit="km/h" pct={pct} onSeek={setPct} corners={result.corners} showCorners height={280}/>
      <div className="trace-two-col"><TelemetryChart title="Acelerador" description="100% = pedal completamente presionado" data={result.data} aKey="throttleA" bKey="throttleB" unit="%" domain={PEDAL_DOMAIN} pct={pct} onSeek={setPct}/><TelemetryChart title="Freno" description="100% = máxima presión registrada del pedal" data={result.data} aKey="brakeA" bKey="brakeB" unit="%" domain={PEDAL_DOMAIN} pct={pct} onSeek={setPct}/></div>
      <div className="trace-two-col"><TelemetryChart title="Delta de tiempo" description="Cuándo ganas o pierdes tiempo acumulado" data={result.data} aKey="delta" delta unit="s" pct={pct} onSeek={setPct}/><TelemetryChart title="Marcha" description="Relación de transmisión engranada" data={result.data} aKey="gearA" bKey="gearB" pct={pct} onSeek={setPct}/></div>
      <details className="v08-detail-disclosure v08-technical-analysis"><summary>Ver análisis técnico completo por curva (v0.7)</summary><section className="trace-card c07-comparison-panel">
        <AdvancedCornerAnalysis variant="compare" lap={a} reference={b} turns={advancedTurns} items={advancedItems} selectedTurn={advancedTurn} onSelect={(number,p)=>{setPlaying(false);setAdvancedTurn(number);if(Number.isFinite(p))setPct(p);}} onOpenComparison={p=>{setPlaying(false);setPct(p);}}/>
      </section></details>
      <Insights result={result} a={a} b={b} onSeek={setPct}/>
      <section className="trace-section-breakdown"><div className="trace-panel-head"><div><span className="trace-overline">LAP SEGMENTS</span><h3>Desglose por distancia</h3><p>Tiempo ganado o perdido en cada 10% de recorrido</p></div><Timer size={20}/></div><div className="trace-segments">{result.sections.map(s=><button key={s.start} className="trace-segment" onClick={()=>setPct(s.start+5)}><span>{s.start}–{s.end}%</span><div className="trace-segment-track"><i className={s.delta>0?'loss':'gain'} style={{width:`${Math.min(100,Math.abs(s.delta)/Math.max(.03,...result.sections.map(p=>Math.abs(p.delta)))*100)}%`}}/></div><strong className={s.delta>0?'trace-loss':'trace-gain'}>{signedTime(s.delta)}</strong></button>)}</div><p className="trace-method-note">Los tramos de 10% no son los sectores oficiales de F1 25. Se calculan a partir de las marcas de tiempo interpoladas por distancia.</p></section>
    </>}
  </div>;
}
