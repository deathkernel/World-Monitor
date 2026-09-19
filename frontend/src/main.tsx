import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import './styles.css';

type Event = { id: string; type: string; lat: number; lon: number; mag: number; location: string; timestamp: string | null; source: string; depth?: number | null; tsunami?: boolean };
type Countries = { type: 'FeatureCollection'; features: { type: 'Feature'; properties?: { name?: string }; geometry: { type: string; coordinates: any } }[] };

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const GEO = 'https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/main/countries.geojson';
const channels = [
  ['weather', '🌦️', 'WEATHER'], ['flights', '✈️', 'FLIGHTS'], ['ships', '🚢', 'SHIPS'],
  ['earthquakes', '🌋', 'EARTHQUAKES'], ['iss', '🌍', 'ISS'], ['currency', '💱', 'CURRENCY'],
  ['news', '📰', 'NEWS'], ['space', '🛰️', 'SPACE'], ['network', '🌐', 'IP / DNS']
];

function ll(lat: number, lon: number, r = 2.04): [number, number, number] {
  const p = (90 - lat) * Math.PI / 180;
  const t = (lon + 180) * Math.PI / 180;
  return [-r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t)];
}

function Borders({ data }: { data: Countries | null }) {
  const geometry = useMemo(() => {
    if (!data) return null;
    const points: number[] = [];
    const add = (ring: number[][]) => {
      for (let i = 0; i < ring.length - 1; i++) points.push(...ll(ring[i][1], ring[i][0], 2.012), ...ll(ring[i + 1][1], ring[i + 1][0], 2.012));
    };
    for (const feature of data.features) {
      const shape = feature.geometry;
      if (shape.type === 'Polygon') shape.coordinates.forEach(add);
      if (shape.type === 'MultiPolygon') shape.coordinates.forEach((poly: any) => poly.forEach(add));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
    return g;
  }, [data]);
  if (!geometry) return null;
  return <lineSegments geometry={geometry}><lineBasicMaterial color="#4fb9d7" transparent opacity={0.52} depthWrite={false} /></lineSegments>;
}

function Signal({ e, selected, onSelect }: { e: Event; selected: boolean; onSelect: () => void }) {
  const ring = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const [x, y, z] = ll(e.lat, e.lon);
  useFrame(({ clock }) => {
    const pulse = (Math.sin(clock.elapsedTime * 3 + e.mag) + 1) / 2;
    if (ring.current) {
      ring.current.scale.setScalar(1 + pulse * 2);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - pulse) * 0.35;
    }
    if (core.current) core.current.scale.setScalar(selected ? 1.4 : 0.9 + pulse * 0.4);
  });
  return <group position={[x, y, z]} onClick={(event) => { event.stopPropagation(); onSelect(); }}><mesh ref={ring}><ringGeometry args={[0.045, 0.052, 24]} /><meshBasicMaterial color={e.mag >= 6 ? '#ff496c' : '#55d6ff'} transparent /></mesh><mesh ref={core}><sphereGeometry args={[0.05, 12, 12]} /><meshBasicMaterial color={selected ? '#fff' : e.mag >= 6 ? '#ff496c' : '#55d6ff'} /></mesh></group>;
}

function Globe({ events, countries, selected, onSelect, scanning }: { events: Event[]; countries: Countries | null; selected: string | null; onSelect: (e: Event) => void; scanning: boolean }) {
  const group = useRef<THREE.Group>(null);
  const drag = useRef({ x: 0, y: 0, rx: 0.12, ry: 0.2, active: false });
  const direction = useRef(1);
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    el.style.cursor = 'grab';
    const down = (event: PointerEvent) => {
      drag.current = { x: event.clientX, y: event.clientY, rx: group.current?.rotation.x ?? 0.12, ry: group.current?.rotation.y ?? 0.2, active: true };
      el.setPointerCapture(event.pointerId); el.style.cursor = 'grabbing';
    };
    const move = (event: PointerEvent) => {
      if (!drag.current.active || !group.current) return;
      const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
      if (Math.abs(dx) > 2) direction.current = dx > 0 ? 1 : -1;
      group.current.rotation.y = drag.current.ry + dx * 0.006;
      group.current.rotation.x = Math.max(-1.15, Math.min(1.15, drag.current.rx + dy * 0.004));
    };
    const up = (event: PointerEvent) => { drag.current.active = false; try { el.releasePointerCapture(event.pointerId); } catch {} el.style.cursor = 'grab'; };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
  }, [gl]);
  useFrame((_, dt) => { if (group.current && !drag.current.active && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) group.current.rotation.y += dt * 0.018 * direction.current; });
  return <group ref={group}><mesh><sphereGeometry args={[2, 48, 48]} /><meshBasicMaterial color="#09131d" wireframe opacity={0.82} transparent /></mesh><mesh><sphereGeometry args={[1.94, 64, 64]} /><meshBasicMaterial color="#0a6f96" wireframe opacity={0.16} transparent /></mesh><Borders data={countries} />{events.map((event) => <Signal key={event.id} e={event} selected={event.id === selected} onSelect={() => onSelect(event)} />)}{scanning && <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[2.025, 0.006, 8, 96]} /><meshBasicMaterial color="#65dcff" transparent opacity={0.18} /></mesh>}</group>;
}

function App() {
  const [q, setQ] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [countries, setCountries] = useState<Countries | null>(null);
  const [channel, setChannel] = useState('earthquakes');
  const [selected, setSelected] = useState<Event | null>(null);
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState('CONNECTING • LIVE CORE');
  const [msg, setMsg] = useState('Initializing world intelligence channels...');
  const [scan] = useState(true);

  const load = useCallback(async (c: string, target = '') => {
    setChannel(c); setSelected(null); setData(null); setStatus(`FETCHING • ${c.toUpperCase()}${target ? ` / ${target.toUpperCase()}` : ''}`);
    try {
      let url = `${API}/api/${c}`;
      if (c === 'weather') url += `?city=${encodeURIComponent(target || 'Mumbai')}`;
      if (c === 'news') url += `?query=${encodeURIComponent(target || 'world')}`;
      if (c === 'currency') url += '?base=USD&symbols=EUR,INR,GBP,JPY';
      if (c === 'network') url += `?host=${encodeURIComponent(target || 'google.com')}`;
      const response = await fetch(url); if (!response.ok) throw new Error('Request failed');
      const result = await response.json(); setData(result); setStatus('SYNCHRONIZED • LIVE');
      setMsg(result.status === 'unavailable' ? result.message : `${c.toUpperCase()} intelligence synchronized${target ? ` for ${target}.` : '.'}`);
      if (c === 'earthquakes') setEvents((result.events || []).map((event: any) => ({ ...event, lat: event.latitude, lon: event.longitude, mag: event.severity })));
    } catch { setStatus('DEGRADED • RETRYING'); setMsg(`${c.toUpperCase()} data source is unavailable right now.`); }
  }, []);

  const loadLocation = useCallback(async (name: string) => {
    setChannel('location'); setSelected(null); setData(null); setStatus(`FETCHING • LOCATION / ${name.toUpperCase()}`);
    try {
      const response = await fetch(`${API}/api/location?name=${encodeURIComponent(name)}`); if (!response.ok) throw new Error('Location not found');
      const result = await response.json(); setData(result); setStatus('SYNCHRONIZED • LIVE');
      setMsg(`Live intelligence synchronized for ${result.location.name}, ${result.location.country}.`);
      setEvents((result.earthquakes || []).map((event: any) => ({ ...event, lat: event.latitude, lon: event.longitude, mag: event.severity })));
    } catch { setStatus('LOCATION NOT FOUND'); setMsg(`No live location match found for "${name}".`); }
  }, []);

  useEffect(() => { fetch(GEO).then((response) => response.json()).then(setCountries).catch(() => {}); load('earthquakes'); }, [load]);

  const run = async (text: string) => {
    if (!text.trim()) return;
    setQ(text); setStatus('PROCESSING • COMMAND');
    try {
      const response = await fetch(`${API}/api/command?q=${encodeURIComponent(text)}`); const result = await response.json();
      if (result.intent === 'weather') await load('weather', result.city);
      else if (result.intent === 'location') await loadLocation(result.location);
      else if (result.intent === 'news' && result.place) await loadLocation(result.place);
      else if (result.intent === 'earthquakes' && result.place) await loadLocation(result.place);
      else if (result.intent === 'earthquakes') await load('earthquakes');
      else if (['flights', 'ships', 'iss', 'currency', 'news', 'space', 'network'].includes(result.intent)) await load(result.intent, result.place || '');
      else setMsg(result.message);
      setStatus('ANALYSIS READY');
    } catch { setStatus('CORE ERROR'); setMsg('Command could not reach the live core.'); }
  };

  const pointCount = channel === 'earthquakes' || channel === 'location' ? events.length : data?.count ?? data?.aircraft?.length ?? '--';
  const locationWeather = data?.weather || {};
  const locationDaily = data?.daily || {};
  const locationInfo = data?.location || {};
  const weatherCode = locationWeather.weather_code != null ? `WMO ${locationWeather.weather_code}` : '—';
  const formatPopulation = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat('en-IN').format(value);
  const formatDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '—';

  return <main className="app">
    <div className="scanline" />
    <header className="top"><div className="brand">WORLD <span>// LIVE</span></div><div className="top-center"><i /> J.A.R.V.I.S. CORE <b>CONNECTED</b></div><div className="time">GLOBAL NODE • 01</div></header>
    <nav className="channels">{channels.map(([id, icon, label]) => <button className={channel === id ? 'active' : ''} onClick={() => load(id)} key={id}><span>{icon}</span>{label}</button>)}</nav>
    <section className="scene">
      <div className="reticle" />
      <div className="hud hud-left"><small>{channel.toUpperCase()} INTELLIGENCE</small><strong>{pointCount}</strong><span>LIVE DATA POINTS</span></div>
      <div className="globe-wrap"><Canvas camera={{ position: [0, 0, 6.4], fov: 40 }} dpr={[1, 1.6]}><Globe events={events} countries={countries} selected={selected?.id || null} onSelect={setSelected} scanning={scan} /></Canvas></div>
      {selected && channel === 'earthquakes' ? <aside className="event-panel"><button className="close-panel" onClick={() => setSelected(null)}>×</button><small>SELECTED SIGNAL</small><h2>{selected.location}</h2><div className="big">M{selected.mag.toFixed(1)}</div><div className="grid"><span>LAT<b>{selected.lat.toFixed(2)}°</b></span><span>LON<b>{selected.lon.toFixed(2)}°</b></span><span>DEPTH<b>{selected.depth != null ? `${selected.depth.toFixed(1)} km` : '—'}</b></span><span>TSUNAMI<b>{selected.tsunami ? 'YES' : 'NO'}</b></span></div><p>{selected.timestamp ? new Date(selected.timestamp).toLocaleString() : 'Timestamp unavailable'} · {selected.source}</p></aside> : null}
      <aside className="data-panel">
        {channel === 'location' && data?.location ? <div>
          <small>📍 LOCATION INTELLIGENCE / {locationInfo.name}</small>
          <h2>{locationInfo.name}, {locationInfo.country}</h2>
          <p>{locationInfo.admin1 || 'Regional data'} · {locationInfo.timezone} · {locationInfo.country_code || '—'}</p>
          <div className="hero">{Math.round(locationWeather.temperature_2m ?? 0)}°</div>
          <div className="grid">
            <span>FEELS LIKE<b>{locationWeather.apparent_temperature ?? '—'}°</b></span>
            <span>HUMIDITY<b>{locationWeather.relative_humidity_2m ?? '—'}%</b></span>
            <span>WIND<b>{locationWeather.wind_speed_10m ?? '—'} km/h</b></span>
            <span>WIND DIR<b>{locationWeather.wind_direction_10m ?? '—'}°</b></span>
            <span>PRESSURE<b>{locationWeather.pressure_msl ?? '—'} hPa</b></span>
            <span>CLOUDS<b>{locationWeather.cloud_cover ?? '—'}%</b></span>
            <span>PRECIP<b>{locationWeather.precipitation ?? '—'} mm</b></span>
            <span>UV INDEX<b>{locationWeather.uv_index ?? '—'}</b></span>
            <span>DAY/NIGHT<b>{locationWeather.is_day === 1 ? 'DAY' : 'NIGHT'}</b></span>
            <span>WEATHER<b>{weatherCode}</b></span>
            <span>LAT<b>{Number(locationInfo.latitude).toFixed(3)}°</b></span>
            <span>LON<b>{Number(locationInfo.longitude).toFixed(3)}°</b></span>
            <span>ELEVATION<b>{locationInfo.elevation_m != null ? `${Number(locationInfo.elevation_m).toFixed(0)} m` : '—'}</b></span>
            <span>POPULATION<b>{formatPopulation(locationInfo.population)}</b></span>
          </div>
          <div className="grid">
            <span>TODAY HIGH<b>{locationDaily.temperature_2m_max?.[0] ?? '—'}°</b></span>
            <span>TODAY LOW<b>{locationDaily.temperature_2m_min?.[0] ?? '—'}°</b></span>
            <span>SUNRISE<b>{locationDaily.sunrise?.[0] ? new Date(locationDaily.sunrise[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</b></span>
            <span>SUNSET<b>{locationDaily.sunset?.[0] ? new Date(locationDaily.sunset[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</b></span>
          </div>
          <small>SEISMIC ACTIVITY / 500 KM / 7 DAYS</small>
          <div className="news-list">{(data.earthquakes || []).slice(0, 8).map((quake: any, index: number) => <div key={quake.id || index}><b>M{Number(quake.severity).toFixed(1)} · {quake.location}</b><span>{quake.depth != null ? `${Number(quake.depth).toFixed(1)} km depth` : 'Depth —'} · {formatDate(quake.timestamp)}</span></div>)}</div>
          <small>LOCAL HEADLINES</small>
          <div className="news-list">{(data.news || []).slice(0, 8).map((article: any, index: number) => <div key={index}><b>{article.title}</b><span>{article.domain} · {article.date || 'LIVE'}</span>{article.url ? <a href={article.url} target="_blank" rel="noreferrer">OPEN SOURCE ↗</a> : null}</div>)}</div>
          <p>Source status · Weather: {data.status?.weather || '—'} · Seismic: {data.status?.earthquakes || '—'} · News: {data.status?.news || '—'}</p>
        </div> : null}
        {channel === 'weather' && data?.location ? <div><small>WEATHER / {data.location.name}, {data.location.country}</small><div className="hero">{Math.round(data.current?.temperature_2m ?? 0)}°</div><div className="grid"><span>FEELS LIKE<b>{data.current?.apparent_temperature}°</b></span><span>HUMIDITY<b>{data.current?.relative_humidity_2m}%</b></span><span>WIND<b>{data.current?.wind_speed_10m} km/h</b></span><span>TIMEZONE<b>{data.location.timezone}</b></span></div></div> : null}
        {channel === 'flights' ? <div><small>✈ LIVE AIRCRAFT</small><div className="hero">{data?.count ?? '--'}</div><div className="grid"><span>TRACKED<b>OPENSKY</b></span><span>VISIBLE<b>{data?.aircraft?.length ?? 0}</b></span></div></div> : null}
        {channel === 'ships' ? <div><small>🚢 VESSEL NETWORK</small><div className="hero">{data?.status === 'unavailable' ? 'OFFLINE' : data?.count ?? 0}</div><p>{data?.message}</p></div> : null}
        {channel === 'iss' && data ? <div><small>🌍 INTERNATIONAL SPACE STATION</small><div className="hero">{Number(data.latitude).toFixed(2)}°</div><div className="grid"><span>LONGITUDE<b>{Number(data.longitude).toFixed(2)}°</b></span><span>ALTITUDE<b>{Number(data.altitude_km).toFixed(1)} km</b></span><span>VELOCITY<b>{Number(data.velocity_kmh).toFixed(0)} km/h</b></span><span>VISIBILITY<b>{data.visibility}</b></span></div></div> : null}
        {channel === 'currency' && data?.rates ? <div><small>💱 FX MATRIX / USD</small><div className="rate-list">{Object.entries(data.rates).map(([key, value]) => <div key={key}><b>{key}</b><span>{String(value)}</span></div>)}</div></div> : null}
        {channel === 'news' && data?.articles ? <div><small>📰 GLOBAL HEADLINES</small><div className="news-list">{data.articles.slice(0, 7).map((article: any, index: number) => <div key={index}><b>{article.title}</b><span>{article.domain} · {article.date || 'LIVE'}</span>{article.url ? <a href={article.url} target="_blank" rel="noreferrer">OPEN SOURCE ↗</a> : null}</div>)}</div></div> : null}
        {channel === 'space' && data ? <div><small>🛰️ SPACE WEATHER / NASA DONKI</small><div className="hero">{Array.isArray(data.events) ? data.events.length : '--'}</div><p>Recent solar events available from NASA DONKI.</p></div> : null}
        {channel === 'network' && data ? <div><small>🌐 NETWORK INTELLIGENCE</small><div className="hero">{data.ip || '--'}</div><div className="grid"><span>ORG<b>{data.org || '—'}</b></span><span>ASN<b>{data.asn || '—'}</b></span><span>COUNTRY<b>{data.country || '—'}</b></span><span>ZONE<b>{data.timezone || '—'}</b></span></div></div> : null}
        {channel === 'earthquakes' && !selected ? <div><small>🌋 SEISMIC NETWORK</small><div className="hero">{events.length}</div><div className="grid"><span>WINDOW<b>24 HOURS</b></span><span>SOURCE<b>USGS</b></span></div></div> : null}
      </aside>
    </section>
    <section className="assistant"><div className="assistant-line"><span>◉</span><div><small>{status}</small><p>{msg}</p></div></div><form onSubmit={(event) => { event.preventDefault(); run(q); }}><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Ask J.A.R.V.I.S. about the world..." /><button>EXECUTE</button></form></section>
    <footer><span>J.A.R.V.I.S. / WORLD INTELLIGENCE</span><span>WEATHER • FLIGHTS • SHIPS • SEISMIC • ISS • FX • NEWS • SPACE • NETWORK</span><span>DRAG TO ROTATE • LIVE</span></footer>
  </main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
