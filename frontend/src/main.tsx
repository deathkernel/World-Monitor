import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import ReactDOM from 'react-dom/client';
import {Canvas, useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import './styles.css';

type WorldEvent = { id:string; type:string; lat:number; lon:number; mag:number; location:string; timestamp:string|null; source:string; depth?:number|null; alert?:string|null; tsunami?:boolean; url?:string|null };
type Weather = { location:{name:string; country?:string; timezone?:string}; current:{temperature_2m?:number; apparent_temperature?:number; wind_speed_10m?:number; weather_code?:number} };
type CountryGeometry = { type:string; coordinates:any };
type CountryFeature = { type:'Feature'; properties?:{name?:string}; geometry:CountryGeometry };
type CountriesGeoJSON = { type:'FeatureCollection'; features:CountryFeature[] };
const API=import.meta.env.VITE_API_URL||'http://127.0.0.1:8000';
const COUNTRIES_URL='https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/main/countries.geojson';

function latLon(lat:number,lon:number,r=2.04):[number,number,number]{const p=(90-lat)*Math.PI/180,t=(lon+180)*Math.PI/180;return [-(r*Math.sin(p)*Math.cos(t)),r*Math.cos(p),r*Math.sin(p)*Math.sin(t)];}

function CountryBorders({data}:{data:CountriesGeoJSON|null}){
 const geometry=useMemo(()=>{
  if(!data) return null;
  const positions:number[]=[];
  const addRing=(ring:number[][])=>{for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];const p1=latLon(a[1],a[0],2.012),p2=latLon(b[1],b[0],2.012);positions.push(...p1,...p2);}};
  for(const feature of data.features){const g=feature.geometry;if(!g) continue;if(g.type==='Polygon'){for(const ring of g.coordinates)addRing(ring);}else if(g.type==='MultiPolygon'){for(const polygon of g.coordinates)for(const ring of polygon)addRing(ring);}}
  const buffer=new Float32Array(positions);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(buffer,3));return geo;
 },[data]);
 if(!geometry) return null;
 return <lineSegments geometry={geometry} renderOrder={3}><lineBasicMaterial color="#4fb9d7" transparent opacity={0.48} depthWrite={false}/></lineSegments>;
}

function Signal({event,selected,onSelect}:{event:WorldEvent;selected:boolean;onSelect:()=>void}){
 const ring=useRef<THREE.Mesh>(null),core=useRef<THREE.Mesh>(null);const [x,y,z]=latLon(event.lat,event.lon);
 useFrame(({clock})=>{const pulse=(Math.sin(clock.elapsedTime*3.2+event.mag)+1)/2;if(ring.current){ring.current.scale.setScalar(1+pulse*2.2);(ring.current.material as THREE.MeshBasicMaterial).opacity=(1-pulse)*0.34;}if(core.current)core.current.scale.setScalar(selected?1.35:0.9+pulse*0.45);});
 return <group position={[x,y,z]} onClick={e=>{e.stopPropagation();onSelect()}}><mesh ref={ring}><ringGeometry args={[0.045,0.052,24]}/><meshBasicMaterial color={event.mag>=6?'#ff496c':'#55d6ff'} transparent/></mesh><mesh ref={core}><sphereGeometry args={[0.045+Math.min(event.mag,9)/180,12,12]}/><meshBasicMaterial color={selected?'#ffffff':event.mag>=6?'#ff496c':'#55d6ff'}/></mesh></group>;
}

function ScanSweep({active}:{active:boolean}){
 const ref=useRef<THREE.Mesh>(null);
 useFrame((_,delta)=>{if(active&&ref.current){ref.current.rotation.y+=delta*0.9;ref.current.rotation.z+=delta*0.12;}});
 return <mesh ref={ref} rotation={[Math.PI/2,0,0]}><torusGeometry args={[2.025,0.006,8,96]}/><meshBasicMaterial color="#65dcff" transparent opacity={active?0.18:0} depthWrite={false}/></mesh>;
}

function Globe({events,countries,selectedId,onSelect,scanning}:{events:WorldEvent[];countries:CountriesGeoJSON|null;selectedId:string|null;onSelect:(e:WorldEvent)=>void;scanning:boolean}){
 const group=useRef<THREE.Group>(null);
 useFrame((_,delta)=>{if(group.current&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)group.current.rotation.y+=delta*0.035;});
 return <group ref={group} rotation={[0.12,0.2,0]}><mesh><sphereGeometry args={[2,48,48]}/><meshBasicMaterial color="#09131d" wireframe opacity={0.82} transparent/></mesh><mesh><sphereGeometry args={[1.94,64,64]}/><meshBasicMaterial color="#0a6f96" wireframe opacity={0.16} transparent/></mesh><CountryBorders data={countries}/><ScanSweep active={scanning}/>{events.map(e=><Signal key={e.id} event={e} selected={e.id===selectedId} onSelect={()=>onSelect(e)}/>)}</group>;
}

function App(){
 const [query,setQuery]=useState(''),[events,setEvents]=useState<WorldEvent[]>([]),[selected,setSelected]=useState<WorldEvent|null>(null),[status,setStatus]=useState('CONNECTING • LIVE CORE'),[message,setMessage]=useState('Initializing world intelligence channels...'),[weather,setWeather]=useState<Weather|null>(null),[lastSync,setLastSync]=useState<Date|null>(null),[countries,setCountries]=useState<CountriesGeoJSON|null>(null),[scanning,setScanning]=useState(true);
 useEffect(()=>{let alive=true;fetch(COUNTRIES_URL).then(r=>{if(!r.ok)throw Error('Country map unavailable');return r.json();}).then(data=>{if(alive)setCountries(data);}).catch(()=>{if(alive)setMessage('Country boundary layer unavailable. Live signals remain online.');});return()=>{alive=false;};},[]);
 const loadEarthquakes=useCallback(async()=>{const r=await fetch(`${API}/api/earthquakes?hours=24&min_magnitude=2.5`);if(!r.ok)throw Error('USGS unavailable');const d=await r.json();setEvents(d.events.map((e:any)=>({...e,lat:e.latitude,lon:e.longitude,mag:e.severity})));setLastSync(new Date());},[]);
 const loadWeather=useCallback(async(city:string)=>{const r=await fetch(`${API}/api/weather?city=${encodeURIComponent(city)}`);if(!r.ok)throw Error('Weather unavailable');setWeather(await r.json());},[]);
 useEffect(()=>{let alive=true;const sync=async()=>{try{setScanning(true);setStatus('SCANNING • GLOBAL SIGNALS');await loadEarthquakes();if(alive){setScanning(false);setStatus('SYNCHRONIZED • LIVE');setMessage('Country boundaries and live seismic network synchronized. Monitoring global activity.');}}catch{if(alive){setScanning(false);setStatus('DEGRADED • RETRYING');setMessage('Live core unavailable. Check that FastAPI is running.');}}};sync();const t=window.setInterval(sync,60000);return()=>{alive=false;clearInterval(t);};},[loadEarthquakes]);
 const run=async(q:string)=>{if(!q.trim())return;setQuery(q);setStatus('PROCESSING • COMMAND');try{const r=await fetch(`${API}/api/command?q=${encodeURIComponent(q)}`);if(!r.ok)throw Error('Command unavailable');const d=await r.json();if(d.intent==='earthquakes'){await loadEarthquakes();setSelected(null);setMessage(d.region?`${d.region} seismic channel refreshed. Signals mapped on the globe.`:'Seismic channel refreshed. Live events mapped on the globe.');}else if(d.intent==='weather'){await loadWeather(d.city);setMessage(`Current weather synchronized for ${d.city}.`);}else{setMessage(d.message);}setStatus('ANALYSIS READY');}catch{setStatus('CORE ERROR');setMessage('Command could not reach the live core.');}};
 const mag6=events.filter(e=>e.mag>=6).length;
 return <main className="app"><div className="scanline"/><header className="top"><div className="brand">WORLD <span>// LIVE</span></div><div className="top-center"><i/> J.A.R.V.I.S. CORE <b>CONNECTED</b></div><div className="time">GLOBAL NODE • 01</div></header><section className="scene"><div className="reticle"/><div className="hud hud-left"><small>GLOBAL ACTIVITY</small><strong>{events.length.toString().padStart(2,'0')}</strong><span>EARTHQUAKES / 24H</span></div><div className="hud hud-right"><small>COUNTRY GRID</small><strong>{countries?.features.length??'--'}</strong><span>SOVEREIGN BOUNDARIES</span></div><div className="globe-wrap"><Canvas camera={{position:[0,0,6.4],fov:40}} dpr={[1,1.6]}><ambientLight intensity={1}/><Globe events={events} countries={countries} selectedId={selected?.id||null} onSelect={setSelected} scanning={scanning}/></Canvas></div><div className="orbit-label one">WEATHER <b>{weather?`${Math.round(weather.current.temperature_2m??0)}°`:'SYNC'}</b></div><div className="orbit-label two">SEISMIC <b>LIVE</b></div><div className="orbit-label three">COUNTRIES <b>{countries?'LOADED':'LOADING'}</b></div>{selected&&<aside className="event-panel"><button className="close-panel" onClick={()=>setSelected(null)}>×</button><small>SELECTED SIGNAL</small><h2>{selected.location}</h2><div className="event-magnitude"><span>MAGNITUDE</span><strong>{selected.mag.toFixed(1)}</strong></div><div className="event-grid"><span>LATITUDE <b>{selected.lat.toFixed(2)}°</b></span><span>LONGITUDE <b>{selected.lon.toFixed(2)}°</b></span><span>DEPTH <b>{selected.depth!=null?`${selected.depth.toFixed(1)} km`:'—'}</b></span><span>TSUNAMI <b>{selected.tsunami?'YES':'NO'}</b></span></div><p>{selected.timestamp?new Date(selected.timestamp).toLocaleString():'Timestamp unavailable'} · {selected.source}</p></aside>}</section><section className="assistant"><div className="assistant-line"><span>◉</span><div><small>{status}</small><p>{message}</p></div></div><form onSubmit={e=>{e.preventDefault();run(query)}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ask me about the world..."/><button>EXECUTE</button></form><div className="chips"><button onClick={()=>run('What is happening in Japan?')}>ANALYZE JAPAN</button><button onClick={()=>run('Earthquakes right now')}>SEISMIC ACTIVITY</button><button onClick={()=>run('Weather in Mumbai')}>MUMBAI WEATHER</button></div></section><footer><span>J.A.R.V.I.S. / WORLD INTELLIGENCE</span><span>USGS • OPEN-METEO • NATURAL EARTH • FASTAPI CORE</span><span>LIVE REFRESH • 60S ●</span></footer></main>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<App/>);
