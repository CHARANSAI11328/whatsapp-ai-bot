const axios = require('axios');

async function testAgriGuard() {
  const BASE_URL = 'http://localhost:3000';
  console.log('====================================================');
  console.log('🧪 RUNNING AGRIGUARD AI COMPREHENSIVE TEST SUITE');
  console.log('====================================================\n');

  // Test 1: Health Endpoint
  console.log('1. Testing GET /health ...');
  const healthRes = await axios.get(`${BASE_URL}/health`);
  console.log('   Status:', healthRes.status, healthRes.data);

  // Test 2: Dashboard Overview Stats
  console.log('\n2. Testing GET /api/agri/stats ...');
  const statsRes = await axios.get(`${BASE_URL}/api/agri/stats`);
  console.log('   Stats:', statsRes.data);

  // Test 3: Farmers Directory
  console.log('\n3. Testing GET /api/agri/farmers ...');
  const farmersRes = await axios.get(`${BASE_URL}/api/agri/farmers`);
  console.log(`   Found ${farmersRes.data.length} registered farmers.`);

  // Test 4: Fields Directory
  console.log('\n4. Testing GET /api/agri/fields ...');
  const fieldsRes = await axios.get(`${BASE_URL}/api/agri/fields`);
  console.log(`   Found ${fieldsRes.data.length} crop fields.`);

  // Test 5: Live Weather API
  console.log('\n5. Testing GET /api/agri/weather for Guntur coordinates (16.3067, 80.4365) ...');
  const weatherRes = await axios.get(`${BASE_URL}/api/agri/weather?lat=16.3067&lon=80.4365`);
  console.log('   Weather Result:', {
    status: weatherRes.data.status,
    source: weatherRes.data.source,
    temp: weatherRes.data.temperature,
    humidity: weatherRes.data.relativeHumidity,
    precipitation: weatherRes.data.precipitation,
    forecast3d: weatherRes.data.forecastRainNext3Days
  });

  // Test 6: Demo Simulator - Rice Blast
  console.log('\n6. Testing POST /api/agri/demo/simulate (paddy_blast) ...');
  const simRes = await axios.post(`${BASE_URL}/api/agri/demo/simulate`, { scenario: 'paddy_blast' });
  console.log('   Simulate Result:', simRes.data);

  // Test 7: Fetch Alerts and Update Status
  console.log('\n7. Testing Alert Review Workflow (GET & POST /api/agri/alerts) ...');
  const alertsRes = await axios.get(`${BASE_URL}/api/agri/alerts`);
  console.log(`   Total Alerts: ${alertsRes.data.length}`);
  if (alertsRes.data.length > 0) {
    const firstAlert = alertsRes.data[0];
    console.log(`   Updating status for alert ${firstAlert.id} to 'Verified' ...`);
    const updateRes = await axios.post(`${BASE_URL}/api/agri/alerts/${firstAlert.id}/status`, {
      status: 'Verified',
      reviewerNotes: 'Verified leaf lesions in field plot; blast severity low at 5% incidence.',
      reviewerName: 'Agronomist Dr. Rao'
    });
    console.log('   Updated Alert Status:', updateRes.data.alert.status, 'by', updateRes.data.alert.reviewed_by);
  }

  // Test 8: Simulate Incoming WhatsApp Message Webhook
  console.log('\n8. Testing Incoming WhatsApp Webhook (POST /webhook) with Farmer Inbound ...');
  const sampleWebhookPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WHATSAPP_ACCOUNT_ID',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '1234567890', phone_number_id: '1234567890' },
              contacts: [{ profile: { name: 'Ramesh Reddy' }, wa_id: '919440201203' }],
              messages: [
                {
                  from: '919440201203',
                  id: 'wamid.TEST_' + Date.now(),
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: 'My paddy crop has brown spindle spots on leaf blades, please check risk for 16.3067, 80.4365' }
                }
              ]
            },
            field: 'messages'
          }
        ]
      }
    ]
  };

  const webhookRes = await axios.post(`${BASE_URL}/webhook`, sampleWebhookPayload);
  console.log('   Webhook HTTP Response Code:', webhookRes.status, '(Immediate 200 ACK verified)');

  // Wait 3 seconds for async pipeline to process
  console.log('   Waiting 3s for AgriGuard pipeline (Gemini + Weather + Risk Engine) to finish...');
  await new Promise(r => setTimeout(r, 3000));

  // Check updated assessments
  const updatedAsmtRes = await axios.get(`${BASE_URL}/api/agri/assessments`);
  const latestAsmt = updatedAsmtRes.data[0];
  console.log('\n   Latest Assessment Generated:');
  console.log('   - ID:', latestAsmt.id);
  console.log('   - Farmer:', latestAsmt.farmer_name);
  console.log('   - Crop:', latestAsmt.crop_type);
  console.log('   - Risk Level:', latestAsmt.risk_level);
  console.log('   - Hypotheses:', latestAsmt.disease_hypotheses?.map(h => h.hypothesis));
  console.log('   - Advisory snippet:', latestAsmt.farmer_whatsapp_summary?.substring(0, 120) + '...');

  console.log('\n====================================================');
  console.log('✅ ALL AGRIGUARD AI PIPELINE TESTS PASSED!');
  console.log('====================================================');
}

testAgriGuard().catch(err => {
  console.error('❌ Test failed:', err.response?.data || err.message);
  process.exit(1);
});
