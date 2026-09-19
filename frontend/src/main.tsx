import React from 'react';
import ReactDOM from 'react-dom/client';
import {Canvas} from '@react-three/fiber';
import {useMemo, useState} from 'react';
import './styles.css';

function Globe({events}:{events:{lat:number;lon:number;mag:number}[]}) {
  const points = useMemo(() => events.map(e => {
    const phi = (90-e.lat)*Math.PI/180;
    const theta = (e.lon+180)*Math.PI/180;
    const r=2.04;
    return [-(r*Math.sin(phi)*Math.cos(theta)), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(theta)] as [number,number,number];
  }),[events]);
  return <group rotation={[0.12,0.2,0]}>
    <mesh><sphereGeometry args={[2,48,48]}/><meshBasicMaterial color="#09131d" wireframe opacity={0.82} transparent/></mesh>
    <mesh><sphereGeometry args={[1.94,64,64]}/><meshBasicMaterial color="#0a6f96" wireframe opacity={0.16} transparent/></mesh>
    {points.map((p,i)=><mesh key={i} position={p}><sphereGeometry args={[0.045+events[i].mag/150,12,12]}/><meshBasicMaterial color={events[i].mag>=6?'#ff496c':'#55d6ff'}/></mesh>)}
  </group>
}

const seedEvents=[{lat:35.68,lon:139.65,mag:5.4},{lat:-6.2,lon:106.8,mag:4.8},{lat:-33.45,lon:-70.66,mag:3.9}];

function App(){
  const [query,setQuery]=useState('');
  const [events]=useState(seedEvents);
  const [status,setStatus]=useState('SYSTEM ONLINE');
  const run=(q:string)=>{if(!q.trim())return;setStatus('ANALYZING • '+q.toUpperCase());setTimeout(()=>setStatus('ANALYSIS READY'),900)};
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
        <small>GLOBAL ACTIVITY</small><strong>72%</strong><span>LIVE DATA SYNCHRONIZED</span>
      </div>
      <div className="hud hud-right">
        <small>EVENT STREAM</small><strong>{events.length.toString().padStart(2,'0')}</strong><span>NOTABLE SIGNALS</span>
      </div>
      <div className="globe-wrap"><Canvas camera={{position:[0,0,6.4],fov:40}}><ambientLight intensity={1}/><Globe events={events}/></Canvas></div>
      <div className="orbit-label one">WEATHER <b>SYNC</b></div>
      <div className="orbit-label two">SEISMIC <b>LIVE</b></div>
      <div className="orbit-label three">AVIATION <b>STANDBY</b></div>
    </section>

    <section className="assistant">
      <div className="assistant-line"><span>◉</span><div><small>{status}</small><p>Good morning. World intelligence channels are ready.</p></div></div>
      <form onSubmit={e=>{e.preventDefault();run(query)}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ask me about the world..." /><button>EXECUTE</button></form>
      <div className="chips"><button onClick={()=>run('What is happening in Japan?')}>ANALYZE JAPAN</button><button onClick={()=>run('Earthquakes right now')}>SEISMIC ACTIVITY</button><button onClick={()=>run('Weather in Mumbai')}>MUMBAI WEATHER</button></div>
    </section>

    <footer><span>J.A.R.V.I.S. / WORLD INTELLIGENCE</span><span>USGS • OPEN-METEO • LOCAL CORE</span><span>ALL SYSTEMS NOMINAL ●</span></footer>
  </main>
}
ReactDOM.createRoot(document.getElementById('root')!).render(<App/>);
