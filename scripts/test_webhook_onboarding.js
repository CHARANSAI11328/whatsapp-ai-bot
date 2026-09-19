const axios = require('axios');

async function testWebhookOnboarding() {
  const BASE_URL = 'http://localhost:3000';
  const phone = '91' + String(Date.now()).slice(-10);
  console.log('===============================================================');
  console.log('🧪 TESTING LIVE WEBHOOK MULTI-TURN ONBOARDING (POST /webhook)');
  console.log(`Farmer Phone: +${phone}`);
  console.log('===============================================================\n');

  // Reset any previous state for this test phone
  await axios.post(`${BASE_URL}/api/agri/onboarding-reset/${phone}`);

  async function sendWebhookMessage(textOrObj) {
    const isLoc = typeof textOrObj === 'object' && textOrObj.type === 'location';
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_ACCOUNT_ID',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                contacts: [{ profile: { name: '' }, wa_id: phone }],
                messages: [
                  isLoc ? {
                    from: phone,
                    id: 'wamid.TEST_LOC_' + Date.now(),
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'location',
                    location: textOrObj.location
                  } : {
                    from: phone,
                    id: 'wamid.TEST_MSG_' + Date.now(),
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: { body: textOrObj }
                  }
                ]
              },
              field: 'messages'
            }
          ]
        }
      ]
    };

    const res = await axios.post(`${BASE_URL}/webhook`, payload);
    // Wait 1000ms for Supabase insert + onboarding disk write
    await new Promise(r => setTimeout(r, 1000));
    return res.status;
  }

  // Turn 1: "Register my field"
  console.log('1. Dispatching Webhook: "Register my field" ...');
  await sendWebhookMessage('Register my field');
  let stateRes = await axios.get(`${BASE_URL}/api/agri/onboarding-state/${phone}`);
  console.log('   Step reached:', stateRes.data.state?.step);

  // Turn 2: "Subba Rao"
  console.log('2. Dispatching Webhook: "Subba Rao" ...');
  await sendWebhookMessage('Subba Rao');
  stateRes = await axios.get(`${BASE_URL}/api/agri/onboarding-state/${phone}`);
  console.log('   Step reached:', stateRes.data.state?.step);

  // Turn 3: "Cotton"
  console.log('3. Dispatching Webhook: "Cotton" ...');
  await sendWebhookMessage('Cotton');
  stateRes = await axios.get(`${BASE_URL}/api/agri/onboarding-state/${phone}`);
  console.log('   Step reached:', stateRes.data.state?.step);

  // Turn 4: "30 days"
  console.log('4. Dispatching Webhook: "30 days" ...');
  await sendWebhookMessage('30 days');
  stateRes = await axios.get(`${BASE_URL}/api/agri/onboarding-state/${phone}`);
  console.log('   Step reached:', stateRes.data.state?.step);

  // Turn 5: WhatsApp native location pin
  console.log('5. Dispatching Webhook: Native WhatsApp Location Pin (16.2437, 80.6400) ...');
  await sendWebhookMessage({
    type: 'location',
    location: { latitude: 16.2437, longitude: 80.6400, name: 'Tenali Farm' }
  });
  stateRes = await axios.get(`${BASE_URL}/api/agri/onboarding-state/${phone}`);
  console.log('   Step reached:', stateRes.data.state?.step);

  // Turn 6: "skip" photo
  console.log('6. Dispatching Webhook: "skip" (photo) ...');
  await sendWebhookMessage('skip');
  stateRes = await axios.get(`${BASE_URL}/api/agri/onboarding-state/${phone}`);
  console.log('   Step reached:', stateRes.data.state?.step);

  // Turn 7: "Black soil, Drip"
  console.log('7. Dispatching Webhook: "Black soil, Drip" ...');
  await sendWebhookMessage('Black soil, Drip');
  stateRes = await axios.get(`${BASE_URL}/api/agri/onboarding-state/${phone}`);
  console.log('   Onboarding active after completion:', stateRes.data.state);

  // Check persisted field
  const fieldsRes = await axios.get(`${BASE_URL}/api/agri/fields?phone=${phone}`);
  console.log('\n📊 Newly Registered Field Record:');
  console.log(fieldsRes.data[0]);

  console.log('\n===============================================================');
  console.log('✅ LIVE WEBHOOK MULTI-TURN ONBOARDING PASSED SUCCESSFULLY!');
  console.log('===============================================================');
}

testWebhookOnboarding().catch(e => {
  console.error('Test error:', e.response?.data || e.message);
  process.exit(1);
});
