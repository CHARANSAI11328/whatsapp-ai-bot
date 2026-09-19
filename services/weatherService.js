const axios = require('axios');

/**
 * Weather Data Collection Agent for AgriGuard AI
 *
 * Objectives:
 * 1. Retrieve weather information from a reliable live API (Open-Meteo).
 * 2. Store retrieved data or traceable snapshot.
 * 3. Return a normalized weather object adhering to the strict schema.
 * 4. Make source and timestamp visible to dashboard.
 * 5. Handle API failures WITHOUT fabricating values.
 * 6. Build transparent, configurable risk features (marked provisional).
 */

// Configurable, provisional risk thresholds (NOT presented as scientific dogma)
const PROVISIONAL_THRESHOLDS = {
  high_humidity_percent: 85,
  wet_day_precipitation_mm: 2.0,
  consecutive_wet_days_alert: 2,
  fungal_favorable_min_temp_c: 18.0,
  fungal_favorable_max_temp_c: 29.0,
  thermal_stress_high_c: 38.0,
  thermal_stress_low_c: 12.0,
  dry_spell_days_threshold: 7
};

// Traceable in-memory cache for telemetry snapshots
// Key: "lat,lon" rounded to 2 decimals (~1.1 km grid)
const weatherCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getCacheKey(lat, lon) {
  return `${parseFloat(lat).toFixed(2)},${parseFloat(lon).toFixed(2)}`;
}

/**
 * Normalizes raw API response or creates unavailable structure.
 */
function normalizeWeatherResponse(params) {
  const {
    source = 'Open-Meteo Weather API',
    latitude = null,
    longitude = null,
    current = null,
    daily = null,
    cached = false,
    cacheAgeSeconds = 0,
    errorReason = null
  } = params;

  const retrievedAt = new Date().toISOString();

  // If data is unavailable (API failed or coordinates missing)
  if (!current || latitude === null || longitude === null) {
    const missingFields = [
      'temperature',
      'relative_humidity',
      'apparent_temperature',
      'precipitation',
      'accumulated_past_48h_precipitation',
      'wind_speed',
      'wind_direction',
      'surface_pressure',
      'weather_code',
      'forecast_rain_next_3_days'
    ];

    const unavailableObj = {
      source: source || 'None',
      retrieved_at: retrievedAt,
      location: {
        latitude: latitude,
        longitude: longitude
      },
      observations: {
        temperature: null,
        relative_humidity: null,
        apparent_temperature: null,
        precipitation: null,
        rain: null,
        accumulated_past_48h_precipitation: null,
        wind_speed: null,
        wind_direction: null,
        surface_pressure: null,
        weather_code: null,
        forecast_rain_next_3_days: null,
        forecast_period: null
      },
      features: {
        recent_wetness: {
          status: 'unknown',
          is_wet: null,
          notes: 'Weather telemetry unavailable; cannot evaluate surface wetness.'
        },
        extended_high_humidity: {
          status: 'unknown',
          is_high_humidity: null,
          notes: 'Weather telemetry unavailable; cannot evaluate humidity indicators.'
        },
        temperature_suitability: {
          status: 'unknown',
          is_fungal_favorable: null,
          is_heat_stress: null,
          notes: 'Weather telemetry unavailable; cannot evaluate thermal risk.'
        },
        repeated_wet_conditions: {
          status: 'unknown',
          is_repeated_wetness: null,
          notes: 'Weather telemetry unavailable; cannot evaluate repeated wetness.'
        },
        data_freshness: {
          is_stale: true,
          cached: false,
          age_seconds: null
        }
      },
      data_quality: {
        status: 'unavailable',
        reason: errorReason || 'Coordinates not provided or weather service unreachable',
        missing_fields: missingFields
      }
    };

    // Backward-compatibility properties for existing code
    attachCompatibilityProperties(unavailableObj);
    return unavailableObj;
  }

  // Calculate accumulated past 48h precipitation from daily data
  let accumulatedPast48h = 0.0;
  let forecastRain3Days = 0.0;
  let consecutiveWetDays = 0;
  let consecutiveDryDays = 0;

  if (daily && Array.isArray(daily.precipitation_sum)) {
    const rainSums = daily.precipitation_sum;
    // With past_days=2: index 0 is 2 days ago, index 1 is yesterday, index 2 is today, index 3-5 is next 3 days
    if (rainSums.length >= 2) {
      accumulatedPast48h = (rainSums[0] || 0) + (rainSums[1] || 0);
      accumulatedPast48h = Math.round(accumulatedPast48h * 10) / 10;
    }

    // Next 3 days forecast rain (indices 3, 4, 5 if past_days=2, or first 3 future days)
    const futureSlice = rainSums.slice(2, 5);
    forecastRain3Days = futureSlice.reduce((sum, v) => sum + (v || 0), 0);
    forecastRain3Days = Math.round(forecastRain3Days * 10) / 10;

    // Consecutive wet/dry day estimation
    for (let i = 0; i < rainSums.length; i++) {
      if ((rainSums[i] || 0) >= PROVISIONAL_THRESHOLDS.wet_day_precipitation_mm) {
        consecutiveWetDays++;
      } else {
        consecutiveDryDays++;
      }
    }
  }

  // Clean observations
  const obs = {
    temperature: current.temperature_2m !== undefined ? Math.round(current.temperature_2m * 10) / 10 : null,
    relative_humidity: current.relative_humidity_2m !== undefined ? Math.round(current.relative_humidity_2m) : null,
    apparent_temperature: current.apparent_temperature !== undefined ? Math.round(current.apparent_temperature * 10) / 10 : null,
    precipitation: current.precipitation !== undefined ? Math.round(current.precipitation * 10) / 10 : 0.0,
    rain: current.rain !== undefined ? Math.round(current.rain * 10) / 10 : 0.0,
    accumulated_past_48h_precipitation: accumulatedPast48h,
    wind_speed: current.wind_speed_10m !== undefined ? Math.round(current.wind_speed_10m * 10) / 10 : null,
    wind_direction: current.wind_direction_10m !== undefined ? current.wind_direction_10m : null,
    surface_pressure: current.surface_pressure !== undefined ? Math.round(current.surface_pressure * 10) / 10 : null,
    weather_code: current.weather_code !== undefined ? current.weather_code : null,
    forecast_rain_next_3_days: forecastRain3Days,
    forecast_period: '7 days (daily aggregation)'
  };

  // Missing fields audit
  const missing = [];
  for (const [key, val] of Object.entries(obs)) {
    if (val === null) missing.push(key);
  }

  // ─────────────────────────────────────────────────────────────
  // TRANSPARENT, CONFIGURABLE PROVISIONAL RISK FEATURES
  // ─────────────────────────────────────────────────────────────
  const isHighHumidity = obs.relative_humidity !== null && obs.relative_humidity >= PROVISIONAL_THRESHOLDS.high_humidity_percent;
  const isRecentWetness = obs.precipitation > 0 || obs.accumulated_past_48h_precipitation >= PROVISIONAL_THRESHOLDS.wet_day_precipitation_mm;
  const isFungalTempFavorable = obs.temperature !== null &&
    obs.temperature >= PROVISIONAL_THRESHOLDS.fungal_favorable_min_temp_c &&
    obs.temperature <= PROVISIONAL_THRESHOLDS.fungal_favorable_max_temp_c;
  const isHeatStress = obs.temperature !== null && obs.temperature >= PROVISIONAL_THRESHOLDS.thermal_stress_high_c;
  const isRepeatedWetness = consecutiveWetDays >= PROVISIONAL_THRESHOLDS.consecutive_wet_days_alert || (obs.accumulated_past_48h_precipitation > 15 && forecastRain3Days > 10);

  const features = {
    recent_wetness: {
      status: isRecentWetness ? 'elevated' : 'normal',
      is_wet: isRecentWetness,
      accumulated_past_48h_mm: obs.accumulated_past_48h_precipitation,
      current_precipitation_mm: obs.precipitation,
      provisional_threshold_mm: PROVISIONAL_THRESHOLDS.wet_day_precipitation_mm,
      notes: 'Provisional indicator: Evaluates recent rain and accumulated moisture causing extended leaf wetness.'
    },
    extended_high_humidity: {
      status: isHighHumidity ? 'elevated' : 'normal',
      is_high_humidity: isHighHumidity,
      relative_humidity_percent: obs.relative_humidity,
      provisional_threshold_percent: PROVISIONAL_THRESHOLDS.high_humidity_percent,
      notes: `Provisional indicator: Relative humidity >= ${PROVISIONAL_THRESHOLDS.high_humidity_percent}% creates favorable canopy microclimate.`
    },
    temperature_suitability: {
      current_c: obs.temperature,
      is_fungal_favorable: isFungalTempFavorable,
      is_heat_stress: isHeatStress,
      provisional_fungal_range_c: `${PROVISIONAL_THRESHOLDS.fungal_favorable_min_temp_c}°C - ${PROVISIONAL_THRESHOLDS.fungal_favorable_max_temp_c}°C`,
      provisional_heat_stress_threshold_c: `${PROVISIONAL_THRESHOLDS.thermal_stress_high_c}°C`,
      notes: 'Provisional indicator: Correlates ambient temperature against common pathogen and thermal stress bands.'
    },
    repeated_wet_conditions: {
      status: isRepeatedWetness ? 'elevated' : 'normal',
      is_repeated_wetness: isRepeatedWetness,
      consecutive_wet_days: consecutiveWetDays,
      forecast_rain_72h_mm: obs.forecast_rain_next_3_days,
      provisional_wet_days_threshold: PROVISIONAL_THRESHOLDS.consecutive_wet_days_alert,
      notes: 'Provisional indicator: Consecutive wet days + upcoming rainfall increase fungal splash dispersion.'
    },
    data_freshness: {
      is_stale: cacheAgeSeconds > 1800,
      cached: cached,
      age_seconds: cacheAgeSeconds,
      quality: cached ? 'cached_snapshot' : 'live'
    }
  };

  const normalized = {
    source,
    retrieved_at: retrievedAt,
    location: {
      latitude,
      longitude
    },
    observations: obs,
    features,
    data_quality: {
      status: cached ? 'cached' : 'live',
      missing_fields: missing
    }
  };

  attachCompatibilityProperties(normalized);
  return normalized;
}

/**
 * Attach top-level properties so existing riskEngine and server.js calls continue seamlessly.
 */
function attachCompatibilityProperties(obj) {
  obj.temperature = obj.observations.temperature;
  obj.relativeHumidity = obj.observations.relative_humidity;
  obj.precipitation = obj.observations.precipitation;
  obj.apparentTemperature = obj.observations.apparent_temperature;
  obj.windSpeed = obj.observations.wind_speed;
  obj.weatherCode = obj.observations.weather_code;
  obj.forecastRainNext3Days = obj.observations.forecast_rain_next_3_days || 0;
  obj.consecutiveWetDays = obj.features?.repeated_wet_conditions?.consecutive_wet_days || 0;
  obj.consecutiveDryDays = 0;
  obj.status = obj.data_quality.status;
  obj.timestamp = obj.retrieved_at;
}

/**
 * Main Data Collection Agent function
 */
async function getLiveWeatherData(lat, lon) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return normalizeWeatherResponse({
      source: 'None',
      latitude: null,
      longitude: null,
      errorReason: 'Latitude and Longitude not provided by farmer'
    });
  }

  const parsedLat = parseFloat(lat);
  const parsedLon = parseFloat(lon);

  if (isNaN(parsedLat) || isNaN(parsedLon) || parsedLat < -90 || parsedLat > 90 || parsedLon < -180 || parsedLon > 180) {
    return normalizeWeatherResponse({
      source: 'None',
      latitude: null,
      longitude: null,
      errorReason: `Invalid coordinate bounds provided: lat=${lat}, lon=${lon}`
    });
  }

  const cacheKey = getCacheKey(parsedLat, parsedLon);
  const cachedEntry = weatherCache.get(cacheKey);

  // Check if cache is still fresh (< 15 mins)
  if (cachedEntry) {
    const ageSeconds = Math.floor((Date.now() - cachedEntry.storedAt) / 1000);
    if (ageSeconds < CACHE_TTL_MS / 1000) {
      return normalizeWeatherResponse({
        source: 'Open-Meteo Weather API (Cached Snapshot)',
        latitude: parsedLat,
        longitude: parsedLon,
        current: cachedEntry.raw.current,
        daily: cachedEntry.raw.daily,
        cached: true,
        cacheAgeSeconds: ageSeconds
      });
    }
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(parsedLat)}&longitude=${encodeURIComponent(parsedLon)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&past_days=2&timezone=auto`;

    const response = await axios.get(url, { timeout: 8000 });
    const rawData = response.data || {};

    // Store in traceable in-memory cache
    weatherCache.set(cacheKey, {
      storedAt: Date.now(),
      raw: rawData
    });

    return normalizeWeatherResponse({
      source: 'Open-Meteo Weather API',
      latitude: parsedLat,
      longitude: parsedLon,
      current: rawData.current,
      daily: rawData.daily,
      cached: false,
      cacheAgeSeconds: 0
    });
  } catch (err) {
    console.error(`[AgriGuard Weather] Error querying Open-Meteo for (${parsedLat}, ${parsedLon}):`, err.message);

    // If we have any cached entry (even if stale), use it as fallback with explicit 'cached' status
    if (cachedEntry) {
      const ageSeconds = Math.floor((Date.now() - cachedEntry.storedAt) / 1000);
      return normalizeWeatherResponse({
        source: 'Open-Meteo Weather API (Stale Cache Fallback)',
        latitude: parsedLat,
        longitude: parsedLon,
        current: cachedEntry.raw.current,
        daily: cachedEntry.raw.daily,
        cached: true,
        cacheAgeSeconds: ageSeconds
      });
    }

    // Do NOT fabricate values on failure! Return clean 'unavailable' state
    return normalizeWeatherResponse({
      source: 'Open-Meteo Weather API',
      latitude: parsedLat,
      longitude: parsedLon,
      errorReason: `Weather API connection failure: ${err.message}`
    });
  }
}

module.exports = {
  getLiveWeatherData,
  normalizeWeatherResponse,
  PROVISIONAL_THRESHOLDS
};
