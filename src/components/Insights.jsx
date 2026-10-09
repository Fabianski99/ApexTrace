import { BrainCircuit, CircleCheck, CircleAlert, Crosshair } from 'lucide-react';
import { buildInsights } from '../utils/analysis';
export default function Insights({result,a,b,onSeek}){
  const insights=buildInsights(result,a,b);
  return <section className="trace-insights">
    <div className="trace-panel-head"><div><span className="trace-overline">DRIVING INTELLIGENCE</span><h3>¿Dónde puedes mejorar?</h3><p>Observaciones automáticas basadas en las dos vueltas seleccionadas</p></div><span className="trace-panel-icon"><BrainCircuit size={21}/></span></div>
    <div className="trace-insight-list">{insights.map((note,i)=><div className={`trace-insight-item ${note.type}`} key={i}>{note.type==='good'?<CircleCheck size={20}/>:note.type==='warning'?<CircleAlert size={20}/>:<Crosshair size={20}/>}<div><h4>{note.title}</h4><p>{note.body}</p></div>{note.title.includes('%')&&<button onClick={()=>{const match=note.title.match(/(\d+)–/);if(match)onSeek(Number(match[1])+5);}}>Ver zona</button>}</div>)}</div>
    <p className="trace-method-note">Análisis descriptivo, no recomendaciones de pilotaje garantizadas. Los tramos son divisiones por distancia y las zonas Z son mínimos de velocidad detectados, no curvas oficiales ni sectores FIA.</p>
  </section>;
}
