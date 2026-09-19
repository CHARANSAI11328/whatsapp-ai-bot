const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'agriguard_store.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Clean initial store structure — zero fake farmers, zero fake fields
function getInitialSeed() {
  return {
    farmers: [],
    fields: [],
    field_reports: [],
    assessments: [],
    alerts: [],
    messages: [],
    onboarding_states: {},
    pending_intakes: {}
  };
}

function clearAllData() {
  const clean = getInitialSeed();
  writeStore(clean);
  processedMessageIds.clear();
  return clean;
}

// Read JSON store
function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      const initial = getInitialSeed();
      fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.onboarding_states) parsed.onboarding_states = {};
    if (!parsed.field_reports) parsed.field_reports = [];
    if (!parsed.messages) parsed.messages = [];
    return parsed;
  } catch (err) {
    console.error('[AgriGuard Store] Read error, resetting to seed:', err.message);
    return getInitialSeed();
  }
}

// Write JSON store
function writeStore(data) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[AgriGuard Store] Write error:', err.message);
    return false;
  }
}

// ─── ONBOARDING STATE MANAGEMENT (PERSISTENT) ───

function getOnboardingState(phone) {
  const clean = (phone || '').replace(/\D/g, '');
  const store = readStore();
  return store.onboarding_states[clean] || null;
}

function setOnboardingState(phone, state) {
  const clean = (phone || '').replace(/\D/g, '');
  const store = readStore();
  store.onboarding_states[clean] = {
    ...state,
    phone_number: clean,
    updated_at: new Date().toISOString()
  };
  writeStore(store);
  return store.onboarding_states[clean];
}

function clearOnboardingState(phone) {
  const clean = (phone || '').replace(/\D/g, '');
  const store = readStore();
  delete store.onboarding_states[clean];
  writeStore(store);
  return true;
}

// ─── PENDING INTAKE MANAGEMENT ───

function getPendingIntake(phone) {
  const clean = (phone || '').replace(/\D/g, '');
  const store = readStore();
  return (store.pending_intakes && store.pending_intakes[clean]) || null;
}

function setPendingIntake(phone, intakeData) {
  const clean = (phone || '').replace(/\D/g, '');
  const store = readStore();
  if (!store.pending_intakes) store.pending_intakes = {};
  store.pending_intakes[clean] = {
    ...intakeData,
    phone_number: clean,
    updated_at: new Date().toISOString()
  };
  writeStore(store);
  return store.pending_intakes[clean];
}

function clearPendingIntake(phone) {
  const clean = (phone || '').replace(/\D/g, '');
  const store = readStore();
  if (store.pending_intakes) {
    delete store.pending_intakes[clean];
    writeStore(store);
  }
  return true;
}

// ─── FARMER CRUD ───

function getFarmers() {
  return readStore().farmers || [];
}

function getFarmerByPhone(phone) {
  const cleanPhone = (phone || '').replace(/\D/g, '');
  const store = readStore();
  return store.farmers.find(f => f.phone_number.replace(/\D/g, '') === cleanPhone);
}

function saveFarmer(farmerData) {
  const store = readStore();
  const cleanPhone = (farmerData.phone_number || '').replace(/\D/g, '');
  let existing = store.farmers.find(f => f.phone_number.replace(/\D/g, '') === cleanPhone);

  const now = new Date().toISOString();
  if (existing) {
    existing.display_name = farmerData.display_name || farmerData.name || existing.display_name || existing.name;
    existing.name = existing.display_name;
    existing.preferred_language = farmerData.preferred_language || existing.preferred_language || 'en';
    if (farmerData.latitude) existing.latitude = farmerData.latitude;
    if (farmerData.longitude) existing.longitude = farmerData.longitude;
    if (farmerData.village) existing.village = farmerData.village;
    existing.updated_at = now;
  } else {
    existing = {
      id: 'farmer_' + Date.now(),
      phone_number: cleanPhone,
      display_name: farmerData.display_name || farmerData.name || ('Farmer ' + cleanPhone.slice(-4)),
      name: farmerData.display_name || farmerData.name || ('Farmer ' + cleanPhone.slice(-4)),
      preferred_language: farmerData.preferred_language || 'en',
      village: farmerData.village || 'Registered Region',
      state: farmerData.state || 'India',
      latitude: farmerData.latitude || null,
      longitude: farmerData.longitude || null,
      created_at: now,
      registered_at: now,
      updated_at: now,
      active_fields_count: 1
    };
    store.farmers.unshift(existing);
  }
  writeStore(store);
  return existing;
}

// ─── FIELD CRUD ───

function getFields(farmerPhone = null) {
  const store = readStore();
  if (!farmerPhone) return store.fields || [];
  const clean = farmerPhone.replace(/\D/g, '');
  return store.fields.filter(f => f.phone_number.replace(/\D/g, '') === clean);
}

function getFieldById(fieldId) {
  const store = readStore();
  return store.fields.find(f => f.id === fieldId) || null;
}

function saveField(fieldData) {
  const store = readStore();
  const cleanPhone = (fieldData.phone_number || '').replace(/\D/g, '');
  let existing = store.fields.find(f => f.id === fieldData.id);
  const now = new Date().toISOString();

  if (existing) {
    Object.assign(existing, fieldData, { updated_at: now });
  } else {
    existing = {
      id: 'field_' + Date.now(),
      farmer_id: fieldData.farmer_id || null,
      phone_number: cleanPhone,
      field_name: fieldData.field_name || (fieldData.crop_name ? `${fieldData.crop_name} Plot` : 'Main Field'),
      crop_name: fieldData.crop_name || fieldData.crop_type || 'General Crop',
      crop_type: fieldData.crop_type || fieldData.crop_name || 'General Crop',
      crop_variety: fieldData.crop_variety || null,
      sowing_date: fieldData.sowing_date || now.split('T')[0],
      latitude: fieldData.latitude || null,
      longitude: fieldData.longitude || null,
      area: fieldData.area || fieldData.acreage || 2.0,
      acreage: fieldData.area || fieldData.acreage || 2.0,
      soil_type: fieldData.soil_type || 'Loam',
      irrigation_type: fieldData.irrigation_type || 'Rainfed',
      crop_stage: fieldData.crop_stage || fieldData.growth_stage || 'Vegetative',
      growth_stage: fieldData.crop_stage || fieldData.growth_stage || 'Vegetative',
      created_at: now,
      updated_at: now
    };
    store.fields.unshift(existing);
  }
  writeStore(store);
  return existing;
}

// ─── FIELD REPORTS CRUD ───

function getFieldReports(fieldId = null) {
  const store = readStore();
  if (!fieldId) return store.field_reports || [];
  return (store.field_reports || []).filter(r => r.field_id === fieldId);
}

function saveFieldReport(reportData) {
  const store = readStore();
  const now = new Date().toISOString();
  const newReport = {
    id: reportData.id || ('frpt_' + Date.now()),
    field_id: reportData.field_id || null,
    farmer_id: reportData.farmer_id || null,
    phone_number: reportData.phone_number || null,
    source_message_id: reportData.source_message_id || ('msg_' + Date.now()),
    report_type: reportData.report_type || 'visual_photo',
    description: reportData.description || 'Field update received via WhatsApp',
    media_reference: reportData.media_reference || null,
    media_metadata: reportData.media_metadata || null,
    analysis_status: reportData.analysis_status || 'completed',
    analysis_result: reportData.analysis_result || null,
    captured_at: reportData.captured_at || now,
    created_at: now
  };
  if (!store.field_reports) store.field_reports = [];
  store.field_reports.unshift(newReport);
  writeStore(store);
  return newReport;
}

// ─── ASSESSMENTS & ALERTS ───

function getAssessments() {
  return readStore().assessments || [];
}

function saveAssessment(assessment) {
  const store = readStore();
  const now = new Date().toISOString();
  const newAsmt = {
    id: 'asmt_' + Date.now(),
    created_at: now,
    assessment_type: assessment.assessment_type || 'multimodal_environmental',
    confidence_level: assessment.confidence_level || (assessment.confidence_score ? `${Math.round(assessment.confidence_score * 100)}%` : 'MODERATE'),
    summary: assessment.summary || assessment.farmer_whatsapp_summary || 'Assessment recorded.',
    ...assessment
  };
  store.assessments.unshift(newAsmt);

  // Automatically trigger an alert if conservative alert condition is met
  if (newAsmt.risk_level === 'HIGH' || newAsmt.risk_level === 'CRITICAL') {
    const newAlert = {
      id: 'alt_' + Date.now(),
      assessment_id: newAsmt.id,
      farmer_id: newAsmt.farmer_id || null,
      farmer_name: newAsmt.farmer_name || 'Farmer',
      phone_number: newAsmt.phone_number,
      crop_type: newAsmt.crop_type || newAsmt.crop_name,
      field_location: newAsmt.location || 'Monitored Field',
      alert_title: `High Risk Warning: ${newAsmt.crop_type || newAsmt.crop_name} Stress Detected`,
      severity: newAsmt.risk_level,
      status: 'Pending',
      triggered_at: newAsmt.created_at,
      reviewer_notes: 'Automatically flagged by AgriGuard Risk Engine based on environmental triggers.',
      reviewed_by: null,
      reviewed_at: null
    };
    store.alerts.unshift(newAlert);
  }

  writeStore(store);
  return newAsmt;
}

function updateAssessment(assessmentId, updates = {}) {
  const store = readStore();
  const index = (store.assessments || []).findIndex(a => a.id === assessmentId);
  if (index === -1) return null;

  const updated = {
    ...store.assessments[index],
    ...updates,
    updated_at: new Date().toISOString()
  };
  store.assessments[index] = updated;
  writeStore(store);
  return updated;
}

// ─── MESSAGE HISTORY & DEDUPLICATION ───

// In-memory LRU-style set for ultra-fast webhook deduplication (<1ms)
const processedMessageIds = new Set();

function isMessageProcessed(messageId) {
  if (!messageId) return false;
  if (processedMessageIds.has(messageId)) return true;

  // Also check persistent messages store
  const store = readStore();
  const found = (store.messages || []).some(m => m.id === messageId);
  if (found) {
    processedMessageIds.add(messageId);
    return true;
  }
  return false;
}

function markMessageProcessed(messageId) {
  if (!messageId) return;
  processedMessageIds.add(messageId);
  // Cap in-memory set to prevent unbounded growth
  if (processedMessageIds.size > 2000) {
    const it = processedMessageIds.values();
    for (let i = 0; i < 500; i++) {
      processedMessageIds.delete(it.next().value);
    }
  }
}

function saveMessage(msg = {}) {
  const store = readStore();
  const now = new Date().toISOString();
  const newMsg = {
    id: msg.id || ('msg_' + Date.now()),
    phone_number: (msg.phone_number || '').replace(/\D/g, ''),
    sender_type: msg.sender_type || 'user',
    message_body: msg.message_body || msg.text || '',
    buttons: msg.buttons || [],
    delivery_status: msg.delivery_status || 'received',
    timestamp: msg.timestamp || now,
    created_at: now
  };

  markMessageProcessed(newMsg.id);

  if (!store.messages) store.messages = [];
  store.messages.unshift(newMsg);
  // Keep last 1000 messages in store
  if (store.messages.length > 1000) {
    store.messages = store.messages.slice(0, 1000);
  }
  writeStore(store);
  return newMsg;
}

function getMessages(phone = null) {
  const store = readStore();
  const msgs = store.messages || [];
  if (!phone) return msgs;
  const clean = String(phone).replace(/\D/g, '');
  return msgs.filter(m => m.phone_number === clean);
}

function getAlerts() {
  return readStore().alerts || [];
}

function updateAlertStatus(alertId, status, reviewerNotes = '', reviewerName = 'Field Supervisor') {
  const store = readStore();
  const alert = store.alerts.find(a => a.id === alertId);
  if (!alert) return null;

  alert.status = status;
  if (reviewerNotes) alert.reviewer_notes = reviewerNotes;
  alert.reviewed_by = reviewerName;
  alert.reviewed_at = new Date().toISOString();

  writeStore(store);
  return alert;
}

function getStats() {
  const store = readStore();
  const highRiskCount = (store.assessments || []).filter(a => a.risk_level === 'HIGH' || a.risk_level === 'CRITICAL').length;
  const pendingAlerts = (store.alerts || []).filter(a => a.status === 'Pending' || a.status === 'Under Review').length;

  return {
    totalFarmers: (store.farmers || []).length,
    registeredFields: (store.fields || []).length,
    totalFields: (store.fields || []).length,
    reportsReceived: (store.field_reports || []).length,
    totalFieldReports: (store.field_reports || []).length,
    assessmentsCompleted: (store.assessments || []).length,
    totalAssessments: (store.assessments || []).length,
    assessmentsRequiringReview: pendingAlerts,
    highRiskAssessments: highRiskCount,
    activeAlerts: pendingAlerts,
    lastDataRetrieval: new Date().toISOString(),
    alertsByStatus: {
      pending: (store.alerts || []).filter(a => a.status === 'Pending').length,
      underReview: (store.alerts || []).filter(a => a.status === 'Under Review').length,
      verified: (store.alerts || []).filter(a => a.status === 'Verified').length,
      dismissed: (store.alerts || []).filter(a => a.status === 'Dismissed').length
    }
  };
}

function injectDemoScenario(scenarioKey) {
  const store = readStore();
  const now = new Date().toISOString();

  if (scenarioKey === 'paddy_blast') {
    const asmt = {
      id: 'asmt_demo_' + Date.now(),
      field_id: 'field_001',
      created_at: now,
      farmer_id: 'farmer_001',
      phone_number: '919440201203',
      farmer_name: 'Ramesh Reddy',
      crop_name: 'Paddy',
      crop_type: 'Paddy (BPT 5204)',
      crop_stage: 'Panicle Emergence',
      growth_stage: 'Panicle Emergence',
      location: 'Guntur Rural (16.3067, 80.4365)',
      is_demo: true,
      is_sample: true,
      data_source: 'sample_demonstration',
      assessment_type: 'multimodal_environmental',
      risk_level: 'HIGH',
      risk_score: 88,
      confidence_level: 'HIGH (92%)',
      confidence_score: 0.92,
      status: 'open',
      summary: 'High fungal blast favorability in Paddy crop during panicle emergence.',
      has_photo: true,
      observed_data: 'DEMO SAMPLE: Typical diamond-shaped blast lesions on leaf blade with ash-gray center.',
      calculated_indicators: [
        'RULE-FUNGAL-01: High Fungal Spore Index (Humidity 91%, Temp 25.8°C)',
        'Leaf wetness > 16 consecutive hours'
      ],
      environmental_risk_factors: [
        'Overcast rainy conditions (32mm rain in 48h)',
        'Relative humidity > 90%'
      ],
      possible_crop_stress: 'High fungal blast proliferation risk during panicle emergence.',
      disease_hypotheses: [
        { hypothesis: 'Rice Blast (Magnaporthe oryzae)', probability: 'High Environmental Favorability', confidence: 'Unconfirmed Hypothesis' }
      ],
      missing_evidence: ['Physical leaf surface spore microscopy'],
      recommended_verification_actions: [
        'Scout diagonal transects across field for flag leaf lesion count.',
        'Withhold further nitrogen top-dressing.',
        'Obtain agricultural officer confirmation prior to fungicide treatment.'
      ],
      farmer_whatsapp_summary: '🚨 *AgriGuard Alert*: HIGH risk of Rice Blast detected due to 91% humidity and rain. Diamond lesions observed. Please verify with local extension officer before spraying.'
    };
    store.assessments.unshift(asmt);
    store.alerts.unshift({
      id: 'alt_demo_' + Date.now(),
      assessment_id: asmt.id,
      farmer_id: asmt.farmer_id,
      farmer_name: asmt.farmer_name,
      phone_number: asmt.phone_number,
      crop_type: asmt.crop_type,
      field_location: asmt.location,
      alert_title: 'DEMO ALERT: Rice Blast High Microclimate Risk',
      is_demo: true,
      is_sample: true,
      data_source: 'sample_demonstration',
      severity: 'HIGH',
      status: 'Pending',
      triggered_at: now,
      reviewer_notes: 'Demo simulation injected for hackathon review.',
      reviewed_by: null,
      reviewed_at: null
    });
    store.field_reports.unshift({
      id: 'frpt_demo_' + Date.now(),
      field_id: 'field_001',
      farmer_id: 'farmer_001',
      phone_number: '919440201203',
      is_demo: true,
      is_sample: true,
      data_source: 'sample_demonstration',
      report_type: 'visual_photo',
      description: 'DEMO: Spindle-shaped foliar blast spots on leaf blade following continuous high humidity (91%)',
      media_reference: 'media_sample_blast_leaf.jpg',
      media_metadata: {
        mime_type: 'image/jpeg',
        sample_preview: true
      },
      analysis_status: 'completed',
      analysis_result: {
        visible_symptoms: ['Spindle-shaped elliptical lesions with gray centers and necrotic brown margins'],
        image_quality: 'good',
        possible_explanations: ['Rice Blast (Magnaporthe oryzae) foliar phase (unconfirmed provisional hypothesis)'],
        missing_evidence: ['Under-leaf spore microscopy', 'Stem collar phase examination'],
        field_verification_recommended: true,
        non_definitive_statement: 'This image analysis is a preliminary visual observation and does not constitute a definitive laboratory or agronomic diagnosis.'
      },
      captured_at: now,
      created_at: now
    });
  } else if (scenarioKey === 'cotton_heat_stress') {
    const asmt = {
      id: 'asmt_demo_' + Date.now(),
      field_id: 'field_004',
      created_at: now,
      farmer_id: 'farmer_003',
      phone_number: '919848012345',
      farmer_name: 'Lakshmi Devi',
      crop_name: 'Cotton',
      crop_type: 'Cotton (Bt)',
      crop_stage: 'Square to Flowering',
      growth_stage: 'Square to Flowering',
      location: 'Vijayawada West (16.5062, 80.6480)',
      is_demo: true,
      is_sample: true,
      data_source: 'sample_demonstration',
      assessment_type: 'rule_engine',
      risk_level: 'HIGH',
      risk_score: 79,
      confidence_level: 'HIGH (85%)',
      confidence_score: 0.85,
      status: 'open',
      summary: 'Severe thermal heat stress (39.4°C) with flower square desiccation risk.',
      has_photo: false,
      observed_data: 'DEMO SAMPLE: Canopy wilting observed during midday peak sun, square shedding noted.',
      calculated_indicators: [
        'RULE-HEAT-01: Severe Crop Thermal Stress (Temp 39.4°C)',
        'RULE-DROUGHT-01: 9 Consecutive dry days with low relative humidity (34%)'
      ],
      environmental_risk_factors: [
        'Maximum temperature exceeding 39°C',
        'Dry ambient airflow desiccating bloom pollen'
      ],
      possible_crop_stress: 'Abiotic heat shock and square shedding (non-pathogenic).',
      disease_hypotheses: [
        { hypothesis: 'Thermal stress & moisture deficit desiccation', probability: 'High', confidence: 'Abiotic Factor' }
      ],
      missing_evidence: ['Soil moisture probe depth reading at 15cm'],
      recommended_verification_actions: [
        'Irrigate in early morning or evening hours to lower soil thermal stress.',
        'Inspect squares for bollworm boll entrance holes to rule out pest shedding.'
      ],
      farmer_whatsapp_summary: '☀️ *AgriGuard Advisory*: Severe thermal heat stress (39.4°C) detected. Flower squares may shed due to heat. Irrigate early in the morning and avoid daytime chemical sprays.'
    };
    store.assessments.unshift(asmt);
    store.alerts.unshift({
      id: 'alt_demo_' + Date.now(),
      assessment_id: asmt.id,
      farmer_id: asmt.farmer_id,
      farmer_name: asmt.farmer_name,
      phone_number: asmt.phone_number,
      crop_type: asmt.crop_type,
      field_location: asmt.location,
      alert_title: 'DEMO ALERT: Cotton Severe Thermal & Moisture Stress',
      is_demo: true,
      is_sample: true,
      data_source: 'sample_demonstration',
      severity: 'HIGH',
      status: 'Pending',
      triggered_at: now,
      reviewer_notes: 'Simulated thermal peak scenario.',
      reviewed_by: null,
      reviewed_at: null
    });
    store.field_reports.unshift({
      id: 'frpt_demo_heat_' + Date.now(),
      field_id: 'field_004',
      farmer_id: 'farmer_003',
      phone_number: '919848012345',
      is_demo: true,
      is_sample: true,
      data_source: 'sample_demonstration',
      report_type: 'farmer_text_inquiry',
      description: 'DEMO: Afternoon canopy wilting and squares dropping off plants during 39.4°C heat wave',
      media_reference: null,
      analysis_status: 'completed',
      analysis_result: {
        visible_symptoms: ['Midday physiological canopy wilting', 'Flower square shedding'],
        image_quality: 'not_applicable',
        possible_explanations: ['Thermal heat shock and pollen desiccation (Abiotic factor)'],
        missing_evidence: ['Soil moisture probe depth measurement'],
        field_verification_recommended: true,
        non_definitive_statement: 'This evaluation is a preliminary environmental risk assessment and does not constitute a definitive agronomic diagnosis.'
      },
      captured_at: now,
      created_at: now
    });
  }

  writeStore(store);
  return true;
}

module.exports = {
  getStats,
  getFarmers,
  getFarmerByPhone,
  saveFarmer,
  getFields,
  getFieldById,
  saveField,
  getFieldReports,
  saveFieldReport,
  getAssessments,
  saveAssessment,
  updateAssessment,
  getAlerts,
  updateAlertStatus,
  injectDemoScenario,
  getOnboardingState,
  setOnboardingState,
  clearOnboardingState,
  getPendingIntake,
  setPendingIntake,
  clearPendingIntake,
  saveMessage,
  getMessages,
  isMessageProcessed,
  markMessageProcessed,
  clearAllData
};
