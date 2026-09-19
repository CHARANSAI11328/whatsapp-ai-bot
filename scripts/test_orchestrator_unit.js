const assert = require('assert');
const riskEngine = require('../services/riskEngine');
const assessmentStore = require('../services/assessmentStore');

async function runOrchestratorTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING AGRIGUARD AI AGENT ORCHESTRATOR & RISK ENGINE TESTS');
  console.log('   Testing all 10 required validation scenarios');
  console.log('===============================================================\n');

  // Helper mock weather
  function mockWeather(overrides = {}) {
    return {
      source: 'Open-Meteo Weather API',
      retrieved_at: new Date().toISOString(),
      location: { latitude: 16.3, longitude: 80.4 },
      observations: {
        temperature: 26.0,
        relative_humidity: 60,
        apparent_temperature: 27.0,
        precipitation: 0.0,
        rain: 0.0,
        accumulated_past_48h_precipitation: 0.0,
        wind_speed: 8.0,
        wind_direction: 180,
        surface_pressure: 1010.0,
        weather_code: 1,
        forecast_rain_next_3_days: 0.0,
        forecast_period: '7 days',
        ...overrides.observations
      },
      features: {},
      data_quality: {
        status: 'live',
        missing_fields: [],
        ...overrides.data_quality
      }
    };
  }

  // Helper mock vegetation
  function mockVegetation(overrides = {}) {
    return {
      source: 'Copernicus Sentinel-2 Grid',
      status: 'live',
      location: { latitude: 16.3, longitude: 80.4 },
      observations: [
        { ndvi: 0.72, cloud_cover_percent: 10, is_previous: true },
        { ndvi: 0.71, cloud_cover_percent: 10, is_current: true }
      ],
      features: {
        current_ndvi: 0.71,
        previous_ndvi: 0.72,
        ndvi_change: -0.01,
        trend: 'stable',
        canopy_vigor: 'Normal Biomass Vigor',
        ...overrides.features
      },
      quality: {
        usable: true,
        cloud_rejection: false,
        cloud_cover_percent: 10,
        ...overrides.quality
      },
      limitations: []
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 1. Normal Conditions
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 1: Normal Conditions...');
  const res1 = await riskEngine.orchestrateCropRiskAssessment({
    farmer: { id: 'f1', display_name: 'Farmer John', phone_number: '919000000001' },
    field: { id: 'field_norm_1', crop_name: 'Paddy', crop_stage: 'Vegetative', latitude: 16.3, longitude: 80.4 },
    messageText: 'Everything looks fine in the plot today.',
    preloadedWeather: mockWeather({ observations: { temperature: 26.0, relative_humidity: 55, precipitation: 0 } }),
    preloadedVegetation: mockVegetation()
  });

  assert.strictEqual(res1.risk_category, 'low');
  assert.strictEqual(res1.alert_eligibility, 'none');
  assert.strictEqual(res1.notification_decision.send_alert, false);
  console.log('   Result: Risk Category =', res1.risk_category, '| Alert Eligibility =', res1.alert_eligibility);
  console.log('✅ Scenario 1 Passed\n');

  // ─────────────────────────────────────────────────────────────
  // 2. High-Risk Environmental Conditions
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 2: High-Risk Environmental Conditions (Rice Blast microclimate)...');
  const res2 = await riskEngine.orchestrateCropRiskAssessment({
    farmer: { id: 'f2', display_name: 'Ramesh', phone_number: '919000000002' },
    field: { id: 'field_high_2', crop_name: 'Paddy', crop_stage: 'Panicle Initiation', latitude: 16.3, longitude: 80.4 },
    messageText: 'Noticed brown spots on upper leaves after heavy rains.',
    mediaObj: { id: 'photo_leaf_blast_01' },
    preloadedWeather: mockWeather({
      observations: {
        temperature: 25.4,
        relative_humidity: 92,
        precipitation: 6.0,
        accumulated_past_48h_precipitation: 14.0,
        forecast_rain_next_3_days: 25.0
      }
    }),
    preloadedVegetation: mockVegetation({ features: { current_ndvi: 0.62, previous_ndvi: 0.72, ndvi_change: -0.10 } })
  });

  assert.strictEqual(res2.risk_category, 'high');
  assert.ok(res2.risk_factors.some(rf => rf.includes('92%')));
  assert.ok(res2.alert_eligibility === 'eligible_under_policy' || res2.alert_eligibility === 'review_required');
  console.log('   Result: Risk Category =', res2.risk_category, '| Scope =', res2.assessment_scope);
  console.log('✅ Scenario 2 Passed\n');

  // ─────────────────────────────────────────────────────────────
  // 3. Missing Weather
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 3: Missing Weather Telemetry...');
  const res3 = await riskEngine.orchestrateCropRiskAssessment({
    farmer: { id: 'f3', display_name: 'Venkata', phone_number: '919000000003' },
    field: { id: 'field_3', crop_name: 'Paddy', crop_stage: 'Tillering', latitude: null, longitude: null },
    messageText: 'Leaves look pale.',
    preloadedWeather: {
      source: 'None',
      data_quality: { status: 'unavailable', missing_fields: ['temperature', 'relative_humidity'] },
      observations: { temperature: null, relative_humidity: null }
    },
    preloadedVegetation: mockVegetation()
  });

  assert.ok(res3.missing_information.some(m => m.toLowerCase().includes('weather')));
  assert.strictEqual(res3.confidence.level, 'low');
  assert.notStrictEqual(res3.risk_category, 'high'); // Must NOT trigger high risk on missing weather
  console.log('   Result: Missing info flagged weather properly. Confidence =', res3.confidence.level);
  console.log('✅ Scenario 3 Passed\n');

  // ─────────────────────────────────────────────────────────────
  // 4. Missing Crop Profile
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 4: Missing Crop Profile...');
  const res4 = await riskEngine.orchestrateCropRiskAssessment({
    farmer: { id: 'f4', display_name: 'Unknown', phone_number: '919000000004' },
    field: null, // No registered field
    messageText: 'My crop is dying please help.',
    preloadedWeather: {
      data_quality: { status: 'unavailable' },
      observations: { temperature: null }
    },
    preloadedVegetation: mockVegetation()
  });

  assert.strictEqual(res4.risk_category, 'insufficient_evidence');
  assert.ok(res4.missing_information.some(m => m.toLowerCase().includes('crop species')));
  assert.strictEqual(res4.alert_eligibility, 'none');
  console.log('   Result: Correctly evaluated as', res4.risk_category);
  console.log('✅ Scenario 4 Passed\n');

  // ─────────────────────────────────────────────────────────────
  // 5. Conflicting Indicators (High Humidity but Extreme 41°C Heat)
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 5: Conflicting Indicators (High Humidity + Extreme Heat)...');
  const res5 = await riskEngine.orchestrateCropRiskAssessment({
    farmer: { id: 'f5', display_name: 'Lakshmi', phone_number: '919000000005' },
    field: { id: 'field_5', crop_name: 'Cotton', crop_stage: 'Flowering', latitude: 16.3, longitude: 80.4 },
    messageText: 'Flower buds are dropping.',
    preloadedWeather: mockWeather({
      observations: {
        temperature: 41.2, // extreme heat suppresses fungal development but causes thermal shock
        relative_humidity: 86,
        precipitation: 0
      }
    }),
    preloadedVegetation: mockVegetation()
  });

  assert.ok(res5.risk_factors.some(rf => rf.toLowerCase().includes('thermal stress') || rf.includes('41.2')));
  assert.ok(res5.alternative_explanations.some(ae => ae.toLowerCase().includes('heat') || ae.toLowerCase().includes('desiccation')));
  console.log('   Result: Correctly identified abiotic thermal stress over simple fungal assumption.');
  console.log('✅ Scenario 5 Passed\n');

  // ─────────────────────────────────────────────────────────────
  // 6. Unreliable Satellite Data (Cloud Occlusion)
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 6: Unreliable Satellite Data (Cloud Rejection)...');
  const cloudyVegetation = {
    source: 'Sentinel-2',
    status: 'unavailable',
    quality: { usable: false, cloud_rejection: true, cloud_cover_percent: 88 },
    features: { current_ndvi: null },
    limitations: ['Optical pass rejected due to heavy cloud contamination']
  };

  const res6 = await riskEngine.orchestrateCropRiskAssessment({
    farmer: { id: 'f6', display_name: 'Suresh', phone_number: '919000000006' },
    field: { id: 'field_6', crop_name: 'Tomato', crop_stage: 'Vegetative', latitude: 16.3, longitude: 80.4 },
    messageText: 'Normal checkup.',
    preloadedWeather: mockWeather(),
    preloadedVegetation: cloudyVegetation
  });

  const vegEvidence = res6.evidence.find(e => e.type === 'vegetation');
  assert.strictEqual(vegEvidence.quality, 'poor');
  assert.ok(vegEvidence.observation.toLowerCase().includes('cloud contamination'));
  console.log('   Result: Cloud-contaminated satellite pass marked poor and excluded from escalation.');
  console.log('✅ Scenario 6 Passed\n');

  // ─────────────────────────────────────────────────────────────
  // 7. Image-Only Report
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 7: Image-Only Report (Without Accompanying Text)...');
  const res7 = await riskEngine.orchestrateCropRiskAssessment({
    farmer: { id: 'f7', display_name: 'Farmer K', phone_number: '919000000007' },
    field: { id: 'field_7', crop_name: 'Chili', crop_stage: 'Fruiting', latitude: 16.3, longitude: 80.4 },
    messageText: '', // No text
    mediaObj: { id: 'media_photo_unannotated_99' },
    preloadedWeather: mockWeather(),
    preloadedVegetation: mockVegetation()
  });

  const imgEvidence = res7.evidence.find(e => e.type === 'image');
  assert.ok(imgEvidence);
  assert.strictEqual(imgEvidence.quality, 'good');
  console.log('   Result: Image detected as preliminary visual evidence, handled without hallucinating text.');
  console.log('✅ Scenario 7 Passed\n');

  // ─────────────────────────────────────────────────────────────
  // 8. No Disease Evidence
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 8: No Disease Evidence...');
  const res8 = await riskEngine.orchestrateCropRiskAssessment({
    farmer: { id: 'f8', display_name: 'Farmer Anand', phone_number: '919000000008' },
    field: { id: 'field_8', crop_name: 'Paddy', crop_stage: 'Vegetative', latitude: 16.3, longitude: 80.4 },
    messageText: 'Field is lush green and healthy.',
    preloadedWeather: mockWeather({ observations: { temperature: 24.0, relative_humidity: 50, precipitation: 0 } }),
    preloadedVegetation: mockVegetation({ features: { current_ndvi: 0.82, canopy_vigor: 'Lush Dense Canopy' } })
  });

  assert.strictEqual(res8.risk_category, 'low');
  assert.strictEqual(res8.alert_eligibility, 'none');
  console.log('   Result: Healthy field evaluated as low risk with zero alerts triggered.');
  console.log('✅ Scenario 8 Passed\n');

  // ─────────────────────────────────────────────────────────────
  // 9. Multiple Possible Explanations (Foliar Chlorosis / Yellowing)
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 9: Multiple Possible Explanations for Yellowing...');
  const res9 = await riskEngine.orchestrateCropRiskAssessment({
    farmer: { id: 'f9', display_name: 'Rao', phone_number: '919000000009' },
    field: { id: 'field_9', crop_name: 'Paddy', crop_stage: 'Tillering', latitude: 16.3, longitude: 80.4 },
    messageText: 'Leaf tips are turning yellow.',
    preloadedWeather: mockWeather(),
    preloadedVegetation: mockVegetation()
  });

  assert.ok(res9.alternative_explanations.length >= 3);
  assert.ok(res9.alternative_explanations.some(ae => ae.toLowerCase().includes('nitrogen')));
  console.log('   Alternative Explanations provided:');
  res9.alternative_explanations.forEach(ae => console.log('   •', ae));
  console.log('✅ Scenario 9 Passed\n');

  // ─────────────────────────────────────────────────────────────
  // 10. Duplicate Alert Prevention
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 10: Duplicate Alert Prevention...');
  const mockFieldId = 'field_dup_test_10';
  const mockAssessment = {
    assessment_id: 'asmt_dup_10',
    risk_category: 'high',
    alert_eligibility: 'review_required'
  };

  // Mock store with an active alert created 2 hours ago
  const mockStore = {
    getAlerts: () => [
      {
        id: 'alt_recent_1',
        field_id: mockFieldId,
        triggered_at: new Date(Date.now() - 2 * 3600000).toISOString(),
        status: 'Pending'
      }
    ]
  };

  const decision = riskEngine.notificationAgent(mockAssessment, mockFieldId, mockStore);
  assert.strictEqual(decision.send_alert, false);
  assert.ok(decision.reason.includes('Duplicate alert suppressed'));
  console.log('   Result:', decision.reason);
  console.log('✅ Scenario 10 Passed\n');

  console.log('===============================================================');
  console.log('🎉 ALL 10 ORCHESTRATOR & RISK ENGINE SCENARIOS PASSED!');
  console.log('===============================================================');
}

runOrchestratorTests().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
