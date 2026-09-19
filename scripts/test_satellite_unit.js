const assert = require('assert');
const vegetationService = require('../services/vegetationService');

async function runSatelliteUnitTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING SATELLITE / VEGETATION DATA ADAPTER UNIT TESTS');
  console.log('===============================================================\n');

  // ─────────────────────────────────────────────────────────────
  // Test 1: Valid Live Pathway
  // ─────────────────────────────────────────────────────────────
  console.log('Test 1: Valid Field & Weather (Live Data Pathway)...');
  const validField = {
    crop_name: 'Paddy',
    crop_stage: 'Tillering',
    latitude: 16.3067,
    longitude: 80.4365
  };
  const clearWeather = {
    precipitation: 0.0,
    observations: { weather_code: 1 },
    consecutiveDryDays: 2,
    temperature: 28.0
  };

  const liveRes = await vegetationService.getVegetationIndicators(validField, clearWeather);

  console.log('Checking Top-Level Output Schema...');
  assert.strictEqual(typeof liveRes.source, 'string');
  assert.strictEqual(liveRes.status, 'live');
  assert.ok(Array.isArray(liveRes.observations));
  assert.strictEqual(liveRes.observations.length, 2);
  assert.ok(liveRes.features);
  assert.strictEqual(typeof liveRes.features.current_ndvi, 'number');
  assert.strictEqual(typeof liveRes.features.previous_ndvi, 'number');
  assert.strictEqual(typeof liveRes.features.ndvi_change, 'number');
  assert.ok(liveRes.quality);
  assert.strictEqual(liveRes.quality.usable, true);
  assert.strictEqual(liveRes.quality.cloud_rejection, false);
  assert.ok(Array.isArray(liveRes.limitations));
  assert.ok(liveRes.limitations.length >= 4);

  console.log('Live Result Snapshot:');
  console.log({
    source: liveRes.source,
    status: liveRes.status,
    current_ndvi: liveRes.features.current_ndvi,
    previous_ndvi: liveRes.features.previous_ndvi,
    change: liveRes.features.ndvi_change,
    trend: liveRes.features.trend,
    vigor: liveRes.features.canopy_vigor,
    cloud_cover: liveRes.quality.cloud_cover_percent
  });
  console.log('✅ Test 1 Passed: Valid live satellite schema confirmed!\n');

  // ─────────────────────────────────────────────────────────────
  // Test 2: Missing Data Pathway
  // ─────────────────────────────────────────────────────────────
  console.log('Test 2: Missing Data Pathway (Null Coordinates)...');
  const missingField = { crop_name: 'Tomato', latitude: null, longitude: null };
  const missingRes = await vegetationService.getVegetationIndicators(missingField, clearWeather);

  assert.strictEqual(missingRes.status, 'unavailable');
  assert.strictEqual(missingRes.source, 'None');
  assert.strictEqual(missingRes.features.current_ndvi, null);
  assert.strictEqual(missingRes.observations.length, 0);
  assert.strictEqual(missingRes.quality.usable, false);
  console.log('Missing Data Quality Reason:', missingRes.quality.reason);
  console.log('✅ Test 2 Passed: Missing coordinates return clean unavailable state!\n');

  // ─────────────────────────────────────────────────────────────
  // Test 3: Provider Error Simulation
  // ─────────────────────────────────────────────────────────────
  console.log('Test 3: Provider Error Safe Handling...');
  const errorRes = vegetationService.getUnavailableSatelliteData('Simulated Provider Connection Timeout');
  assert.strictEqual(errorRes.status, 'unavailable');
  assert.strictEqual(errorRes.quality.usable, false);
  assert.ok(errorRes.quality.reason.includes('Timeout'));
  console.log('✅ Test 3 Passed: Provider errors handled safely without crash!\n');

  // ─────────────────────────────────────────────────────────────
  // Test 4: Invalid Out-of-Bounds Coordinates
  // ─────────────────────────────────────────────────────────────
  console.log('Test 4: Invalid Coordinates (lat=999, lon=999)...');
  const invalidField = { crop_name: 'Cotton', latitude: 999, longitude: 999 };
  const invalidRes = await vegetationService.getVegetationIndicators(invalidField, clearWeather);

  assert.strictEqual(invalidRes.status, 'unavailable');
  assert.strictEqual(invalidRes.features.current_ndvi, null);
  assert.ok(invalidRes.quality.reason.includes('bounds'));
  console.log('Invalid coords reason:', invalidRes.quality.reason);
  console.log('✅ Test 4 Passed: Bounds validation confirmed!\n');

  // ─────────────────────────────────────────────────────────────
  // Test 5: Cloud & Data Quality Rejection
  // ─────────────────────────────────────────────────────────────
  console.log('Test 5: Cloud/Quality Rejection (>70% Cloud Cover)...');
  const rainyOvercastWeather = {
    precipitation: 18.5, // heavy rain indicates dense optical cloud cover
    observations: { weather_code: 65 }
  };
  const cloudRes = await vegetationService.getVegetationIndicators(validField, rainyOvercastWeather);

  assert.strictEqual(cloudRes.status, 'unavailable');
  assert.strictEqual(cloudRes.quality.cloud_rejection, true);
  assert.strictEqual(cloudRes.quality.usable, false);
  assert.ok(cloudRes.quality.cloud_cover_percent > 70);
  console.log('Cloud Rejection Output:');
  console.log({
    quality: cloudRes.quality,
    notice: cloudRes.limitations[0]
  });
  console.log('✅ Test 5 Passed: Cloud contamination correctly rejected!\n');

  // ─────────────────────────────────────────────────────────────
  // Test 6: Sample Mode Labeling (Hackathon Demonstration)
  // ─────────────────────────────────────────────────────────────
  console.log('Test 6: Sample Mode Labeling & Visible Notice...');
  const sampleRes = vegetationService.getSampleDemonstrationData('paddy_blast');

  assert.strictEqual(sampleRes.status, 'sample');
  assert.ok(sampleRes.sample_notice);
  assert.strictEqual(sampleRes.sample_notice, 'DEMO / SAMPLE DATA — NOT A LIVE SATELLITE OBSERVATION');
  assert.ok(sampleRes.limitations.some(l => l.includes('DEMO / SAMPLE DATA')));
  assert.strictEqual(typeof sampleRes.features.current_ndvi, 'number');
  assert.strictEqual(typeof sampleRes.features.previous_ndvi, 'number');
  assert.strictEqual(typeof sampleRes.features.ndvi_change, 'number');

  console.log('Sample Notice Check:');
  console.log('sample_notice:', sampleRes.sample_notice);
  console.log('features:', sampleRes.features);
  console.log('✅ Test 6 Passed: Sample mode notice strictly labeled!\n');

  console.log('===============================================================');
  console.log('🎉 ALL SATELLITE / VEGETATION ADAPTER TESTS PASSED!');
  console.log('===============================================================');
}

runSatelliteUnitTests().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
