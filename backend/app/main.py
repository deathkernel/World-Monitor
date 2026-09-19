from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

USGS_FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
USGS_QUERY = "https://earthquake.usgs.gov/fdsnws/event/1/query"
OPEN_METEO_GEOCODE = "https://geocoding-api.open-meteo.com/v1/search"
OPEN_METEO_WEATHER = "https://api.open-meteo.com/v1/forecast"
OPENSKY_STATES = "https://opensky-network.org/api/states/all"
ISS_API = "https://api.wheretheiss.at/v1/satellites/25544"
FRANKFURTER = "https://api.frankfurter.app/latest"
GDELT = "https://api.gdeltproject.org/api/v2/doc/doc"
NASA_DONKI = "https://api.nasa.gov/DONKI"
IPAPI = "https://ipapi.co/json/"
DNS_GOOGLE = "https://dns.google/resolve"

app = FastAPI(title="World Monitor API", version="0.3.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

async def get_json(client: httpx.AsyncClient, url: str, **kwargs: Any) -> Any:
    response = await client.get(url, **kwargs)
    response.raise_for_status()
    return response.json()


def normalize_feature(feature: dict[str, Any]) -> dict[str, Any] | None:
    geometry = feature.get("geometry") or {}
    coordinates = geometry.get("coordinates") or []
    properties = feature.get("properties") or {}
    if len(coordinates) < 2 or properties.get("mag") is None:
        return None
    return {"id": feature.get("id"), "type": "earthquake", "latitude": coordinates[1], "longitude": coordinates[0], "depth": coordinates[2] if len(coordinates) > 2 else None, "severity": properties.get("mag"), "title": "Earthquake", "location": properties.get("place") or "Unknown location", "timestamp": datetime.fromtimestamp(properties["time"] / 1000, tz=timezone.utc).isoformat() if properties.get("time") else None, "source": "USGS", "url": properties.get("url"), "alert": properties.get("alert"), "tsunami": bool(properties.get("tsunami"))}

@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "online", "service": "world-monitor"}

@app.get("/api/earthquakes")
async def earthquakes(hours: int = Query(default=24, ge=1, le=168), min_magnitude: float = Query(default=2.5, ge=-1, le=10)) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            if hours <= 24 and min_magnitude <= 2.5:
                payload = await get_json(client, USGS_FEED)
            else:
                start = datetime.now(timezone.utc) - timedelta(hours=hours)
                payload = await get_json(client, USGS_QUERY, params={"format": "geojson", "starttime": start.isoformat(), "endtime": datetime.now(timezone.utc).isoformat(), "minmagnitude": min_magnitude, "orderby": "time", "limit": 2000})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"USGS request failed: {exc}") from exc
    events = [item for feature in payload.get("features", []) if (item := normalize_feature(feature))]
    events.sort(key=lambda event: event.get("timestamp") or "", reverse=True)
    return {"source": "USGS", "count": len(events), "events": events}

@app.get("/api/weather")
async def weather(city: str = Query(min_length=2, max_length=100)) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            results = (await get_json(client, OPEN_METEO_GEOCODE, params={"name": city, "count": 1, "language": "en", "format": "json"})).get("results") or []
            if not results:
                raise HTTPException(status_code=404, detail=f"Location not found: {city}")
            location = results[0]
            current = (await get_json(client, OPEN_METEO_WEATHER, params={"latitude": location["latitude"], "longitude": location["longitude"], "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m", "timezone": "auto"})).get("current", {})
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Open-Meteo request failed: {exc}") from exc
    return {"source": "Open-Meteo", "location": {"name": location.get("name"), "country": location.get("country"), "latitude": location.get("latitude"), "longitude": location.get("longitude"), "timezone": location.get("timezone")}, "current": current}

@app.get("/api/flights")
async def flights() -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            payload = await get_json(client, OPENSKY_STATES)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"OpenSky request failed: {exc}") from exc
    states = []
    for row in payload.get("states") or []:
        if len(row) < 11 or row[5] is None or row[6] is None:
            continue
        states.append({"icao24": row[0], "callsign": (row[1] or "").strip(), "country": row[2], "longitude": row[5], "latitude": row[6], "altitude_m": row[7], "on_ground": row[8], "velocity_ms": row[9], "heading": row[10], "vertical_rate_ms": row[11] if len(row) > 11 else None, "source": "OpenSky"})
    return {"source": "OpenSky", "count": len(states), "aircraft": states[:2500], "timestamp": payload.get("time")}

@app.get("/api/ships")
async def ships() -> dict[str, Any]:
    return {"source": "AIS", "status": "unavailable", "message": "Live global AIS requires a vessel-data provider/API key. No fabricated vessel positions are shown.", "ships": []}

@app.get("/api/iss")
async def iss() -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            data = await get_json(client, ISS_API)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"ISS request failed: {exc}") from exc
    return {"source": "Where The ISS At", "id": data.get("id"), "name": data.get("name"), "latitude": data.get("latitude"), "longitude": data.get("longitude"), "altitude_km": data.get("altitude"), "velocity_kmh": data.get("velocity"), "visibility": data.get("visibility"), "timestamp": data.get("timestamp")}

@app.get("/api/currency")
async def currency(base: str = Query(default="USD", min_length=3, max_length=3), symbols: str = Query(default="EUR,INR,GBP,JPY", max_length=100)) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            data = await get_json(client, FRANKFURTER, params={"from": base.upper(), "to": symbols.upper()})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Currency request failed: {exc}") from exc
    return {"source": "Frankfurter", **data}

@app.get("/api/news")
async def news(query: str = Query(default="world", min_length=2, max_length=100)) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            data = await get_json(client, GDELT, params={"query": query, "mode": "artlist", "format": "json", "maxrecords": 12, "sort": "datedesc"})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"GDELT request failed: {exc}") from exc
    articles = [{"title": a.get("title"), "url": a.get("url"), "domain": a.get("domain"), "language": a.get("language"), "date": a.get("seendate"), "source": "GDELT"} for a in data.get("articles", [])]
    return {"source": "GDELT", "count": len(articles), "articles": articles}

@app.get("/api/space")
async def space() -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            data = await get_json(client, NASA_DONKI + "/FLR", params={"startDate": (datetime.now(timezone.utc) - timedelta(days=3)).date().isoformat(), "endDate": datetime.now(timezone.utc).date().isoformat(), "api_key": "DEMO_KEY"})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"NASA DONKI request failed: {exc}") from exc
    return {"source": "NASA DONKI", "events": data[:20] if isinstance(data, list) else data}

@app.get("/api/ip")
async def ip_info(target: str | None = Query(default=None, max_length=100)) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            if target:
                ip = target.strip()
                data = await get_json(client, f"https://ipapi.co/{ip}/json/")
            else:
                data = await get_json(client, IPAPI)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"IP lookup failed: {exc}") from exc
    return {"source": "ipapi", "ip": data.get("ip"), "version": data.get("version"), "city": data.get("city"), "region": data.get("region"), "country": data.get("country_name"), "latitude": data.get("latitude"), "longitude": data.get("longitude"), "org": data.get("org"), "asn": data.get("asn"), "timezone": data.get("timezone")}

@app.get("/api/dns")
async def dns(host: str = Query(min_length=1, max_length=253), record_type: str = Query(default="A", max_length=10)) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            data = await get_json(client, DNS_GOOGLE, params={"name": host, "type": record_type.upper()})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"DNS lookup failed: {exc}") from exc
    return {"source": "Google DNS", "host": host, "type": record_type.upper(), "status": data.get("Status"), "answers": [{"name": a.get("name"), "type": a.get("type"), "data": a.get("data"), "ttl": a.get("TTL")} for a in data.get("Answer", [])]}

@app.get("/api/command")
async def command(q: str = Query(min_length=2, max_length=200)) -> dict[str, Any]:
    text = q.strip(); lower = text.lower()
    patterns = {
        "earthquakes": ("earthquake", "earthquakes", "seismic", "quake"),
        "weather": ("weather", "temperature", "forecast", "climate"),
        "flights": ("flight", "flights", "aircraft", "plane"),
        "ships": ("ship", "ships", "vessel", "marine"),
        "iss": ("iss", "space station", "international space station"),
        "currency": ("currency", "exchange rate", "forex"),
        "news": ("news", "headlines"),
        "space": ("space", "solar", "satellite", "nasa"),
        "network": ("ip", "dns", "network", "asn"),
    }
    for intent, words in patterns.items():
        if any(word in lower for word in words):
            city = "Mumbai"
            if intent == "weather":
                match = re.search(r"(?:weather|temperature|forecast|climate)\s+(?:in|at|for)?\s*(.+)$", text, re.I); city = (match.group(1).strip(" ?.,") if match else "Mumbai") or "Mumbai"
                return {"intent": intent, "city": city, "message": f"Weather channel selected for {city}."}
            return {"intent": intent, "message": f"{intent.upper()} channel selected."}
    return {"intent": "overview", "message": "World intelligence core ready. Available channels: weather, flights, ships, earthquakes, ISS, currency, news, space, IP/DNS."}
