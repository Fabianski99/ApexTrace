import { memo, useMemo } from 'react';
import { Activity, ArrowRight, Gauge, Lightbulb, ShieldAlert, Timer, Zap } from 'lucide-react';
import { adviceForTurn, summarizeCornerPerformance } from '../utils/cornerAnalysis';
import { signedTime } from '../utils/analysis';

const unit = (value, suffix='', digits=0) => Number.isFinite(value) ? `${Number(value).toFixed(digits)}${suffix}` : '—';
const difference = (value, suffix='', decimals=0) => Number.isFinite(value)?`${value>0?'+':''}${value.toFixed(decimals)}${suffix}`:'—';

const CornerKpi=memo(function CornerKpi({label,value,reference,subtitle,referenceLabel='Vuelta B'}){
  return <div className="c07-metric"><span>{label}</span><strong>{value}</strong>{reference&&<small>{referenceLabel}: {reference}</small>}{subtitle&&<small>{subtitle}</small>}</div>;
});

export default function AdvancedCornerAnalysis({items,turns,selectedTurn=1,onSelect,onOpenComparison,lap,reference,variant='hub'}) {
  const summary=useMemo(()=>summarizeCornerPerformance(items),[items]);
  const focused=items.find(row=>row.number===selectedTurn)||null;
  const missingTurn=turns.find(t=>t.number===selectedTurn);
  const recommendations=useMemo(()=>adviceForTurn(focused),[focused]);
  return <div className={`c07-root ${variant==='compare'?'c07-compare':''}`}>
    <div className="c07-intro">
      <div><span className="trace-overline">APEXTRACE / CORNER ENGINEERING</span><h3>Análisis avanzado de curvas</h3><p>Frenada real, velocidad de paso y salida de curva. Comparación de tus propias vueltas por distancia recorrida.</p></div>
      <span className="c07-provisional"><ShieldAlert size={15}/> Estimaciones por zona</span>
    </div>
    {!lap?<div className="hub-empty-message">Selecciona una vuelta grabada en F1 25 para ver el análisis. No se requieren cambios en el Recorder.</div>:<>
      <div className="c07-summary">
        <span><Activity size={16}/> <b>{summary.measured}</b> curvas con posición disponible</span>
        <span><Gauge size={16}/> <b>{summary.comparable}</b> tramos comparables</span>
        <span><Timer size={16}/> {reference?`Referencia propia: vuelta ${reference.lapNumber} · ${reference.car} · ${reference.time.toFixed(3)} s`:'Sin otra vuelta de referencia compatible'}</span>
      </div>
      {reference&&summary.comparable>0&&<div className="c07-opportunities">
        <div><span className="c07-opportunity-title">Mayor pérdida aproximada</span>{summary.biggestLoss.length?summary.biggestLoss.map(t=><button onClick={()=>onSelect(t.number,t.pct)} key={t.number}><b>{t.label}</b><span>{signedTime(t.delta)}</span><ArrowRight size={15}/></button>):<small>No hay pérdidas de al menos 0.035 s por tramo.</small>}</div>
        <div><span className="c07-opportunity-title">Mayor ganancia aproximada</span>{summary.biggestGain.length?summary.biggestGain.map(t=><button onClick={()=>onSelect(t.number,t.pct)} key={t.number}><b>{t.label}</b><span>{signedTime(t.delta)}</span><ArrowRight size={15}/></button>):<small>No hay ganancias de al menos 0.035 s por tramo.</small>}</div>
      </div>}
      {reference&&summary.comparable>0&&<p className="v081-reference-note">Los tiempos de curvas son ventanas aproximadas que pueden solaparse. No sumes sus ganancias o pérdidas como si fueran sectores independientes.</p>}
      <div className="c07-turn-controls"><label htmlFor={`c07-turn-${variant}`}>Curva a estudiar</label><select id={`c07-turn-${variant}`} value={selectedTurn} onChange={e=>{const number=Number(e.target.value),t=turns.find(v=>v.number===number);onSelect(number,t?.pct);}}>{turns.map(t=><option value={t.number} key={t.number}>{t.label} · {t.name||`Curva ${t.number}`}{Number.isFinite(t.pct)?'':' · sin posición'}</option>)}</select></div>
      {focused?<>
        <div className="c07-corner-heading"><div><span className="c07-corner-pill">{focused.label}</span><div><h4>{focused.name}</h4><p>Alrededor del {focused.pct.toFixed(1)} % · tramo de {unit(focused.segmentMeters,' m')} · {reference?'A vs. B':'vuelta individual'}</p></div></div><strong className={focused.delta>0.035?'trace-loss':focused.delta<-.035?'trace-gain':''}>{Number.isFinite(focused.delta)?signedTime(focused.delta):'—'}</strong></div>
        <p className="v081-reference-note">{reference?`A = vuelta que estás estudiando. B = tu vuelta ${reference.lapNumber} (${reference.car}, ${reference.time.toFixed(3)} s). Las diferencias se calculan contra ella.`:'Solo se analiza tu vuelta; no existe una referencia adicional.'}</p>
        <div className="c07-metric-grid v081-core-metrics">
          <CornerKpi label="Velocidad mínima en esta zona" value={unit(focused.minSpeed,' km/h')} reference={focused.reference?unit(focused.reference.minSpeed,' km/h'):null} subtitle={Number.isFinite(focused.speedDifference)?`A − B: ${difference(focused.speedDifference,' km/h',1)}`:null}/>
          <CornerKpi label="Pico de freno detectado" value={focused.brake?unit(focused.brake.peakBrake,' %',1):'No detectado'} reference={focused.reference?.brake?unit(focused.reference.brake.peakBrake,' %',1):null}/>
          <CornerKpi label="Inicio de frenada" value={focused.brake?unit(focused.brake.startM,' m',0):'Sin evento'} reference={focused.reference?.brake?unit(focused.reference.brake.startM,' m',0):null} subtitle={Number.isFinite(focused.brakingDifferenceM)?`${difference(focused.brakingDifferenceM,' m',1)} (A respecto a B; positivo = más tarde)`:null}/>
        </div>
        <div className="c07-insights"><div className="c07-insights-title"><Lightbulb size={17}/><strong>Observaciones para entrenar</strong></div>{recommendations.map((text,i)=><p key={i}>{text}</p>)}</div>
        <details className="v081-more-metrics"><summary>Ver métricas técnicas de salida y duración de frenada</summary>
          <div className="c07-metric-grid">
            <CornerKpi label="Duración de frenada" value={focused.brake?unit(focused.brake.duration,' s',2):'—'} reference={focused.reference?.brake?unit(focused.reference.brake.duration,' s',2):null}/>
            <CornerKpi label="Acelerador medio de salida" value={unit(focused.meanExitThrottle,' %',0)} reference={focused.reference?unit(focused.reference.meanExitThrottle,' %',0):null} subtitle={Number.isFinite(focused.throttleDifference)?`A − B: ${difference(focused.throttleDifference,' pp',1)}`:null}/>
            <CornerKpi label="Velocidad al salir" value={unit(focused.exitSpeed,' km/h')} reference={focused.reference?unit(focused.reference.exitSpeed,' km/h'):null}/>
            <CornerKpi label="Aceleración media de salida" value={unit(focused.exitAcceleration,' m/s²',1)} reference={focused.reference?unit(focused.reference.exitAcceleration,' m/s²',1):null} subtitle="Cambio de velocidad / tiempo, estimado"/>
            <CornerKpi label="Gas sostenido ≥85 %" value={unit(focused.fullThrottleDistance,' m',0)} reference={focused.reference?unit(focused.reference.fullThrottleDistance,' m',0):null} subtitle="Distancia desde la curva; puede no alcanzarse"/>
          </div>
        </details>
        <div className="c07-actions">{onOpenComparison&&<button className="trace-btn-red" onClick={()=>onOpenComparison(focused.pct)}>Ver telemetría en {focused.label} <ArrowRight size={16}/></button>}<span><Zap size={14}/> Los datos de salida corresponden a una ventana alrededor de la curva, no a una única muestra.</span></div>
      </>:<div className="hub-empty-message">{missingTurn?.pct==null?'Esta curva tiene número, pero no posición documentada. No se calculan métricas ficticias.':'No hay suficientes muestras para analizar esta curva.'}</div>}
      <p className="c07-disclaimer">Metodología: franjas de hasta ±2,25 % de distancia por curva, limitadas por la curva vecina. Las frenadas se detectan mediante umbrales de pedal y pueden estar compartidas entre curvas. Las ubicaciones T de fuentes comunitarias y las estimaciones de Monza no son marcas FIA; los tiempos por tramo NO son sectores oficiales. Una diferencia observada no demuestra su causa.</p>
    </>}
  </div>;
}
