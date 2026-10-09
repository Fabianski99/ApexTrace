/** F1 25 season catalog; geometry is licensed separately (Tomislav Bacinger, MIT). */
export const CIRCUITS = [
  ['Melbourne','Australia','Albert Park','Melbourne'],
  ['Shanghai','China','Shanghai International Circuit','Shanghai'],
  ['Suzuka','Japón','Suzuka International Racing Course','Suzuka'],
  ['Bahrain','Baréin','Bahrain International Circuit','Sakhir'],
  ['Jeddah','Arabia Saudita','Jeddah Corniche Circuit','Jeddah'],
  ['Miami','Miami','Miami International Autodrome','Miami'],
  ['Imola','Emilia-Romaña','Autodromo Enzo e Dino Ferrari','Imola'],
  ['Monaco','Mónaco','Circuit de Monaco','Monte Carlo'],
  ['Catalunya','España','Circuit de Barcelona-Catalunya','Barcelona'],
  ['Montreal','Canadá','Circuit Gilles-Villeneuve','Montreal'],
  ['Spielberg','Austria','Red Bull Ring','Spielberg'],
  ['Silverstone','Gran Bretaña','Silverstone Circuit','Silverstone'],
  ['Spa','Bélgica','Circuit de Spa-Francorchamps','Spa'],
  ['Hungaroring','Hungría','Hungaroring','Budapest'],
  ['Zandvoort','Países Bajos','Circuit Zandvoort','Zandvoort'],
  ['Monza','Italia','Autodromo Nazionale Monza','Monza'],
  ['Baku','Azerbaiyán','Baku City Circuit','Baku'],
  ['Singapore','Singapur','Marina Bay Street Circuit','Singapore'],
  ['Austin','Estados Unidos','Circuit of the Americas','Austin'],
  ['Mexico','Ciudad de México','Autódromo Hermanos Rodríguez','Mexico City'],
  ['Interlagos','São Paulo','Autódromo José Carlos Pace','Sao Paulo'],
  ['Las Vegas','Las Vegas','Las Vegas Street Circuit','Las Vegas'],
  ['Losail','Catar','Lusail International Circuit','Lusail'],
  ['Abu Dhabi','Abu Dabi','Yas Marina Circuit','Yas Marina'],
].map(([id,grandPrix,name,location])=>({id,grandPrix,name,location}));

const normalize = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const ALIASES = {
  'spa':'spa', 'spafrancorchamps':'spa', 'sakhir':'bahrain','barcelona':'catalunya',
  'saopaulo':'interlagos','sao paulo':'interlagos','brazil':'interlagos',
  'mexicocity':'mexico','ciudaddemexico':'mexico','yasmarina':'abudhabi',
  'lusail':'losail','qatar':'losail','budapest':'hungaroring','montecarlo':'monaco',
  'redbullring':'spielberg','circuitoftheamericas':'austin', 'cota':'austin',
  'albertpark':'melbourne','marinabay':'singapore','jeddahcorniche':'jeddah',
};
export function circuitId(v) { const clean=normalize(v); return ALIASES[clean]||clean; }
export const getCircuit = v => CIRCUITS.find(c=>circuitId(c.id)===circuitId(v)) || null;

// Local asset first (optional installer), then a once-only public MIT GeoJSON download.
const REMOTE = [
  'https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson',
  'https://cdn.jsdelivr.net/gh/bacinger/f1-circuits@master/f1-circuits.geojson',
];
const CACHE_KEY='apextrace:track-geometry:bacinger-v1';
let atlasPromise;
function validAtlas(data) { return data?.type==='FeatureCollection' && Array.isArray(data.features) && data.features.length>=24; }
function extractAtlas(data) {
  const features=data.features;
  return Object.fromEntries(CIRCUITS.map(c=>{
    const match=features.find(f=>{
      const place=circuitId(f.properties?.Location);
      const id=circuitId(f.properties?.Name);
      return place===circuitId(c.location)||place===circuitId(c.id)||id===circuitId(c.name);
    });
    const coords=match?.geometry?.coordinates;
    // Keep geometry points as coordinates; no official turn numbering is inferred.
    return [c.id,Array.isArray(coords)&&coords.length>=15&&Array.isArray(coords[0])?coords.map(([x,y])=>[Number(x),Number(y)]):null];
  }));
}
function cached() { try { const raw=localStorage.getItem(CACHE_KEY);const parsed=raw?JSON.parse(raw):null;return parsed&&Object.keys(parsed).length===CIRCUITS.length?parsed:null; } catch {return null;} }
async function fetchGeometry(url, timeoutMs=7000){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try { const r=await fetch(url,{signal:controller.signal,cache:'force-cache'});if(!r.ok)throw Error(`HTTP ${r.status}`);const data=await r.json();if(!validAtlas(data))throw Error('GeoJSON incompleto');return extractAtlas(data); }
  finally {clearTimeout(timer);}
}
async function loadAtlas() {
  const fromCache=cached();
  // Cache ensures old sessions remain accessible without Internet.
  if(fromCache)return fromCache;
  const sources=['/data/f1-circuits.geojson',...REMOTE];
  for (const url of sources){
    try {const result=await fetchGeometry(url);if(Object.values(result).filter(Boolean).length<20)throw Error('No coinciden los circuitos');
      try {localStorage.setItem(CACHE_KEY,JSON.stringify(result));} catch { /* storage disabled */ }
      return result;
    } catch { /* try next source */ }
  }
  throw Error('No se pudo cargar el atlas. Conéctate una vez a Internet o ejecuta el instalador de trazados locales.');
}
export function loadCircuitAtlas(force=false) { if(force)atlasPromise=null;return (atlasPromise??=loadAtlas().catch(e=>{atlasPromise=null;throw e;})); }
