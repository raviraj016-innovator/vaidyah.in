"""Geospatial utilities for location-based trial search."""

from __future__ import annotations

import math
from typing import Optional

# Earth's mean radius in kilometres
_EARTH_RADIUS_KM = 6371.0


def haversine_distance(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """Return the great-circle distance in **kilometres** between two points.

    Uses the Haversine formula which is accurate to ~0.3 % for typical
    distances encountered in clinical-trial proximity searches.

    Parameters
    ----------
    lat1, lon1 : float
        Latitude and longitude of point 1 in decimal degrees.
    lat2, lon2 : float
        Latitude and longitude of point 2 in decimal degrees.

    Returns
    -------
    float
        Distance in kilometres.
    """
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return _EARTH_RADIUS_KM * c


def closest_location_distance(
    patient_lat: float,
    patient_lon: float,
    locations: list[dict],
) -> Optional[float]:
    """Return the distance (km) to the nearest trial location.

    Parameters
    ----------
    patient_lat, patient_lon : float
        Patient's coordinates in decimal degrees.
    locations : list[dict]
        Each dict should contain ``latitude`` and ``longitude`` keys.

    Returns
    -------
    float or None
        Distance in km to the nearest site, or ``None`` if no location
        has valid coordinates.
    """
    min_dist: Optional[float] = None
    for loc in locations:
        loc_lat = loc.get("latitude")
        loc_lon = loc.get("longitude")
        if loc_lat is None or loc_lon is None:
            continue
        dist = haversine_distance(patient_lat, patient_lon, loc_lat, loc_lon)
        if min_dist is None or dist < min_dist:
            min_dist = dist
    return min_dist


def bounding_box(
    lat: float,
    lon: float,
    radius_km: float,
) -> tuple[float, float, float, float]:
    """Return a lat/lon bounding box for a circle centred on *(lat, lon)*.

    Useful for pre-filtering with a rectangular query before running
    the precise Haversine check.

    Returns
    -------
    (min_lat, max_lat, min_lon, max_lon) in decimal degrees.
    """
    delta_lat = math.degrees(radius_km / _EARTH_RADIUS_KM)
    delta_lon = math.degrees(
        radius_km / (_EARTH_RADIUS_KM * math.cos(math.radians(lat)))
    )
    return (
        lat - delta_lat,
        lat + delta_lat,
        lon - delta_lon,
        lon + delta_lon,
    )
