import React, {useCallback, useEffect, useMemo, useState} from 'react';
import ReactDOM from 'react-dom/client';
import {Canvas} from '@react-three/fiber';
import './styles.css';

type WorldEvent = {
  id: string;
  type: string;
  lat: number;
  lon: number;
  mag: number;
  location: string;
  timestamp: string | null;
  source: string;
};

type Weather = {
  location: {name: string; country?: string; timezone?: string};
  current: {temperature_2m?: number; apparent_temperature?: number; wind_speed_10m?: number; weather_code?: number};
};

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function Globe({events}:{events:WorldEvent[]}) {
  const points = useMemo(() => events.map(e => {
    const phi = (90-e.lat)*Math.PI/180;
    const theta = (e.lon+180)*Math.PI/180;
    const r=2.04;
    return [-(r*Math.sin(phi)*Math.cos(theta)), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(theta)] as [number,number,number];
  }),[events]);
  return <group rotation={[0.12,0.2,0]}>
    <mesh><sphereGeometry args={[2,48,48]}/><meshBasicMaterial color="#09131d" wireframe opacity={0.82} transparent/></mesh>
    <mesh><sphereGeometry args={[1.94,64,64]}/><meshBasicMaterial color="#0a6f96" wireframe opacity={0.16} transparent/></mesh>
    {points.map((p,i)=><mesh key={events[i].id} position={p}><sphereGeometry args={[0.045+events[i].mag/150,12,12]}/><meshBasicMaterial color={events[i].mag>=6?'#ff496c':'#55d6ff'}/></mesh>)}
  </group>
}

function App(){
  const [query,setQuery]=useState('');
  const [events,setEvents]=useState<WorldEvent[]>([]);
  const [status,setStatus]=useState('CONNECTING • LIVE CORE');
  const [message,setMessage]=useState('Initializing world intelligence channels...');
  const [weather,setWeather]=useState<Weather|null>(null);

  const loadEarthquakes = useCallback(async () => {
    const response = await fetch(`${API}/api/earthquakes?hours=24&min_magnitude=2.5`);
    if (!response.ok) throw new Error('USGS unavailable');
    const data = await response.json();
    setEvents(data.events.map((e: any) => ({...e, lat:e.latitude, lon:e.longitude, mag:e.severity})));
  }, []);

  const loadWeather = useCallback(async (city:string) => {
    const response = await fetch(`${API}/api/weather?city=${encodeURIComponent(city)}`);
    if (!response.ok) throw new Error('Weather unavailable');
    setWeather(await response.json());
  }, []);

  useEffect(() => {
    let alive = true;
    const sync = async () => {
      try {
        setStatus('FETCHING • GLOBAL SIGNALS');
        await loadEarthquakes();
        if (alive) {
          setStatus('SYNCHRONIZED • LIVE');
          setMessage('World intelligence channels are receiving live seismic data.');
        }
      } catch {
        if (alive) {
          setStatus('DEGRADED • RETRYING');
          setMessage('Live core unavailable. Check that the FastAPI backend is running.');
        }
      }
    };
    sync();
    const timer = window.setInterval(sync, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [loadEarthquakes]);

  const run=async(q:string)=>{
    if(!q.trim()) return;
    setStatus('PROCESSING • COMMAND');
    try {
      const response = await fetch(`${API}/api/command?q=${encodeURIComponent(q)}`);
      const data = await response.json();
      if (data.intent === 'earthquakes') {
        await loadEarthquakes();
        setMessage('Seismic channel refreshed. Live events are now mapped on the globe.');
      } else if (data.intent === 'weather') {
        await loadWeather(data.city);
        setMessage(`Current weather synchronized for ${data.city}.`);
      } else {
        setMessage(data.message);
      }
      setStatus('ANALYSIS READY');
    } catch {
      setStatus('CORE ERROR');
      setMessage('Command could not reach the live core.');
    }
  };

  return <main className="app">
    <div className="scanline"/>
    <header className="top">
      <div className="brand">WORLD <span>// LIVE</span></div>
      <div className="top-center"><i/> J.A.R.V.I.S. CORE <b>CONNECTED</b></div>
      <div className="time">GLOBAL NODE • 01</div>
    </header>

    <section className="scene">
      <div className="reticle"/>
      <div className="hud hud-left">
        <small>GLOBAL ACTIVITY</small><strong>{events.length.toString().padStart(2,'0')}</strong><span>EARTHQUAKES / 24H</span>
      </div>
      <div className="hud hud-right">
        <small>EVENT STREAM</small><strong>{events.filter(e=>e.mag>=4).length.toString().padStart(2,'0')}</strong><span>MAG ≥ 4.0 SIGNALS</span>
      </div>
      <div className="globe-wrap"><Canvas camera={{position:[0,0,6.4],fov:40}}><ambientLight intensity={1}/><Globe events={events}/></Canvas></div>
      <div className="orbit-label one">WEATHER <b>{weather ? `${Math.round(weather.current.temperature_2m ?? 0)}°` : 'SYNC'}</b></div>
      <div className="orbit-label two">SEISMIC <b>LIVE</b></div>
      <div className="orbit-label three">AVIATION <b>STANDBY</b></div>
    </section>

    <section className="assistant">
      <div className="assistant-line"><span>◉</span><div><small>{status}</small><p>{message}</p></div></div>
      <form onSubmit={e=>{e.preventDefault();run(query)}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ask me about the world..." /><button>EXECUTE</button></form>
      <div className="chips"><button onClick={()=>run('What is happening in Japan?')}>ANALYZE JAPAN</button><button onClick={()=>run('Earthquakes right now')}>SEISMIC ACTIVITY</button><button onClick={()=>run('Weather in Mumbai')}>MUMBAI WEATHER</button></div>
    </section>

    <footer><span>J.A.R.V.I.S. / WORLD INTELLIGENCE</span><span>USGS • OPEN-METEO • FASTAPI CORE</span><span>LIVE REFRESH • 60S ●</span></footer>
  </main>
}
ReactDOM.createRoot(document.getElementById('root')!).render(<App/>);
