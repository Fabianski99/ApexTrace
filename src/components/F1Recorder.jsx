import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowRight, CheckCircle2, CircleAlert, CloudOff, FileJson2, FolderOpen, Gauge, RadioTower, RefreshCcw, ShieldCheck, Wifi, WifiOff, UploadCloud, Laptop, Link2 } from 'lucide-react';
import { normalizeF125Lap, fetchRecorder, RECORDER_BASE } from '../utils/f125';
import { readSharedFiles } from '../utils/lapSharing';
import { timeLabel } from '../utils/analysis';
export default function F1Recorder({onReceive,onHistory}){
 const hosted = !['localhost','127.0.0.1'].includes(window.location.hostname);
 const [localEnabled,setLocalEnabled]=useState(!hosted);
 const [status,setStatus]=useState(null),[online,setOnline]=useState(false),[syncing,setSyncing]=useState(false),[auto,setAuto]=useState(!hosted),[feedback,setFeedback]=useState(''),[dragging,setDragging]=useState(false),[importing,setImporting]=useState(false);
 const countRef=useRef(-1),lock=useRef(false);
 const synchronize=useCallback(async (quiet=false)=>{
  if(lock.current)return;lock.current=true;setSyncing(true);
  try{const payload=await fetchRecorder('/api/laps');if(!Array.isArray(payload.laps))throw new Error('Respuesta inesperada del Recorder.');
   const converted=payload.laps.map(normalizeF125Lap);
   const added=await onReceive(converted);
   countRef.current=payload.laps.length;
   if(!quiet||added)setFeedback(added?`${added} vuelta(s) nueva(s) sincronizadas con tu historial.`:'Todo actualizado. No se encontraron vueltas nuevas.');
  }catch(e){if(!quiet)setFeedback(`Error al sincronizar: ${e.message}`)}finally{lock.current=false;setSyncing(false);}
 },[onReceive]);
 useEffect(()=>{if(!localEnabled){setOnline(false);setStatus(null);return;}let mounted=true;async function check(){try{const next=await fetchRecorder('/api/status');if(!mounted)return;setOnline(true);setStatus(next);if(auto&&next.savedLaps!==countRef.current&&!lock.current)await synchronize(true);}catch{if(mounted){setOnline(false);setStatus(null);}}}check();const interval=setInterval(check,5000);return ()=>{mounted=false;clearInterval(interval);};},[auto,synchronize,localEnabled]);
 async function importFiles(files){
  setImporting(true);
  try {
   const entries=await readSharedFiles(files);
   if(!entries.length)return;
   const count=await onReceive(entries);
   setFeedback(`${count} vuelta(s) nuevas importadas · ${entries.length-count} ya registradas. Ahora puedes analizarlas en Historial o Comparador.`);
  } catch(e){setFeedback(`Importación: ${e.message}`)}
  finally {setImporting(false);setDragging(false)}
 }
 async function importJSON(event){const files=Array.from(event.target.files||[]);event.target.value='';await importFiles(files)}
 const receiving=online&&status?.connected&&status?.udpFormat===2025;
 const wrong=online&&status?.udpFormat!=null&&status?.udpFormat!==2025;
 return <div className="trace-stack"><header className="trace-page-title"><div><span className="trace-overline">F1 25 / IMPORTAR Y CONECTAR</span><h1>Recorder<span className="trace-dot">.</span></h1><p>Importa vueltas tuyas o compartidas desde cualquier PC. El Recorder local es opcional para capturar automáticamente cuando juegas.</p></div><RadioTower className="trace-header-decor" size={32}/></header>
  <section className="trace-card trace-share-hero"><div className="trace-panel-head"><div><span className="trace-overline">SHARE YOUR LAP / SIN CUENTAS</span><h3>Importar telemetría JSON</h3><p>Para utilizar ApexTrace online no necesitas el Recorder: selecciona una vuelta o un paquete compartido.</p></div><UploadCloud size={23}/></div>
   <div className={`trace-dropzone ${dragging?'is-over':''}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={e=>{e.preventDefault();setDragging(false)}} onDrop={e=>{e.preventDefault();importFiles(e.dataTransfer.files)}}>
    <UploadCloud size={28}/><strong>Arrastra aquí tus archivos de F1 25</strong><span>Una vuelta .json o un paquete con varias · guardado solo en este navegador</span>
    <label className="trace-file-btn"><FileJson2 size={16}/>{importing?'Importando...':'Seleccionar archivos JSON'}<input disabled={importing} type="file" accept=".json,application/json" multiple onChange={importJSON}/></label>
   </div><div className="trace-sharing-benefits"><span><ShieldCheck size={15}/> Sin subir archivos a servidores</span><span><Link2 size={15}/> Compatible con JSON de tus amigos</span><span><Laptop size={15}/> Se guarda en este navegador</span></div>
  </section>
  <section className="trace-recorder-hero"><div className={`trace-radio-icon ${receiving?'live':''}`}><RadioTower size={31}/></div><div><span className="trace-overline">RECORDER CONNECTION</span><h2>{!localEnabled?'Captura local opcional':!online?'Recorder no disponible':wrong?'Formato UDP incompatible':receiving?'Telemetría en directo':'Recorder listo · esperando señal'}</h2><p>{!localEnabled?'Puedes analizar archivos sin conectarte. Para sincronizar desde tu PC, activa la conexión local a continuación.':!online?'Abre Iniciar_Recorder.bat. Si estás en Vercel, autoriza antes tu dominio en el Recorder y permite la conexión local en el navegador.':wrong?'Selecciona el formato UDP 2025 en F1 25.':receiving?'F1 25 está enviando paquetes UDP correctamente.':'La aplicación local responde. Cuando salgas a pista empezará a recibir paquetes.'}</p></div><span className={`trace-live-pill ${receiving?'online':''}`}><i/>{receiving?'LIVE':online?'IDLE':localEnabled?'OFFLINE':'OPCIONAL'}</span></section>
  <div className="trace-metric-grid"><div className="trace-metric"><span>PAQUETES UDP</span><strong>{(status?.packets??0).toLocaleString('es-CL')}</strong><small>{status?.udpFormat?`Formato ${status.udpFormat}`:'Esperando datos'}</small><Wifi className="trace-metric-icon" size={20}/></div><div className="trace-metric"><span>VUELTAS GUARDADAS</span><strong>{status?.savedLaps??'—'}</strong><small>Archivos JSON locales</small><FolderOpen className="trace-metric-icon" size={20}/></div><div className="trace-metric"><span>TIEMPO ACTUAL</span><strong>{status?.currentLapMs?timeLabel(status.currentLapMs/1000):'—'}</strong><small>Vuelta #{status?.currentLap??'—'}</small><Gauge className="trace-metric-icon" size={20}/></div><div className="trace-metric"><span>CIRCUITO / EQUIPO</span><strong className="trace-meta-stat">{status?.track||'—'}</strong><small>{status?.car||'Sin identificación'}</small><Activity className="trace-metric-icon" size={20}/></div></div>
  {wrong&&<div className="trace-alert"><CircleAlert size={18}/>UDP {status.udpFormat} no es compatible con este prototipo. Selecciona formato 2025.</div>}
  {!!status?.errors?.length&&<div className="trace-alert"><CircleAlert size={18}/>{status.errors[status.errors.length-1]}</div>}
  <section className="trace-card trace-sync-import"><div className="trace-panel-head"><div><span className="trace-overline">LOCAL DATA SYNC</span><h3>Trae tus vueltas a ApexTrace</h3><p>El Recorder guarda la telemetría en recorder/laps y la web la almacena en IndexedDB.</p></div><RefreshCcw size={20}/></div>{hosted&&!localEnabled&&<div className="trace-local-optin"><p>Estás en una web pública. Por privacidad no intentaremos contactar con programas de tu PC sin que lo solicites. La importación manual ya funciona.</p><button className="trace-btn-ghost" onClick={()=>setLocalEnabled(true)}><RadioTower size={17}/> Intentar conectar con mi Recorder local</button></div>}
  <div className="trace-import-actions"><button className="trace-btn-red" onClick={()=>synchronize()} disabled={!localEnabled||!online||syncing}><RefreshCcw size={17} className={syncing?'trace-rotate':''}/>{syncing?'Sincronizando...':'Sincronizar Recorder'}</button><button className="trace-btn-ghost" onClick={onHistory}>Ver historial <ArrowRight size={16}/></button></div><label className="trace-auto-sync"><input type="checkbox" disabled={!localEnabled} checked={auto} onChange={e=>setAuto(e.target.checked)}/><span>Sincronizar automáticamente cada 5 segundos mientras esta sección esté abierta</span></label>{feedback&&<div className="trace-info-message" role="status"><CheckCircle2 size={17}/>{feedback}</div>}</section>
  <section className="trace-recorder-steps"><div><b>01</b><RadioTower size={23}/><h4>Inicia el Recorder</h4><p>Ejecuta <code>recorder/Iniciar_Recorder.bat</code> y déjalo abierto mientras juegas.</p></div><div><b>02</b><Wifi size={23}/><h4>Activa UDP en F1 25</h4><p>UDP activado, retransmisión desactivada, IP <code>127.0.0.1</code>, puerto <code>20777</code>, formato <code>2025</code>, 60 Hz recomendado.</p></div><div><b>03</b><ShieldCheck size={23}/><h4>Completa tus vueltas</h4><p>Se guardará tu tiempo y, con el Recorder v0.4, también el trazado X/Z para el mapa del circuito.</p></div></section>
  <div className="trace-history-note"><CloudOff size={17}/> Los archivos importados se procesan localmente y no se envían a Vercel. Para sincronizar desde una web pública hace falta autorizar expresamente el origen HTTPS en el Recorder y dar permiso en el navegador. La comunicación de captura sigue siendo local con <code>{RECORDER_BASE}</code>. El Recorder es independiente del navegador y no envía telemetría a servidores externos. </div>
 </div>
}
