const assert = require('assert');
const weatherService = require('../services/weatherService');

async function runWeatherUnitTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING WEATHER DATA COLLECTION AGENT UNIT TESTS');
  console.log('===============================================================\n');

  // ─────────────────────────────────────────────────────────────
  // Test 1: Live API Normalization & Output Schema Validation
  // ─────────────────────────────────────────────────────────────
  console.log('Test 1: Live Weather API Retrieval & Schema Normalization...');
  const lat = 16.3067;
  const lon = 80.4365;
  const liveResult = await weatherService.getLiveWeatherData(lat, lon);

  console.log('Checking Top-Level Keys...');
  assert.strictEqual(typeof liveResult.source, 'string');
  assert.strictEqual(typeof liveResult.retrieved_at, 'string');
  assert.ok(liveResult.location);
  assert.strictEqual(liveResult.location.latitude, lat);
  assert.strictEqual(liveResult.location.longitude, lon);
  assert.ok(liveResult.observations);
  assert.ok(liveResult.features);
  assert.ok(liveResult.data_quality);

  console.log('Checking Observations Schema...');
  assert.ok('temperature' in liveResult.observations);
  assert.ok('relative_humidity' in liveResult.observations);
  assert.ok('apparent_temperature' in liveResult.observations);
  assert.ok('precipitation' in liveResult.observations);
  assert.ok('accumulated_past_48h_precipitation' in liveResult.observations);
  assert.ok('wind_speed' in liveResult.observations);
  assert.ok('forecast_rain_next_3_days' in liveResult.observations);
  assert.ok('forecast_period' in liveResult.observations);

  console.log('Checking Provisional Risk Features...');
  assert.ok(liveResult.features.recent_wetness);
  assert.ok(liveResult.features.extended_high_humidity);
  assert.ok(liveResult.features.temperature_suitability);
  assert.ok(liveResult.features.repeated_wet_conditions);
  assert.ok(liveResult.features.data_freshness);

  console.log('Live Result Snapshot:');
  console.log({
    source: liveResult.source,
    quality: liveResult.data_quality.status,
    temp: liveResult.observations.temperature,
    humidity: liveResult.observations.relative_humidity,
    precipitation_now: liveResult.observations.precipitation,
    rain_past_48h: liveResult.observations.accumulated_past_48h_precipitation,
    forecast_3d: liveResult.observations.forecast_rain_next_3_days,
    features: {
      high_humidity: liveResult.features.extended_high_humidity.is_high_humidity,
      recent_wetness: liveResult.features.recent_wetness.is_wet,
      fungal_favorable: liveResult.features.temperature_suitability.is_fungal_favorable
    }
  });
  console.log('✅ Test 1 Passed: Live schema fully valid!\n');

  // ─────────────────────────────────────────────────────────────
  // Test 2: Traceable Caching & Snapshot Retrieval
  // ─────────────────────────────────────────────────────────────
  console.log('Test 2: Traceable Cache Snapshot...');
  const cachedResult = await weatherService.getLiveWeatherData(lat, lon);
  assert.strictEqual(cachedResult.data_quality.status, 'cached');
  assert.strictEqual(cachedResult.features.data_freshness.cached, true);
  console.log('Cached status confirmed:', cachedResult.data_quality.status);
  console.log('✅ Test 2 Passed: Cache snapshot verified!\n');

  // ─────────────────────────────────────────────────────────────
  // Test 3: Missing Coordinates (Unavailable Data Behavior)
  // ─────────────────────────────────────────────────────────────
  console.log('Test 3: Missing Coordinates (Zero Fabrication Check)...');
  const missingCoordsResult = await weatherService.getLiveWeatherData(null, null);

  assert.strictEqual(missingCoordsResult.data_quality.status, 'unavailable');
  assert.strictEqual(missingCoordsResult.observations.temperature, null);
  assert.strictEqual(missingCoordsResult.observations.relative_humidity, null);
  assert.strictEqual(missingCoordsResult.observations.precipitation, null);
  assert.strictEqual(missingCoordsResult.features.recent_wetness.status, 'unknown');
  assert.ok(missingCoordsResult.data_quality.missing_fields.includes('temperature'));
  assert.ok(missingCoordsResult.data_quality.missing_fields.includes('relative_humidity'));
  console.log('Missing coords result:', {
    quality: missingCoordsResult.data_quality,
    observations: missingCoordsResult.observations
  });
  console.log('✅ Test 3 Passed: Zero values fabricated when coords missing!\n');

  // ─────────────────────────────────────────────────────────────
  // Test 4: Invalid Out-of-Bounds Coordinates
  // ─────────────────────────────────────────────────────────────
  console.log('Test 4: Invalid Coordinates (e.g. lat=999)...');
  const invalidResult = await weatherService.getLiveWeatherData(999, 999);
  assert.strictEqual(invalidResult.data_quality.status, 'unavailable');
  assert.strictEqual(invalidResult.observations.temperature, null);
  console.log('Invalid coords handled safely without error crash.');
  console.log('✅ Test 4 Passed: Boundary validation verified!\n');

  // ─────────────────────────────────────────────────────────────
  // Test 5: Synthetic Normalizer Failure Simulation (API Error)
  // ─────────────────────────────────────────────────────────────
  console.log('Test 5: Synthetic Normalizer on API Network Failure...');
  const failedResult = weatherService.normalizeWeatherResponse({
    source: 'Open-Meteo Weather API',
    latitude: 16.3,
    longitude: 80.4,
    current: null, // represents network crash / 500 error
    errorReason: 'HTTP 500 Internal Server Error (Simulated)'
  });

  assert.strictEqual(failedResult.data_quality.status, 'unavailable');
  assert.strictEqual(failedResult.observations.temperature, null);
  assert.strictEqual(failedResult.observations.relative_humidity, null);
  assert.strictEqual(failedResult.features.extended_high_humidity.status, 'unknown');
  assert.ok(failedResult.data_quality.reason.includes('HTTP 500'));
  console.log('API failure simulation output:');
  console.log({
    quality: failedResult.data_quality,
    temp: failedResult.observations.temperature
  });
  console.log('✅ Test 5 Passed: Network failures do NOT produce fake observations!\n');

  console.log('===============================================================');
  console.log('🎉 ALL WEATHER DATA COLLECTION AGENT UNIT TESTS PASSED!');
  console.log('===============================================================');
}

runWeatherUnitTests().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
