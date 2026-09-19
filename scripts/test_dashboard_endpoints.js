/**
 * AgriGuard AI — Operations Center Dashboard Endpoints Test Suite
 * 
 * Verifies all 6 required sections and endpoints for Prompt 7:
 * 1. Overview KPIs (/api/agri/stats)
 * 2. Farmers & Fields (/api/agri/farmers, /api/agri/fields)
 * 3. Incoming Reports (/api/agri/field-reports)
 * 4. Crop Assessments (/api/agri/assessments)
 * 5. Alert Review & Status Updater (/api/agri/alerts, /api/agri/alerts/:id/status)
 * 6. System Health Telemetry (/api/agri/system-health)
 * 7. Demo Simulation (/api/agri/demo/simulate)
 * 8. HTML Brand & Title Check (GET /)
 */

const axios = require('axios');
const assert = require('assert');

const BASE_URL = 'http://localhost:3000';

async function runDashboardTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING AGRIGUARD AI OPERATIONS CENTER DASHBOARD TEST SUITE');
  console.log('===============================================================\n');

  let passed = 0;

  // 1. Check HTML Brand & Title
  console.log('Test 1: Operations Center HTML Brand & Title...');
  const htmlRes = await axios.get(`${BASE_URL}/`, {
    headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
  });
  assert.strictEqual(htmlRes.status, 200);
  assert(htmlRes.data.includes('AgriGuard AI — Operations Center'), 'HTML must have Operations Center title');
  assert(htmlRes.data.includes('Hackathon Live Presentation Flow'), 'HTML must include presentation flow stepper');
  console.log('✅ Test 1 Passed: Operations Center HTML & branding confirmed.\n');
  passed++;

  // 2. Check Overview Stats
  console.log('Test 2: Overview KPIs & Health (/api/agri/stats)...');
  const statsRes = await axios.get(`${BASE_URL}/api/agri/stats`);
  assert.strictEqual(statsRes.status, 200);
  const stats = statsRes.data;
  assert(typeof stats.totalFarmers === 'number', 'totalFarmers must be a number');
  assert(typeof stats.registeredFields === 'number', 'registeredFields must be a number');
  assert(typeof stats.reportsReceived === 'number', 'reportsReceived must be a number');
  assert(typeof stats.assessmentsCompleted === 'number', 'assessmentsCompleted must be a number');
  assert(typeof stats.assessmentsRequiringReview === 'number', 'assessmentsRequiringReview must be a number');
  assert(stats.health.weatherApi, 'weatherApi health must be present');
  assert(stats.health.satellite, 'satellite health must be present');
  console.log('   Stats:', {
    totalFarmers: stats.totalFarmers,
    registeredFields: stats.registeredFields,
    reportsReceived: stats.reportsReceived,
    assessmentsCompleted: stats.assessmentsCompleted,
    assessmentsRequiringReview: stats.assessmentsRequiringReview,
    activeAlerts: stats.activeAlerts
  });
  console.log('✅ Test 2 Passed: Overview statistics & API health confirmed.\n');
  passed++;

  // 3. Check Farmers & Fields Directory
  console.log('Test 3: Farmers & Fields Directory (/api/agri/farmers, /api/agri/fields)...');
  const farmersRes = await axios.get(`${BASE_URL}/api/agri/farmers`);
  const fieldsRes = await axios.get(`${BASE_URL}/api/agri/fields`);
  assert(farmersRes.data.length > 0, 'Farmers list must not be empty');
  assert(fieldsRes.data.length > 0, 'Fields list must not be empty');
  const sampleField = fieldsRes.data[0];
  assert(sampleField.id && sampleField.crop_type, 'Field must have id and crop_type');
  console.log(`   Farmers found: ${farmersRes.data.length}, Fields found: ${fieldsRes.data.length}`);
  console.log('✅ Test 3 Passed: Farmers and fields directories verified.\n');
  passed++;

  // 4. Check Incoming Reports
  console.log('Test 4: Incoming Reports & Media Submissions (/api/agri/field-reports)...');
  const reportsRes = await axios.get(`${BASE_URL}/api/agri/field-reports`);
  assert(Array.isArray(reportsRes.data), 'Field reports must be an array');
  assert(reportsRes.data.length > 0, 'Reports must be present');
  const hasPhoto = reportsRes.data.some(r => r.report_type === 'visual_photo');
  const hasVideo = reportsRes.data.some(r => r.report_type === 'crop_video');
  assert(hasPhoto, 'Must contain visual photo report');
  assert(hasVideo, 'Must contain crop video report');
  console.log(`   Total incoming reports: ${reportsRes.data.length} (Photo & Video verified)`);
  console.log('✅ Test 4 Passed: Incoming reports and media submissions verified.\n');
  passed++;

  // 5. Check Crop Assessments
  console.log('Test 5: Crop Assessments & Diagnostic Evidence (/api/agri/assessments)...');
  const asmtRes = await axios.get(`${BASE_URL}/api/agri/assessments`);
  assert(asmtRes.data.length > 0, 'Assessments must be present');
  const sampleAsmt = asmtRes.data[0];
  assert(sampleAsmt.risk_level, 'Risk level must be present');
  assert(sampleAsmt.confidence_score !== undefined, 'Confidence score must be present');
  assert(sampleAsmt.disease_hypotheses, 'Disease hypotheses must be present');
  console.log(`   Assessments found: ${asmtRes.data.length}, Sample Risk: ${sampleAsmt.risk_level}`);
  console.log('✅ Test 5 Passed: Crop assessments verified.\n');
  passed++;

  // 6. Check Alerts & Review Workflow
  console.log('Test 6: Alerts & Officer Review Queue (/api/agri/alerts)...');
  const alertsRes = await axios.get(`${BASE_URL}/api/agri/alerts`);
  assert(alertsRes.data.length > 0, 'Alerts queue must not be empty');
  const alertItem = alertsRes.data[0];
  console.log('   Sample Alert:', {
    id: alertItem.id,
    title: alertItem.alert_title,
    severity: alertItem.severity,
    status: alertItem.status
  });

  // Test updating alert status
  const updateRes = await axios.post(`${BASE_URL}/api/agri/alerts/${alertItem.id}/status`, {
    status: 'Verified',
    reviewerNotes: 'Verified foliar blast lesions on 10 sampled plants',
    reviewerName: 'Regional Extension Officer'
  });
  assert.strictEqual(updateRes.data.success, true);
  assert.strictEqual(updateRes.data.alert.status, 'Verified');
  console.log('✅ Test 6 Passed: Alerts review queue & status updating verified.\n');
  passed++;

  // 7. Check System Health Endpoint
  console.log('Test 7: Detailed System Health Telemetry (/api/agri/system-health)...');
  const healthRes = await axios.get(`${BASE_URL}/api/agri/system-health`);
  assert.strictEqual(healthRes.status, 200);
  const health = healthRes.data;
  assert(health.services.meta_whatsapp, 'WhatsApp status required');
  assert(health.services.supabase_postgresql, 'Supabase status required');
  assert(health.services.gemini_vision, 'Gemini vision status required');
  assert(health.services.open_meteo_weather, 'Open-Meteo weather status required');
  assert(health.services.sentinel_2_satellite, 'Sentinel-2 status required');
  assert(health.last_successful_retrieval, 'Last retrieval timestamp required');
  console.log('   Live Services:', Object.keys(health.services).map(k => `${k}: ${health.services[k].status}`).join(' | '));
  console.log('✅ Test 7 Passed: Detailed system health telemetry verified.\n');
  passed++;

  // 8. Test Demo Scenario Injection
  console.log('Test 8: Demo Simulator Injection (/api/agri/demo/simulate)...');
  const simRes = await axios.post(`${BASE_URL}/api/agri/demo/simulate`, { scenario: 'paddy_blast' });
  assert.strictEqual(simRes.data.success, true);
  console.log('   Simulation Result:', simRes.data.message);
  console.log('✅ Test 8 Passed: Demo simulation injection verified.\n');
  passed++;

  console.log('===============================================================');
  console.log(`🎉 ALL ${passed}/8 OPERATIONS CENTER TESTS PASSED!`);
  console.log('===============================================================');
}

runDashboardTests().catch(err => {
  console.error('❌ Operations Center test failed:', err);
  process.exit(1);
});
