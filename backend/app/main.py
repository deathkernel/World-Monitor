from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

USGS_FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
USGS_QUERY = "https://earthquake.usgs.gov/fdsnws/event/1/query"
OPEN_METEO_GEOCODE = "https://geocoding-api.open-meteo.com/v1/search"
OPEN_METEO_WEATHER = "https://api.open-meteo.com/v1/forecast"

app = FastAPI(title="World Monitor API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def normalize_feature(feature: dict[str, Any]) -> dict[str, Any] | None:
    geometry = feature.get("geometry") or {}
    coordinates = geometry.get("coordinates") or []
    properties = feature.get("properties") or {}
    if len(coordinates) < 2 or properties.get("mag") is None:
        return None
    return {
        "id": feature.get("id"),
        "type": "earthquake",
        "latitude": coordinates[1],
        "longitude": coordinates[0],
        "depth": coordinates[2] if len(coordinates) > 2 else None,
        "severity": properties.get("mag"),
        "title": "Earthquake",
        "location": properties.get("place") or "Unknown location",
        "timestamp": datetime.fromtimestamp(properties["time"] / 1000, tz=timezone.utc).isoformat()
        if properties.get("time")
        else None,
        "source": "USGS",
        "url": properties.get("url"),
        "alert": properties.get("alert"),
        "tsunami": bool(properties.get("tsunami")),
    }


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "online", "service": "world-monitor"}


@app.get("/api/earthquakes")
async def earthquakes(
    hours: int = Query(default=24, ge=1, le=168),
    min_magnitude: float = Query(default=2.5, ge=-1, le=10),
) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            if hours <= 24 and min_magnitude <= 2.5:
                response = await client.get(USGS_FEED)
            else:
                start = datetime.now(timezone.utc) - timedelta(hours=hours)
                response = await client.get(
                    USGS_QUERY,
                    params={
                        "format": "geojson",
                        "starttime": start.isoformat(),
                        "endtime": datetime.now(timezone.utc).isoformat(),
                        "minmagnitude": min_magnitude,
                        "orderby": "time",
                        "limit": 2000,
                    },
                )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"USGS request failed: {exc}") from exc

    events = [item for feature in payload.get("features", []) if (item := normalize_feature(feature))]
    events.sort(key=lambda event: event.get("timestamp") or "", reverse=True)
    return {"source": "USGS", "count": len(events), "events": events}


@app.get("/api/weather")
async def weather(city: str = Query(min_length=2, max_length=100)) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            geo_response = await client.get(
                OPEN_METEO_GEOCODE,
                params={"name": city, "count": 1, "language": "en", "format": "json"},
            )
            geo_response.raise_for_status()
            results = geo_response.json().get("results") or []
            if not results:
                raise HTTPException(status_code=404, detail=f"Location not found: {city}")
            location = results[0]
            weather_response = await client.get(
                OPEN_METEO_WEATHER,
                params={
                    "latitude": location["latitude"],
                    "longitude": location["longitude"],
                    "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
                    "timezone": "auto",
                },
            )
            weather_response.raise_for_status()
            current = weather_response.json().get("current", {})
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Open-Meteo request failed: {exc}") from exc

    return {
        "source": "Open-Meteo",
        "location": {
            "name": location.get("name"),
            "country": location.get("country"),
            "latitude": location.get("latitude"),
            "longitude": location.get("longitude"),
            "timezone": location.get("timezone"),
        },
        "current": current,
    }


@app.get("/api/command")
async def command(q: str = Query(min_length=2, max_length=200)) -> dict[str, Any]:
    text = q.strip()
    lower = text.lower()
    if any(word in lower for word in ("earthquake", "seismic", "quake")):
        return {"intent": "earthquakes", "message": "Seismic channel selected.", "endpoint": "/api/earthquakes"}
    if "weather" in lower:
        city = text.lower().split("weather", 1)[-1].strip(" inat:") or "Mumbai"
        return {"intent": "weather", "city": city.title(), "message": f"Weather channel selected for {city.title()}."}
    return {"intent": "general", "message": "Command recognized. Available channels: seismic and weather."}
