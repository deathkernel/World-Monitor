import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import './styles.css';

type GeoEvent = { id: string; type: string; lat: number; lon: number; mag?: number; location?: string; timestamp?: string | null; source: string; depth?: number | null; heading?: number | null; altitude_m?: number | null; callsign?: string; velocity_ms?: number | null; country?: string };
type Countries = { type: 'FeatureCollection'; features: { type: 'Feature'; properties?: { name?: string }; geometry: { type: string; coordinates: any } }[] };

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const GEO = 'https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/main/countries.geojson';
const channels = [
  ['weather', '🌦️', 'WEATHER'], ['flights', '✈️', 'FLIGHTS'], ['ships', '🚢', 'SHIPS'],
  ['earthquakes', '🌋', 'EARTHQUAKES'], ['iss', '🌍', 'ISS'], ['currency', '💱', 'CURRENCY'],
  ['news', '📰', 'NEWS'], ['space', '🛰️', 'SPACE'], ['network', '🌐', 'IP / DNS']
];
const timeWindows = [['1H', 1], ['6H', 6], ['24H', 24], ['48H', 48], ['7D', 168]];

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

function Signal({ e, selected, onSelect }: { e: GeoEvent; selected: boolean; onSelect: () => void }) {
  const ring = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const [x, y, z] = ll(e.lat, e.lon);
  const aircraft = e.type === 'flight';
  const color = e.type === 'earthquake' ? (e.mag && e.mag >= 6 ? '#ff496c' : '#55d6ff') : '#65ffb4';
  useFrame(({ clock }) => {
    const pulse = (Math.sin(clock.elapsedTime * (aircraft ? 1.7 : 3) + (e.mag || 1)) + 1) / 2;
    if (ring.current) {
      ring.current.scale.setScalar(aircraft ? 1 + pulse * 0.7 : 1 + pulse * 2);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - pulse) * (aircraft ? 0.12 : 0.35);
    }
    if (core.current) core.current.scale.setScalar(selected ? 1.45 : aircraft ? 0.6 + pulse * 0.15 : 0.9 + pulse * 0.4);
  });
  if (aircraft) return <group position={[x, y, z]} rotation={[0, -Math.PI / 2, -(e.heading || 0) * Math.PI / 180]} onClick={(event) => { event.stopPropagation(); onSelect(); }}><mesh ref={core}><coneGeometry args={[0.028, 0.13, 4]} /><meshBasicMaterial color={selected ? '#fff' : color} /></mesh></group>;
  return <group position={[x, y, z]} onClick={(event) => { event.stopPropagation(); onSelect(); }}><mesh ref={ring}><ringGeometry args={[0.045, 0.052, 24]} /><meshBasicMaterial color={color} transparent /></mesh><mesh ref={core}><sphereGeometry args={[0.05, 12, 12]} /><meshBasicMaterial color={selected ? '#fff' : color} /></mesh></group>;
}

function Globe({ events, countries, selected, onSelect, scanning }: { events: GeoEvent[]; countries: Countries | null; selected: string | null; onSelect: (e: GeoEvent) => void; scanning: boolean }) {
  const group = useRef<THREE.Group>(null);
  const drag = useRef({ x: 0, y: 0, rx: 0.12, ry: 0.2, active: false });
  const direction = useRef(1);
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement; el.style.cursor = 'grab';
    const down = (event: PointerEvent) => { drag.current = { x: event.clientX, y: event.clientY, rx: group.current?.rotation.x ?? 0.12, ry: group.current?.rotation.y ?? 0.2, active: true }; el.setPointerCapture(event.pointerId); el.style.cursor = 'grabbing'; };
    const move = (event: PointerEvent) => { if (!drag.current.active || !group.current) return; const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y; if (Math.abs(dx) > 2) direction.current = dx > 0 ? 1 : -1; group.current.rotation.y = drag.current.ry + dx * 0.006; group.current.rotation.x = Math.max(-1.15, Math.min(1.15, drag.current.rx + dy * 0.004)); };
    const up = (event: PointerEvent) => { drag.current.active = false; try { el.releasePointerCapture(event.pointerId); } catch {} el.style.cursor = 'grab'; };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
  }, [gl]);
  useFrame((_, dt) => { if (group.current && !drag.current.active && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) group.current.rotation.y += dt * 0.018 * direction.current; });
  return <group ref={group}><mesh><sphereGeometry args={[2, 48, 48]} /><meshBasicMaterial color="#09131d" wireframe opacity={0.82} transparent /></mesh><mesh><sphereGeometry args={[1.94, 64, 64]} /><meshBasicMaterial color="#0a6f96" wireframe opacity={0.16} transparent /></mesh><Borders data={countries} />{events.map((event) => <Signal key={event.id} e={event} selected={event.id === selected} onSelect={() => onSelect(event)} />)}{scanning && <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[2.025, 0.006, 8, 96]} /><meshBasicMaterial color="#65dcff" transparent opacity={0.18} /></mesh>}</group>;
}

function App() {
  const [q, setQ] = useState('');
  const [events, setEvents] = useState<GeoEvent[]>([]);
  const [countries, setCountries] = useState<Countries | null>(null);
  const [channel, setChannel] = useState('earthquakes');
  const [timeWindow, setTimeWindow] = useState(24);
  const [selected, setSelected] = useState<GeoEvent | null>(null);
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState('CONNECTING • LIVE CORE');
  const [msg, setMsg] = useState('Initializing world intelligence channels...');
  const [scan] = useState(true);

  const load = useCallback(async (c: string, target = '', windowHours = timeWindow) => {
    setChannel(c); setSelected(null); setData(null); setStatus('FETCHING • ' + c.toUpperCase() + (target ? ' / ' + target.toUpperCase() : ''));
    try {
      let url = API + '/api/' + c;
      if (c === 'earthquakes') url += '?hours=' + windowHours + '&min_magnitude=2.5';
      if (c === 'weather') url += '?city=' + encodeURIComponent(target || 'Mumbai');
      if (c === 'news') url += '?query=' + encodeURIComponent(target || 'world');
      if (c === 'currency') url += '?base=USD&symbols=EUR,INR,GBP,JPY';
      if (c === 'network') url = API + '/api/ip?target=' + encodeURIComponent(target || '8.8.8.8');
      const response = await fetch(url); if (!response.ok) throw new Error('Request failed');
      const result = await response.json(); setData(result); setStatus('SYNCHRONIZED • LIVE'); setMsg(result.status === 'unavailable' ? result.message : c.toUpperCase() + ' intelligence synchronized' + (target ? ' for ' + target + '.' : '.'));
      if (c === 'earthquakes') setEvents((result.events || []).map((event: any) => ({ ...event, lat: event.latitude, lon: event.longitude, mag: event.severity })));
      else if (c === 'flights') setEvents((result.aircraft || []).filter((a: any) => a.latitude != null && a.longitude != null).map((a: any, index: number) => ({ id: 'flight-' + (a.icao24 || index), type: 'flight', lat: a.latitude, lon: a.longitude, timestamp: result.updated_at, source: a.source, callsign: a.callsign, altitude_m: a.altitude_m, heading: a.heading, velocity_ms: a.velocity_ms, country: a.country })));
      else if (c === 'iss' && result.latitude != null && result.longitude != null) setEvents([{ id: 'iss-25544', type: 'iss', lat: result.latitude, lon: result.longitude, timestamp: result.timestamp, source: result.source, location: result.name }]);
      else setEvents([]);
    } catch { setStatus('DEGRADED • RETRYING'); setMsg(c.toUpperCase() + ' data source is unavailable right now.'); setEvents([]); }
  }, [timeWindow]);

  const loadLocation = useCallback(async (name: string) => {
    setChannel('location'); setSelected(null); setData(null); setStatus('FETCHING • LOCATION / ' + name.toUpperCase());
    try { const response = await fetch(API + '/api/location?name=' + encodeURIComponent(name)); if (!response.ok) throw new Error('Location not found'); const result = await response.json(); setData(result); setStatus('SYNCHRONIZED • LIVE'); setMsg('Live intelligence synchronized for ' + result.location.name + ', ' + result.location.country + '.'); setEvents((result.earthquakes || []).map((event: any) => ({ ...event, lat: event.latitude, lon: event.longitude, mag: event.severity }))); }
    catch { setStatus('LOCATION NOT FOUND'); setMsg('No live location match found for "' + name + '".'); setEvents([]); }
  }, []);

  useEffect(() => { fetch(GEO).then((response) => response.json()).then(setCountries).catch(() => {}); load('earthquakes', '', 24); }, [load]);
  useEffect(() => { if (channel !== 'earthquakes') return; const timer = window.setInterval(() => load('earthquakes', '', timeWindow), 60000); return () => window.clearInterval(timer); }, [channel, timeWindow, load]);

  const run = async (text: string) => {
    if (!text.trim()) return; setQ(text); setStatus('PROCESSING • COMMAND');
    try { const response = await fetch(API + '/api/command?q=' + encodeURIComponent(text)); const result = await response.json(); if (result.intent === 'weather') await load('weather', result.city); else if (result.intent === 'location') await loadLocation(result.location); else if (result.intent === 'news' && result.place) await loadLocation(result.place); else if (result.intent === 'earthquakes' && result.place) await loadLocation(result.place); else if (result.intent === 'earthquakes') await load('earthquakes', '', timeWindow); else if (result.intent === 'network') await load('network', result.target || '8.8.8.8'); else if (['flights', 'ships', 'iss', 'currency', 'news', 'space'].includes(result.intent)) await load(result.intent, result.place || ''); else setMsg(result.message); setStatus('ANALYSIS READY'); }
    catch { setStatus('CORE ERROR'); setMsg('Command could not reach the live core.'); }
  };

  const pointCount = channel === 'earthquakes' || channel === 'location' ? events.length : data?.count ?? data?.aircraft?.length ?? data?.articles?.length ?? '--';
  const locationWeather = data?.weather || {};
  const locationDaily = data?.daily || {};
  const locationInfo = data?.location || {};
  const weatherCode = locationWeather.weather_code != null ? 'WMO ' + locationWeather.weather_code : '—';
  const formatPopulation = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat('en-IN').format(value);
  const formatDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '—';

  return <main className="app">
    <div className="scanline" />
    <header className="top"><div className="brand">WORLD <span>// LIVE</span></div><div className="top-center"><i /> J.A.R.V.I.S. CORE <b>CONNECTED</b></div><div className="time">GLOBAL NODE • 01</div></header>
    <nav className="channels">{channels.map(([id, icon, label]) => <button className={channel === id ? 'active' : ''} onClick={() => load(id)} key={id}><span>{icon}</span>{label}</button>)}</nav>
    <section className="scene">
      <div className="reticle" />
      <div className="hud hud-left"><small>{channel.toUpperCase()} INTELLIGENCE</small><strong>{pointCount}</strong><span>LIVE DATA POINTS</span><div className="hud-sub">{timeWindow}H SIGNAL WINDOW</div></div>
      <div className="layer-strip"><div className="layer-caption">SIGNAL WINDOW</div>{timeWindows.map(([label, hours]) => <button key={label} className={timeWindow === hours ? 'active' : ''} onClick={() => { const next = Number(hours); setTimeWindow(next); if (channel === 'earthquakes') load('earthquakes', '', next); }}>{label}</button>)}</div>
      <div className="globe-wrap"><Canvas camera={{ position: [0, 0, 6.4], fov: 40 }} dpr={[1, 1.6]}><Globe events={events} countries={countries} selected={selected?.id || null} onSelect={setSelected} scanning={scan} /></Canvas></div>
      {selected ? <aside className="event-panel"><button className="close-panel" onClick={() => setSelected(null)}>×</button><small>SELECTED SIGNAL / {selected.type.toUpperCase()}</small><h2>{selected.location || selected.callsign || selected.country || 'Live signal'}</h2>{selected.type === 'earthquake' ? <div className="big">M{Number(selected.mag || 0).toFixed(1)}</div> : null}{selected.type === 'flight' ? <div className="big">{selected.callsign || 'AIRCRAFT'}</div> : null}{selected.type === 'iss' ? <div className="big">ISS 25544</div> : null}<div className="grid"><span>LAT<b>{selected.lat.toFixed(2)}°</b></span><span>LON<b>{selected.lon.toFixed(2)}°</b></span>{selected.type === 'earthquake' ? <span>DEPTH<b>{selected.depth != null ? selected.depth.toFixed(1) + ' km' : '—'}</b></span> : null}{selected.type === 'flight' ? <span>ALTITUDE<b>{selected.altitude_m != null ? Math.round(selected.altitude_m) + ' m' : '—'}</b></span> : null}{selected.type === 'flight' ? <span>HEADING<b>{selected.heading != null ? Math.round(selected.heading) + '°' : '—'}</b></span> : null}{selected.type === 'flight' ? <span>SPEED<b>{selected.velocity_ms != null ? Math.round(selected.velocity_ms * 3.6) + ' km/h' : '—'}</b></span> : null}{selected.type === 'earthquake' ? <span>TSUNAMI<b>{selected.tsunami ? 'YES' : 'NO'}</b></span> : null}</div><p>{formatDate(selected.timestamp)} · {selected.source}</p></aside> : null}
      <aside className="data-panel">
        {channel === 'location' && data?.location ? <div className="location-intel"><div className="intel-kicker"><span>LOCATION INTELLIGENCE</span><b>LIVE</b></div><div className="intel-title"><div><h2>{locationInfo.name}, {locationInfo.country}</h2><p>{locationInfo.admin1 || 'Regional data'} · {locationInfo.timezone} · {locationInfo.country_code || '—'}</p></div><div className="coord"><b>{Number(locationInfo.latitude).toFixed(3)}°</b><span>LAT</span><b>{Number(locationInfo.longitude).toFixed(3)}°</b><span>LON</span></div></div><div className="intel-primary"><div className="temperature"><span>CURRENT</span><strong>{Math.round(locationWeather.temperature_2m ?? 0)}°</strong><em>{weatherCode}</em></div><div className="weather-meta"><div><span>FEELS LIKE</span><b>{locationWeather.apparent_temperature ?? '—'}°</b></div><div><span>HUMIDITY</span><b>{locationWeather.relative_humidity_2m ?? '—'}%</b></div><div><span>WIND</span><b>{locationWeather.wind_speed_10m ?? '—'} km/h</b></div><div><span>PRESSURE</span><b>{locationWeather.pressure_msl ?? '—'} hPa</b></div></div></div><section className="intel-section"><div className="section-head"><span>REGIONAL STATUS</span><b>OPEN-METEO / GEO</b></div><div className="intel-metrics"><div><small>WIND DIRECTION</small><strong>{locationWeather.wind_direction_10m ?? '—'}°</strong></div><div><small>CLOUD COVER</small><strong>{locationWeather.cloud_cover ?? '—'}%</strong></div><div><small>PRECIPITATION</small><strong>{locationWeather.precipitation ?? '—'} mm</strong></div><div><small>UV INDEX</small><strong>{locationWeather.uv_index ?? '—'}</strong></div><div><small>DAY / NIGHT</small><strong>{locationWeather.is_day === 1 ? 'DAY' : 'NIGHT'}</strong></div><div><small>ELEVATION</small><strong>{locationInfo.elevation_m != null ? Math.round(Number(locationInfo.elevation_m)) + ' m' : '—'}</strong></div><div><small>POPULATION</small><strong>{formatPopulation(locationInfo.population)}</strong></div><div><small>WEATHER CODE</small><strong>{weatherCode}</strong></div></div></section><section className="intel-section"><div className="section-head"><span>SEISMIC ACTIVITY</span><b>500 KM / 7 DAYS</b></div><div className="quake-list">{(data.earthquakes || []).slice(0, 8).map((quake: any, index: number) => <div key={quake.id || index}><span className="q-mag">M{Number(quake.severity).toFixed(1)}</span><div><b>{quake.location}</b><small>{quake.depth != null ? Number(quake.depth).toFixed(1) + ' km depth' : 'Depth —'} · {formatDate(quake.timestamp)}</small></div></div>)}</div>{!(data.earthquakes || []).length ? <div className="empty-intel">NO SIGNIFICANT SEISMIC SIGNALS</div> : null}</section><section className="intel-section"><div className="section-head"><span>LOCAL INTELLIGENCE</span><b>GDELT</b></div><div className="intel-news">{(data.news || []).slice(0, 8).map((article: any, index: number) => <a key={index} href={article.url} target="_blank" rel="noreferrer"><span>{String(index + 1).padStart(2, '0')}</span><div><b>{article.title}</b><small>{article.domain} · {article.date || 'LIVE'} <i>OPEN SOURCE ↗</i></small></div></a>)}</div>{!(data.news || []).length ? <div className="empty-intel">NO LOCAL HEADLINES RETURNED</div> : null}</section><div className="intel-footer"><span>WEATHER {data.status?.weather || '—'}</span><span>SEISMIC {data.status?.earthquakes || '—'}</span><span>NEWS {data.status?.news || '—'}</span></div></div> : null}
        {channel === 'weather' && data?.location ? <div><small>WEATHER / {data.location.name}, {data.location.country}</small><div className="hero">{Math.round(data.current?.temperature_2m ?? 0)}°</div><div className="grid"><span>FEELS LIKE<b>{data.current?.apparent_temperature}°</b></span><span>HUMIDITY<b>{data.current?.relative_humidity_2m}%</b></span><span>WIND<b>{data.current?.wind_speed_10m} km/h</b></span><span>PRESSURE<b>{data.current?.pressure_msl} hPa</b></span><span>UV<b>{data.current?.uv_index}</b></span><span>TIMEZONE<b>{data.location.timezone}</b></span></div></div> : null}
        {channel === 'flights' ? <div><small>✈ LIVE AIRCRAFT / OPENSKY</small><div className="hero">{data?.count ?? '--'}</div><div className="grid"><span>VISIBLE<b>{data?.aircraft?.length ?? 0}</b></span><span>GLOBAL FEED<b>ACTIVE</b></span></div><p>Click aircraft markers for callsign, altitude, heading and speed.</p></div> : null}
        {channel === 'ships' ? <div><small>🚢 VESSEL NETWORK / AIS</small><div className="hero">{data?.status === 'unavailable' ? 'OFFLINE' : data?.count ?? 0}</div><p>{data?.message || 'Live vessel positions available.'}</p></div> : null}
        {channel === 'iss' && data ? <div><small>🌍 ORBITAL TRACK / ISS</small><div className="hero">{Number(data.latitude).toFixed(2)}°</div><div className="grid"><span>LONGITUDE<b>{Number(data.longitude).toFixed(2)}°</b></span><span>ALTITUDE<b>{Number(data.altitude_km).toFixed(1)} km</b></span><span>VELOCITY<b>{Number(data.velocity_kmh).toFixed(0)} km/h</b></span><span>VISIBILITY<b>{data.visibility}</b></span></div><p>{formatDate(data.updated_at)} · {data.source}</p></div> : null}
        {channel === 'currency' && data?.rates ? <div><small>💱 FX MATRIX / {data.base || 'USD'}</small><div className="rate-list">{Object.entries(data.rates).map(([key, value]) => <div key={key}><b>{key}</b><span>{String(value)}</span></div>)}</div></div> : null}
        {channel === 'news' && data?.articles ? <div><small>📰 GLOBAL HEADLINES / GDELT</small><div className="news-list">{data.articles.slice(0, 9).map((article: any, index: number) => <div key={index}><b>{article.title}</b><span>{article.domain} · {article.date || 'LIVE'}</span>{article.url ? <a href={article.url} target="_blank" rel="noreferrer">OPEN SOURCE ↗</a> : null}</div>)}</div></div> : null}
        {channel === 'space' && data ? <div><small>🛰️ SPACE WEATHER / NASA DONKI</small><div className="hero">{Array.isArray(data.events) ? data.events.length : '--'}</div><p>Recent solar flare intelligence. Source: NASA DONKI.</p></div> : null}
        {channel === 'network' && data ? <div><small>🌐 NETWORK INTELLIGENCE / {data.ip || 'LOOKUP'}</small><div className="hero">{data.ip || '--'}</div><div className="grid"><span>ORG<b>{data.org || '—'}</b></span><span>ASN<b>{data.asn || '—'}</b></span><span>COUNTRY<b>{data.country || '—'}</b></span><span>ZONE<b>{data.timezone || '—'}</b></span></div></div> : null}
        {channel === 'earthquakes' && !selected ? <div><small>🌋 SEISMIC NETWORK / USGS</small><div className="hero">{events.length}</div><div className="grid"><span>WINDOW<b>{timeWindow === 168 ? '7 DAYS' : timeWindow + ' HOURS'}</b></span><span>SOURCE<b>USGS</b></span><span>MIN MAG<b>2.5</b></span><span>REFRESH<b>60 SEC</b></span></div></div> : null}
      </aside>
    </section>
    <section className="assistant"><div className="assistant-line"><span>◉</span><div><small>{status}</small><p>{msg}</p></div></div><form onSubmit={(event) => { event.preventDefault(); run(q); }}><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Ask J.A.R.V.I.S. about the world..." /><button>EXECUTE</button></form></section>
    <footer><span>J.A.R.V.I.S. / WORLD INTELLIGENCE</span><span>LAYERS • TIME FILTER • LIVE SIGNALS • CONTEXTUAL INTEL</span><span>DRAG TO ROTATE • LIVE</span></footer>
  </main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
