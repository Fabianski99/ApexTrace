import { memo, useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
const RED='#ff3948', BLUE='#72b6f5';
const EMPTY_CORNERS=[];
function Hint({active,payload,label,unit,delta}){
  if(!active||!payload?.length)return null;
  return <div className="trace-tooltip"><strong>{Number(label).toFixed(1)}% de la vuelta</strong>{payload.filter(p=>p.value!=null).map(p=><div key={p.dataKey}><span><i style={{background:p.stroke}}/>{p.name}</span><b>{delta&&p.value>0?'+':''}{Number(p.value).toFixed(delta?3:0)} {unit}</b></div>)}</div>;
}
/** Crucial: the heavy Recharts graph never re-renders on each 30fps playhead step. */
const StaticGraph=memo(function StaticGraph({data,aKey,bKey,unit,domain,delta,corners,showCorners,onSeek}){
  const hasB=Boolean(bKey&&data.some(p=>p[bKey]!=null));
  return <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{top:15,right:15,left:-12,bottom:3}} onMouseMove={state=>{if(state?.activeLabel!=null&&onSeek)onSeek(Number(state.activeLabel));}} onClick={state=>{if(state?.activeLabel!=null&&onSeek)onSeek(Number(state.activeLabel));}}>
    <CartesianGrid vertical={false} stroke="#293341" strokeDasharray="3 7"/>
    <XAxis type="number" dataKey="pct" domain={[0,100]} ticks={[0,20,40,60,80,100]} tickFormatter={x=>`${x}%`} tickLine={false} axisLine={false} stroke="#8d99ae" fontSize={11}/>
    <YAxis domain={domain||['auto','auto']} tickLine={false} axisLine={false} stroke="#8d99ae" fontSize={11} width={54} tickFormatter={x=>Number(x).toFixed(Math.abs(x)<2?1:0)}/>
    {showCorners&&corners.map(c=><ReferenceLine key={c.label} x={c.pct} stroke="#d49b52" strokeOpacity={.38} strokeDasharray="3 5" label={{value:c.label,fill:'#c89c60',fontSize:10,position:'top'}}/>)}
    {delta&&<ReferenceLine y={0} stroke="#748396" strokeDasharray="4 4"/>}
    <Tooltip isAnimationActive={false} content={<Hint unit={unit} delta={delta}/>}/>
    <Line name={delta?'Delta acumulado':'Vuelta A'} type="linear" dataKey={aKey} stroke={RED} strokeWidth={2.3} dot={false} activeDot={{r:4}} isAnimationActive={false} connectNulls={false}/>
    {hasB&&<Line name="Vuelta B" type="linear" dataKey={bKey} stroke={BLUE} strokeWidth={2} dot={false} activeDot={{r:4}} isAnimationActive={false} connectNulls={false}/>}</LineChart></ResponsiveContainer>;
});
function TelemetryChart({title,description,data=[],aKey,bKey,unit='',domain,delta=false,pct,onSeek,height=248,corners=EMPTY_CORNERS,showCorners=false}){
  const hasA=useMemo(()=>data.some(p=>p[aKey]!=null),[aKey,data]);
  const hasB=useMemo(()=>bKey&&data.some(p=>p[bKey]!=null),[bKey,data]);
  return <section className="trace-chart-card">
    <div className="trace-chart-heading"><div><h3>{title}</h3><p>{description}</p></div><div className="trace-mini-legend"><span><i style={{background:RED}}/> {delta?'A − B':'Vuelta A'}</span>{hasB&&<span><i style={{background:BLUE}}/> Vuelta B</span>}</div></div>
    {!hasA?<div className="trace-empty-chart">No hay datos de este canal para las vueltas seleccionadas.</div>:<div style={{height}} className="trace-chart-area trace-chart-layer">
      <StaticGraph data={data} aKey={aKey} bKey={bKey} unit={unit} domain={domain} delta={delta} corners={corners} showCorners={showCorners} onSeek={onSeek}/>
      {/* A lightweight line moves without forcing Recharts to redraw 400×2×5 samples. */}
      <div aria-hidden="true" className="trace-playhead-range"><i className="trace-playhead-line" style={{left:`${Math.max(0,Math.min(100,pct||0))}%`}}/></div>
    </div>}
    <div className="trace-chart-footer">{delta?'Delta positivo: A pierde tiempo frente a B · Negativo: A gana':'Arrastra el cursor sobre el gráfico para seguir el recorrido en el mapa.'}</div>
  </section>;
}
export default memo(TelemetryChart);
