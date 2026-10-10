import { memo, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, Flag, Info, Lightbulb, Target, Timer, Zap } from 'lucide-react';
import { prioritySegments, simpleCornerAdvice } from '../utils/drivingInsights';
import { timeLabel } from '../utils/analysis';

/** Progressive disclosure: one main insight, optional technical data elsewhere. */
export const CornerCoach=memo(function CornerCoach({item,onExplore,compact=false}){
  const insight=useMemo(()=>simpleCornerAdvice(item),[item]);
  return <div className={`v08-coach v08-coach-${insight.tone} ${compact?'v08-coach-compact':''}`}>
    <div className="v08-coach-eyebrow"><Lightbulb size={15}/> QUÉ SIGNIFICAN TUS DATOS</div>
    <h3>{insight.headline}</h3>
    <p>{insight.explanation}</p>
    <div className="v08-coach-action"><Target size={16}/><span><strong>Qué revisar:</strong> {insight.action}</span></div>
    {onExplore&&<button className="v08-inline-action" onClick={onExplore}>Ver esta zona en el mapa <ArrowRight size={15}/></button>}
  </div>;
});

export function ComparisonOverview({a,b,sections,turnItems,onFocus,ideal}){
  const losses=useMemo(()=>prioritySegments(sections),[sections]);
  const [more,setMore]=useState(false);
  const total=a&&b?a.time-b.time:0;
  const strongest=turnItems?.filter(t=>Number.isFinite(t.delta)&&t.delta>.05).sort((x,y)=>y.delta-x.delta)?.[0];
  return <section className="v08-overview trace-card">
    <div className="v08-overview-title"><div><span className="trace-overline">RESUMEN INTUITIVO / COMPARADOR 2.0</span><h2>¿Qué cambió entre estas vueltas?</h2><p>Primero lo esencial. Explora los gráficos solo cuando quieras profundizar.</p></div><span className={`v08-outcome ${total>0.025?'loss':total<-.025?'gain':'even'}`}>{Math.abs(total).toFixed(3)} s <small>{total>.025?'A más lenta':total<-.025?'A más rápida':'casi iguales'}</small></span></div>
    <div className="v08-quick-grid">
      <div className="v08-quick-card"><span><Flag size={16}/> Zona que conviene revisar</span><strong>{strongest?`${strongest.label} · ${strongest.name}`:losses[0]?`${losses[0].start.toFixed(0)}–${losses[0].end.toFixed(0)} %`:'Sin pérdidas destacadas'}</strong><p>{strongest?`En este tramo A pierde ~${strongest.delta.toFixed(3)} s.`:losses[0]?`A pierde ${losses[0].delta.toFixed(3)} s en este minisector.`:'No hay una zona claramente peor en los registros.'}</p>{(strongest||losses[0])&&<button className="v08-inline-action" onClick={()=>onFocus(strongest?.pct??losses[0].mid)}>Ir al tramo <ArrowRight size={14}/></button>}</div>
      <div className="v08-quick-card"><span><Zap size={16}/> Cómo leer el mapa</span><strong>Verde recuperas · Rojo pierdes</strong><p>Los colores representan diferencias de tiempo entre tramos, no la calidad absoluta de tu conducción.</p></div>
      <div className="v08-quick-card"><span><Timer size={16}/> Tu vuelta ideal teórica</span><strong>{ideal?timeLabel(ideal.seconds):'Necesita 2 vueltas válidas'}</strong><p>{ideal?`Combinando los mejores 20 minisectores de ${ideal.lapCount} vueltas del circuito, incluso de distintos equipos. Margen teórico: ${ideal.improvement.toFixed(3)} s.`:'Importa o registra dos vueltas válidas del mismo circuito para calcularla.'}</p></div>
    </div>
    <button className="v08-disclosure-btn" onClick={()=>setMore(v=>!v)} aria-expanded={more}><Info size={16}/>{more?'Ocultar explicación':'¿Cómo se calculan estos resultados?'}<ChevronDown size={15} className={more?'v08-rotate':''}/></button>
    {more&&<p className="v08-explanation">Las vueltas se alinean por distancia; el delta mide cuánto tarda A frente a B en recorrer el mismo tramo. Los 20 minisectores de la vuelta ideal se toman de vueltas válidas del mismo circuito, incluso si los equipos son distintos. Solo tiene sentido como referencia cuando el rendimiento y las condiciones sean comparables. Es una estimación matemática, no una vuelta necesariamente realizable. Condiciones, desgaste, ayudas y setups pueden variar.</p>}
  </section>;
}

export const MapDrivingKey=memo(function MapDrivingKey({markers=[],ghost=false,heat=false}){
  return <div className="v08-map-key"><span><i className="v08-key-dot key-a"/> Vuelta A</span>{ghost&&<span><i className="v08-key-dot key-b"/> Ghost B, mismo tiempo</span>}{heat&&<><span><i className="v08-key-line key-loss"/> A pierde tiempo</span><span><i className="v08-key-line key-gain"/> A gana tiempo</span></>}{markers.some(m=>m.kind==='brake')&&<span><b className="v08-key-letter">F</b> Inicio de frenada</span>}{markers.some(m=>m.kind==='minimum')&&<span><b className="v08-key-letter">M</b> Punto más lento (no apex)</span>}{markers.some(m=>m.kind==='throttle')&&<span><b className="v08-key-letter">G</b> Gas sostenido ≥85 %</span>}</div>;
});
