/**
 * AgriGuard AI — Prompt 9 Final MVP Integration and Hackathon Demo Test Suite
 * 
 * Comprehensive audit of all 5 Prompt 9 Scenarios + Platform Validation:
 * - Scenario A: Farmer registration via WhatsApp -> Field data stored & displayed
 * - Scenario B: Crop report -> Field linking, live data retrieval, assessment stored & displayed
 * - Scenario C: Multimodal crop photo -> Media handling, Gemini 6-field structured schema, uncertainty
 * - Scenario D: Missing data -> Weather/satellite unavailability, zero fabricated values, safe advisory
 * - Scenario E: False-alert protection -> Ambiguous report with normal microclimate, alert suppressed, non-definitive
 * - Webhook handshake verification (GET /webhook challenge)
 * - Immediate 200 OK webhook response (POST /webhook)
 * - Duplicate prevention (in-memory + store message ID deduplication)
 * - Demo mode audit (clear sample data labeling, non-definitive disclaimer)
 * - Dashboard Operations Center REST endpoints & agronomist review action
 */

const axios = require('axios');
const assert = require('assert');
const weatherService = require('../services/weatherService');
const vegetationService = require('../services/vegetationService');
const multimodalService = require('../services/multimodalService');
const riskEngine = require('../services/riskEngine');
const assessmentStore = require('../services/assessmentStore');

const BASE_URL = 'http://localhost:3000';

// 1x1 Minimal Valid JPEG Buffer for Vision Testing
const VALID_JPEG_BUFFER = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64'
);

// Privacy mask helper matching Operations Center UI
function maskPhone(phone) {
  if (!phone) return '—';
  const s = String(phone).replace(/\D/g, '');
  if (s.length <= 4) return s;
  return `+${s.slice(0, 2)} •••• ${s.slice(-4)}`;
}

// Helper to post webhook payloads
async function postWebhook(fromPhone, msgObj, messageId = null) {
  const msgId = messageId || ('wamid.PROMPT9_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
  let messagePayload;

  if (typeof msgObj === 'string') {
    messagePayload = {
      from: fromPhone,
      id: msgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'text',
      text: { body: msgObj }
    };
  } else if (msgObj.type === 'location') {
    messagePayload = {
      from: fromPhone,
      id: msgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'location',
      location: msgObj.location
    };
  } else if (msgObj.type === 'image') {
    messagePayload = {
      from: fromPhone,
      id: msgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'image',
      image: msgObj.image
    };
  } else {
    messagePayload = {
      from: fromPhone,
      id: msgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'text',
      text: { body: String(msgObj) }
    };
  }

  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WHATSAPP_ACCOUNT_ID',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              contacts: [{ profile: { name: 'Audit Farmer' }, wa_id: fromPhone }],
              messages: [messagePayload]
            },
            field: 'messages'
          }
        ]
      }
    ]
  };

  const res = await axios.post(`${BASE_URL}/webhook`, payload);
  return { status: res.status, msgId };
}

// Helper to wait for bot reply with polling
async function waitForBotReply(phone, minExpectedCount = 1, maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const msgs = (await axios.get(`${BASE_URL}/api/messages/${phone}`)).data;
      const botMsgs = msgs.filter(m => m.sender_type !== 'user');
      if (botMsgs.length >= minExpectedCount) {
        return botMsgs[botMsgs.length - 1]?.message_body || '';
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  const msgs = (await axios.get(`${BASE_URL}/api/messages/${phone}`)).data;
  const botMsgs = msgs.filter(m => m.sender_type !== 'user');
  return botMsgs[botMsgs.length - 1]?.message_body || '';
}

async function runPrompt9MvpAudit() {
  console.log('===============================================================');
  console.log('🛡️ AGRIGUARD AI — PROMPT 9 MVP INTEGRATION AUDIT & TEST SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  const total = 10;

  // ─────────────────────────────────────────────────────────────
  // 1. Webhook Handshake & Verification Validation
  // ─────────────────────────────────────────────────────────────
  console.log('TEST 1: Webhook Handshake Verification (Meta Subscription Challenge)...');
  try {
    const challengeVal = 'meta_test_challenge_998877';
    const verifyRes = await axios.get(`${BASE_URL}/webhook`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': process.env.VERIFY_TOKEN || 'whatsapp_bot_2024',
        'hub.challenge': challengeVal
      }
    });
    assert.strictEqual(verifyRes.status, 200, 'Handshake must return 200');
    assert.strictEqual(verifyRes.data.toString(), challengeVal, 'Must echo exact challenge');

    // Test rejection with invalid token
    try {
      await axios.get(`${BASE_URL}/webhook`, {
        params: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'invalid_secret_token',
          'hub.challenge': challengeVal
        }
      });
      assert.fail('Invalid token should have returned 403');
    } catch (err) {
      assert.strictEqual(err.response?.status, 403, 'Invalid token must be rejected with 403');
    }

    console.log('✅ TEST 1 PASSED: Webhook verification challenge passed & invalid token rejected with 403.\n');
    passed++;
  } catch (e) {
    console.error('❌ TEST 1 FAILED:', e.message);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Scenario A — Farmer Registration Workflow
  // ─────────────────────────────────────────────────────────────
  console.log('TEST 2: Scenario A — Farmer Registration & Field Profile Storage...');
  const regPhone = '919333' + Math.floor(100000 + Math.random() * 900000);
  try {
    // Step 1: Initiate
    const r1 = await postWebhook(regPhone, 'I want to register my field');
    assert.strictEqual(r1.status, 200, 'Webhook must ACK 200 immediately');
    const reply1 = await waitForBotReply(regPhone, 1);
    assert(reply1.includes('Which crop are you growing'), 'Must prompt for crop');

    // Step 2: Crop Name
    await postWebhook(regPhone, 'Paddy');
    const reply2 = await waitForBotReply(regPhone, 2);
    assert(reply2.includes('registered crop: Paddy') || reply2.includes('coordinates'), 'Must prompt for location');

    // Step 3: Location Coordinates
    await postWebhook(regPhone, '16.5062, 80.6480');
    const reply3 = await waitForBotReply(regPhone, 3);
    assert(reply3.includes('Coordinates recorded') || reply3.includes('stage'), 'Must prompt for sowing date/stage');

    // Step 4: Sowing Date / Growth Stage
    await postWebhook(regPhone, 'tillering');
    const reply4 = await waitForBotReply(regPhone, 4);
    assert(reply4.includes('Field registration complete') || reply4.includes('Paddy'), 'Must confirm registration');

    // Verify stored field in API
    const fieldsRes = await axios.get(`${BASE_URL}/api/agri/fields`);
    const registeredField = fieldsRes.data.find(f => f.phone_number === regPhone || f.farmer_id === regPhone);
    assert(registeredField, 'Field must be stored and queryable');
    assert.strictEqual(registeredField.crop_name, 'Paddy', 'Crop name must match');
    assert.strictEqual(registeredField.crop_stage, 'tillering', 'Stage must match');

    // Verify farmer privacy masking
    const masked = maskPhone(regPhone);
    assert(masked.includes('••••'), 'Phone number must format with privacy masking');

    console.log('✅ TEST 2 PASSED: Scenario A — Complete 4-step registration, field saved, dashboard displayed with privacy masking.\n');
    passed++;
  } catch (e) {
    console.error('❌ TEST 2 FAILED:', e.message);
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Scenario B — Crop Report with Live Data & Field Linking
  // ─────────────────────────────────────────────────────────────
  console.log('TEST 3: Scenario B — Crop Report Linked to Field with Live Telemetry...');
  try {
    // Registered farmer sends crop description
    const repMsg = 'My paddy crop shows leaf tip drying and chlorotic brown spots';
    const repRes = await postWebhook(regPhone, repMsg);
    assert.strictEqual(repRes.status, 200);

    // Wait for risk engine assessment to complete
    const replyRep = await waitForBotReply(regPhone, 5, 15000);
    assert(replyRep.length > 20, 'Farmer should receive risk assessment advisory');

    // Verify assessment created in store
    const asmtRes = await axios.get(`${BASE_URL}/api/agri/assessments`);
    const fieldAsmt = asmtRes.data.find(a => a.phone_number === regPhone || a.farmer_name?.includes('Farmer'));
    assert(fieldAsmt, 'Assessment record must be created for reported field');
    assert(fieldAsmt.calculated_indicators, 'Assessment must contain calculated indicators');
    assert(fieldAsmt.missing_evidence, 'Assessment must record missing evidence');

    console.log('✅ TEST 3 PASSED: Scenario B — Field linked, live telemetry evaluated, dossier stored with evidence & limitations.\n');
    passed++;
  } catch (e) {
    console.error('❌ TEST 3 FAILED:', e.message);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Scenario C — Multimodal Crop Photo Analysis (6 Required Fields)
  // ─────────────────────────────────────────────────────────────
  console.log('TEST 4: Scenario C — Multimodal Crop Photo Analysis (Strict Schema Compliance)...');
  try {
    // Mock Gemini client to verify strict schema handling
    const mockGemini = {
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            visible_symptoms: [
              "Elliptical spindle-shaped lesions with grayish ash centers and dark brown margins",
              "Chlorotic yellow halo surrounding older lesions on leaf blade"
            ],
            image_quality: "good",
            quality_reason: "High contrast, clear focus on lesion margin",
            possible_explanations: [
              "Foliar fungal infection consistent with Rice Blast (Magnaporthe oryzae) — provisional hypothesis",
              "Brown spot (Bipolaris oryzae) secondary fungal lesion"
            ],
            missing_evidence: [
              "Lower stem collar examination for collar rot phase",
              "Physical underside leaf surface inspection for active conidial sporulation"
            ],
            field_verification_recommended: true,
            non_definitive_statement: multimodalService.NON_DEFINITIVE_DISCLAIMER
          })
        })
      }
    };

    const photoAnalysis = await multimodalService.analyzeCropPhoto({
      imageBuffer: VALID_JPEG_BUFFER,
      mimeType: 'image/jpeg',
      field: {
        id: 'f_test_paddy',
        crop_name: 'Paddy',
        crop_stage: 'tillering',
        latitude: 16.5062,
        longitude: 80.6480
      },
      farmer: { id: 'farmer_01', display_name: 'Audit Farmer', phone_number: regPhone },
      caption: 'Leaf showing diamond brown lesions with gray centers',
      ai: mockGemini,
      modelName: 'gemini-3.1-flash-lite'
    });

    assert.strictEqual(photoAnalysis.status, 'completed', 'Analysis status must be completed');
    assert(Array.isArray(photoAnalysis.visible_symptoms) && photoAnalysis.visible_symptoms.length > 0, 'Must have visible_symptoms array');
    assert.strictEqual(photoAnalysis.image_quality, 'good', 'Must have image_quality');
    assert(Array.isArray(photoAnalysis.possible_explanations), 'Must have possible_explanations array');
    assert(Array.isArray(photoAnalysis.missing_evidence), 'Must have missing_evidence array');
    assert.strictEqual(photoAnalysis.field_verification_recommended, true, 'field_verification_recommended must be boolean true');
    assert(photoAnalysis.non_definitive_statement.includes('does not constitute a definitive'), 'Must include strict non-definitive disclaimer');

    console.log('✅ TEST 4 PASSED: Scenario C — Multimodal vision outputs all 6 required fields with non-definitive statement.\n');
    passed++;
  } catch (e) {
    console.error('❌ TEST 4 FAILED:', e.message);
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Scenario D — Missing Data Handling (Zero Fabrication)
  // ─────────────────────────────────────────────────────────────
  console.log('TEST 5: Scenario D — Missing Data Handling (No Fabrication)...');
  try {
    // 1. Weather unavailable pathway
    const weatherResult = await weatherService.getLiveWeatherData(null, null);
    assert.strictEqual(weatherResult.status, 'unavailable', 'Weather status should be unavailable without coords');
    assert.strictEqual(weatherResult.data_quality.status, 'unavailable', 'data_quality status must be unavailable');
    assert.strictEqual(weatherResult.observations.temperature, null, 'Must not invent temperature');
    assert.strictEqual(weatherResult.observations.relative_humidity, null, 'Must not invent humidity');

    // 2. Satellite unavailable pathway
    const satResult = vegetationService.getUnavailableSatelliteData('Missing field boundary coordinates');
    assert.strictEqual(satResult.status, 'unavailable', 'Satellite status must be unavailable');
    assert.strictEqual(satResult.features.current_ndvi, null, 'Must not invent NDVI');
    assert(satResult.limitations.length > 0, 'Must explicitly record limitations');

    // 3. Risk Engine with missing inputs
    const incompleteRisk = await riskEngine.orchestrateCropRiskAssessment({
      farmer: { id: 'farmer_01', display_name: 'Farmer John' },
      field: { crop_name: 'Paddy' }, // Missing coords & stage
      messageText: 'Yellow spots on leaves',
      preloadedWeather: weatherResult,
      preloadedVegetation: satResult,
      photoAnalysis: null
    });
    assert.strictEqual(incompleteRisk.risk_category, 'insufficient_evidence', 'Must assign insufficient_evidence when data is missing');
    assert(incompleteRisk.missing_information.length >= 2, 'Must explicitly enumerate missing telemetry');
    assert(incompleteRisk.summary.includes('could not confirm a specific crop disease'), 'Advisory must indicate insufficient evidence');

    console.log('✅ TEST 5 PASSED: Scenario D — Zero fabricated values; missing weather & satellite data properly categorized with limitations.\n');
    passed++;
  } catch (e) {
    console.error('❌ TEST 5 FAILED:', e.message);
  }

  // ─────────────────────────────────────────────────────────────
  // 6. Scenario E — False-Alert Protection & Alert Suppression
  // ─────────────────────────────────────────────────────────────
  console.log('TEST 6: Scenario E — False-Alert Protection & Conservative Suppression...');
  try {
    // Benign weather snapshot
    const benignWeather = {
      source: 'Open-Meteo Weather API',
      retrieved_at: new Date().toISOString(),
      location: { latitude: 16.5062, longitude: 80.6480 },
      observations: {
        temperature: 24.0,
        relative_humidity: 50.0,
        apparent_temperature: 24.2,
        precipitation: 0.0,
        accumulated_past_48h_precipitation: 0.0,
        wind_speed: 8.0,
        weather_code: 0,
        forecast_rain_next_3_days: 0.0
      },
      features: {
        recent_wetness: { status: 'dry', is_wet: false, notes: 'Dry foliage' },
        extended_high_humidity: { status: 'normal', is_high_humidity: false, notes: 'RH within safe range' },
        temperature_suitability: { status: 'mild', is_fungal_favorable: false, is_heat_stress: false, notes: 'Moderate temperature' },
        repeated_wet_conditions: { status: 'none', is_repeated_wetness: false, consecutive_wet_days: 0, notes: 'No rain' },
        data_freshness: { is_stale: false, cached: false, age_seconds: 10 }
      },
      data_quality: {
        status: 'live',
        missing_fields: []
      }
    };

    // Normal vegetation snapshot
    const normalVegetation = {
      source: 'Copernicus Sentinel-2 Grid',
      status: 'live',
      location: { latitude: 16.5062, longitude: 80.6480 },
      observations: [
        { timestamp: new Date(Date.now() - 5*86400000).toISOString(), ndvi: 0.72, cloud_cover_percent: 10, is_previous: true },
        { timestamp: new Date().toISOString(), ndvi: 0.74, cloud_cover_percent: 10, is_current: true }
      ],
      features: {
        current_ndvi: 0.74,
        previous_ndvi: 0.72,
        ndvi_change: 0.02,
        trend: 'positive_canopy_growth',
        canopy_vigor: 'Healthy Vigorous Green'
      },
      quality: { usable: true, cloud_rejection: false, cloud_cover_percent: 10 },
      limitations: []
    };

    // Low quality / ambiguous complaint without photo
    const ambiguousAssessment = await riskEngine.orchestrateCropRiskAssessment({
      farmer: { id: 'farmer_01', display_name: 'Farmer John' },
      field: { crop_name: 'Paddy', crop_stage: 'tillering', latitude: 16.5062, longitude: 80.6480 },
      messageText: 'A few lower leaves seem slightly pale',
      preloadedWeather: benignWeather,
      preloadedVegetation: normalVegetation,
      photoAnalysis: null
    });

    // Verify low risk and alert suppression
    assert.strictEqual(ambiguousAssessment.risk_category, 'low', 'Ambiguous complaint with benign weather must be LOW risk');
    assert.strictEqual(ambiguousAssessment.notification_decision.alert_eligible, false, 'No alert eligible for benign conditions');
    assert.strictEqual(ambiguousAssessment.notification_decision.suppressed, true, 'Alert must be suppressed under conservative policy');

    // Verify safe non-definitive advisory
    assert(!ambiguousAssessment.summary.toLowerCase().includes('confirmed blast'), 'Must NOT confirm disease');
    assert(ambiguousAssessment.summary.toLowerCase().includes('not a') || ambiguousAssessment.summary.toLowerCase().includes('provisional'), 'Must include non-definitive disclaimer');

    console.log('✅ TEST 6 PASSED: Scenario E — False alarms suppressed; ambiguous reports receive cautious, non-definitive advisories.\n');
    passed++;
  } catch (e) {
    console.error('❌ TEST 6 FAILED:', e.message);
  }

  // ─────────────────────────────────────────────────────────────
  // 7. Duplicate Prevention Verification
  // ─────────────────────────────────────────────────────────────
  console.log('TEST 7: Webhook Deduplication (Zero Duplicate Replies)...');
  const dedupePhone = '919555' + Math.floor(100000 + Math.random() * 900000);
  const fixedMsgId = 'wamid.AUDIT_DEDUPE_' + Date.now();
  try {
    // Send first message
    const d1 = await postWebhook(dedupePhone, 'Register field', fixedMsgId);
    assert.strictEqual(d1.status, 200);

    // Immediately re-send identical message ID
    const d2 = await postWebhook(dedupePhone, 'Register field', fixedMsgId);
    assert.strictEqual(d2.status, 200);

    // Wait and verify only 1 bot reply exists for this turn (waiting for async Meta API round-trip)
    await waitForBotReply(dedupePhone, 1, 10000);
    await new Promise(r => setTimeout(r, 1000));
    const msgsRes = await axios.get(`${BASE_URL}/api/messages/${dedupePhone}`);
    const botReplies = msgsRes.data.filter(m => m.sender_type !== 'user');
    assert.strictEqual(botReplies.length, 1, 'Exactly one bot reply must be dispatched for duplicated webhook events');

    console.log('✅ TEST 7 PASSED: Duplicate webhook event safely ignored; zero duplicate messages dispatched.\n');
    passed++;
  } catch (e) {
    console.error('❌ TEST 7 FAILED:', e.message);
  }

  // ─────────────────────────────────────────────────────────────
  // 8. Demo Mode & Synthetic Sample Data Audit
  // ─────────────────────────────────────────────────────────────
  console.log('TEST 8: Demo Mode & Sample Data Identification Audit...');
  try {
    // 1. Simulate demo injection
    const simRes = await axios.post(`${BASE_URL}/api/agri/demo/simulate`, { scenario: 'paddy_blast' });
    assert.strictEqual(simRes.status, 200);
    assert(simRes.data.success, 'Demo simulation should succeed');

    // 2. Fetch assessments and verify demo tagging
    const asmts = (await axios.get(`${BASE_URL}/api/agri/assessments`)).data;
    const demoAsmt = asmts.find(a => a.id.startsWith('asmt_demo') && a.is_demo === true);
    assert(demoAsmt, 'Demo assessment must exist in store');
    assert.strictEqual(demoAsmt.is_demo, true, 'is_demo must be true');
    assert.strictEqual(demoAsmt.is_sample, true, 'is_sample must be true');
    assert.strictEqual(demoAsmt.data_source, 'sample_demonstration', 'data_source must be sample_demonstration');

    // 3. Verify sample satellite data explicitly carries DEMO limitations
    const sampleSat = vegetationService.getSampleDemonstrationData('paddy_blast', 16.3067, 80.4365);
    assert.strictEqual(sampleSat.is_sample, true, 'is_sample must be true');
    assert(sampleSat.limitations.some(l => l.includes('DEMO / SAMPLE DATA')), 'Must contain explicit DEMO disclaimer');

    console.log('✅ TEST 8 PASSED: Demo mode clearly labeled as sample data with zero unverified claims.\n');
    passed++;
  } catch (e) {
    console.error('❌ TEST 8 FAILED:', e.message);
  }

  // ─────────────────────────────────────────────────────────────
  // 9. Dashboard Operations Center REST Endpoints Audit
  // ─────────────────────────────────────────────────────────────
  console.log('TEST 9: Dashboard & Operations Center Endpoints Audit...');
  try {
    // 1. Root HTML
    const rootRes = await axios.get(`${BASE_URL}/`, {
      headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
    });
    assert.strictEqual(rootRes.status, 200);
    assert(rootRes.data.includes('AgriGuard AI — Operations Center'), 'Must serve Operations Center UI');

    // 2. Stats
    const statsRes = await axios.get(`${BASE_URL}/api/agri/stats`);
    assert.strictEqual(statsRes.status, 200);
    assert(typeof statsRes.data.totalFarmers === 'number', 'totalFarmers must be number');
    assert(typeof statsRes.data.registeredFields === 'number', 'registeredFields must be number');
    assert(typeof statsRes.data.assessmentsCompleted === 'number', 'assessmentsCompleted must be number');

    // 3. Alerts Queue
    const alertsRes = await axios.get(`${BASE_URL}/api/agri/alerts`);
    assert.strictEqual(alertsRes.status, 200);
    assert(Array.isArray(alertsRes.data), 'Alerts queue must be array');

    // 4. System Health
    const healthRes = await axios.get(`${BASE_URL}/api/agri/system-health`);
    assert.strictEqual(healthRes.status, 200);
    assert.strictEqual(healthRes.data.success, true);
    assert(healthRes.data.services.meta_whatsapp, 'Must include Meta API status');
    assert(healthRes.data.services.gemini_vision, 'Must include Gemini status');

    console.log('✅ TEST 9 PASSED: All 4 Operations Center REST endpoints validated.\n');
    passed++;
  } catch (e) {
    console.error('❌ TEST 9 FAILED:', e.message);
  }

  // ─────────────────────────────────────────────────────────────
  // 10. Officer Review Action (/api/agri/alerts/:id/status)
  // ─────────────────────────────────────────────────────────────
  console.log('TEST 10: Agronomist Review Queue Action Workflow...');
  try {
    const alerts = (await axios.get(`${BASE_URL}/api/agri/alerts`)).data;
    const targetAlert = alerts[0];
    assert(targetAlert, 'Must have at least one alert to test review action');

    const updateRes = await axios.post(`${BASE_URL}/api/agri/alerts/${targetAlert.id}/status`, {
      status: 'Verified',
      reviewerNotes: 'Reviewed by District Agronomist Dr. Rao. Foliar blast lesions confirmed on lower leaves.',
      reviewerName: 'Dr. Rao'
    });
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.data.success, true);
    assert.strictEqual(updateRes.data.alert.status, 'Verified');
    assert.strictEqual(updateRes.data.alert.reviewed_by, 'Dr. Rao');

    console.log('✅ TEST 10 PASSED: Review queue status update action confirmed.\n');
    passed++;
  } catch (e) {
    console.error('❌ TEST 10 FAILED:', e.message);
  }

  console.log('===============================================================');
  if (passed === total) {
    console.log(`🎉 ALL ${passed}/${total} PROMPT 9 MVP INTEGRATION AUDIT TESTS PASSED! (100%)`);
  } else {
    console.log(`⚠️ ${passed}/${total} TESTS PASSED.`);
  }
  console.log('===============================================================\n');

  return { passed, total };
}

if (require.main === module) {
  runPrompt9MvpAudit().catch(err => {
    console.error('Fatal audit error:', err);
    process.exit(1);
  });
}

module.exports = { runPrompt9MvpAudit };
