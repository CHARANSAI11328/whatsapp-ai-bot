const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Helper to simulate incoming Meta WhatsApp webhook payload
async function dispatchWebhook(fromPhone, msgObj, messageId = null) {
  const msgId = messageId || ('wamid.PROMPT8_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
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
  } else if (msgObj.type === 'video') {
    messagePayload = {
      from: fromPhone,
      id: msgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'video',
      video: msgObj.video
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
              contacts: [{ profile: { name: 'Test Farmer' }, wa_id: fromPhone }],
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

// Helper to reliably wait for outbound bot response (handling network roundtrip to Meta)
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

async function runPrompt8Tests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING PROMPT 8: WHATSAPP TO AGRIGUARD AI PIPELINE TEST');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 8;

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Minimal WhatsApp Onboarding Flow (Prompt 8 Example)
  // ─────────────────────────────────────────────────────────────
  console.log('▶ TEST 1: Minimal WhatsApp Registration Flow...');
  const phone1 = '9198' + String(Date.now()).slice(-8);

  // Turn 1: "I want to register my field"
  console.log('   [Turn 1] Sending: "I want to register my field"');
  await dispatchWebhook(phone1, 'I want to register my field');
  let reply1 = await waitForBotReply(phone1, 1);
  console.log('   Turn 1 Response:', reply1.slice(0, 70));
  if (!reply1.includes('Welcome to AgriGuard AI. Which crop are you growing?')) {
    throw new Error('Turn 1 did not ask "Welcome to AgriGuard AI. Which crop are you growing?"');
  }

  // Turn 2: "Paddy"
  console.log('   [Turn 2] Sending: "Paddy"');
  await dispatchWebhook(phone1, 'Paddy');
  let reply2 = await waitForBotReply(phone1, 2);
  console.log('   Turn 2 Response:', reply2.slice(0, 70));
  if (!reply2.includes('Paddy') || (!reply2.includes('location') && !reply2.includes('Location'))) {
    throw new Error('Turn 2 did not acknowledge Paddy and request location');
  }

  // Turn 3: Send coordinates
  console.log('   [Turn 3] Sending: Location Pin (16.3067, 80.4365)');
  await dispatchWebhook(phone1, {
    type: 'location',
    location: { latitude: 16.3067, longitude: 80.4365, name: 'Guntur Farm' }
  });
  let reply3 = await waitForBotReply(phone1, 3);
  console.log('   Turn 3 Response:', reply3.slice(0, 70));
  if (!reply3.includes('Location') && !reply3.includes('sown') && !reply3.includes('stage')) {
    throw new Error('Turn 3 did not acknowledge location and request sowing date');
  }

  // Turn 4: "Tillering stage"
  console.log('   [Turn 4] Sending: "Tillering stage"');
  await dispatchWebhook(phone1, 'Tillering stage');
  let reply4 = await waitForBotReply(phone1, 4);
  console.log('   Turn 4 Response:', reply4.slice(0, 70));
  if (!reply4.includes('Field Registration Complete') || !reply4.includes('Paddy')) {
    throw new Error('Turn 4 did not complete registration');
  }

  // Verify field in database
  const fields1 = (await axios.get(`${BASE_URL}/api/agri/fields?phone=${phone1}`)).data;
  if (fields1.length === 0 || fields1[0].crop_name !== 'Paddy') {
    throw new Error('Field was not persisted correctly in fields API');
  }
  console.log('   Field persisted:', fields1[0].id, fields1[0].crop_name, fields1[0].latitude, fields1[0].longitude);
  console.log('✅ TEST 1 PASSED: Minimal Registration Flow Succeeded\n');
  passed++;

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Crop Symptom Report Intake (Prompt 8 Example 2)
  // ─────────────────────────────────────────────────────────────
  console.log('▶ TEST 2: Crop Symptom Report Intake...');
  const phone2 = '9197' + String(Date.now()).slice(-8);

  // Farmer sends symptom statement without location or photo
  console.log('   Sending: "My paddy field is showing yellow leaves."');
  await dispatchWebhook(phone2, 'My paddy field is showing yellow leaves.');
  const symptomReply = await waitForBotReply(phone2, 1);

  const expectedIntake = 'Thanks for reporting this. I need a few details to assess the situation. Please share your field location and, if possible, a clear photo of the affected leaves.';
  console.log('   Bot Response:', symptomReply);
  if (!symptomReply.includes(expectedIntake)) {
    throw new Error(`Expected intake prompt "${expectedIntake}" but got "${symptomReply}"`);
  }

  // Verify pending assessment created
  const asmts2 = (await axios.get(`${BASE_URL}/api/agri/assessments`)).data;
  const pendingAsmt = asmts2.find(a => a.phone_number === phone2);
  if (!pendingAsmt) throw new Error('Pending assessment record was not created for phone ' + phone2);
  if (pendingAsmt.risk_level !== 'INSUFFICIENT_EVIDENCE') throw new Error('Expected risk_level INSUFFICIENT_EVIDENCE');
  console.log('   Pending Assessment Record Created:', pendingAsmt.id, pendingAsmt.risk_level, pendingAsmt.status);
  console.log('✅ TEST 2 PASSED: Symptom Intake Recorded & Evidence Requested\n');
  passed++;

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Insufficient Evidence Resolution (Prompt 8 Example 3)
  // ─────────────────────────────────────────────────────────────
  console.log('▶ TEST 3: Insufficient Evidence Transparent Response...');
  // Farmer sends location pin but NO leaf photo (benign weather condition)
  console.log('   Sending: "16.2437, 80.6400"');
  await dispatchWebhook(phone2, '16.2437, 80.6400');
  const insuffReply = await waitForBotReply(phone2, 2);

  console.log('   Bot Advisory Response:', insuffReply.slice(0, 150) + '...');
  const expectedInsuff1 = 'I could not confirm a specific crop disease from the available information.';
  const expectedInsuff2 = 'Some conditions may increase crop stress risk, but more evidence is needed.';
  if (!insuffReply.includes(expectedInsuff1) || !insuffReply.includes(expectedInsuff2)) {
    throw new Error('Response did not contain required Insufficient Evidence wording');
  }

  // Verify non-definitive disclaimer included
  if (!insuffReply.includes('definitive') && !insuffReply.includes('provisional')) {
    throw new Error('Response missing non-definitive diagnosis disclaimer');
  }
  console.log('✅ TEST 3 PASSED: Insufficient Evidence Handled Transparently\n');
  passed++;

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Message Deduplication
  // ─────────────────────────────────────────────────────────────
  console.log('▶ TEST 4: Deduplication of Duplicate Webhook Deliveries...');
  const phone4 = '9196' + String(Date.now()).slice(-8);
  const fixedMsgId = 'wamid.DEDUPE_TEST_' + Date.now();

  await dispatchWebhook(phone4, 'Register my field', fixedMsgId);
  await waitForBotReply(phone4, 1);
  const msgsAfterFirst = (await axios.get(`${BASE_URL}/api/messages/${phone4}`)).data;
  const countAfterFirst = msgsAfterFirst.length;

  // Re-dispatch exact same message ID
  await dispatchWebhook(phone4, 'Register my field', fixedMsgId);
  await new Promise(r => setTimeout(r, 1200));
  const msgsAfterSecond = (await axios.get(`${BASE_URL}/api/messages/${phone4}`)).data;
  const countAfterSecond = msgsAfterSecond.length;

  console.log(`   First dispatch message count: ${countAfterFirst}, Second dispatch message count: ${countAfterSecond}`);
  if (countAfterFirst !== countAfterSecond) {
    throw new Error(`Deduplication failed! Message count increased from ${countAfterFirst} to ${countAfterSecond}`);
  }
  console.log('✅ TEST 4 PASSED: Duplicate Webhook Message Safely Dropped\n');
  passed++;

  // ─────────────────────────────────────────────────────────────
  // TEST 5: Fallback on AI/Gemini Failure
  // ─────────────────────────────────────────────────────────────
  console.log('▶ TEST 5: Deterministic Fallback on Gemini Error...');
  const { explanationAgent } = require('../services/riskEngine');
  const mockAssessment = {
    risk_category: 'insufficient_evidence',
    assessment_scope: 'crop_stress',
    missing_information: ['Clear photo of leaf foliage'],
    recommended_next_action: ['Check underside of leaves for spores.'],
    disclaimer: 'Provisional screening only.'
  };

  // When ai is null, explanationAgent must return safe formatted text
  const fallbackText = await explanationAgent(null, 'gemini-3.1-flash-lite', mockAssessment, {});
  console.log('   Fallback Output Snippet:', fallbackText.slice(0, 100) + '...');
  if (!fallbackText.includes('I could not confirm a specific crop disease')) {
    throw new Error('Fallback did not produce expected insufficient evidence text');
  }
  console.log('✅ TEST 5 PASSED: Deterministic Fallback Resilient to AI Outage\n');
  passed++;

  // ─────────────────────────────────────────────────────────────
  // TEST 6: Weather Service Graceful Failure Handling
  // ─────────────────────────────────────────────────────────────
  console.log('▶ TEST 6: Weather Service Graceful Failure Pathway...');
  const weatherService = require('../services/weatherService');
  // Query with out-of-bounds coordinates to trigger unavailable pathway
  const invalidWeather = await weatherService.getLiveWeatherData(999.0, 999.0);
  console.log('   Unavailable Weather Status:', invalidWeather.data_quality?.status);
  if (invalidWeather.data_quality?.status !== 'unavailable') {
    throw new Error('Weather service did not return unavailable for invalid coordinates');
  }
  console.log('✅ TEST 6 PASSED: Weather Failures Handled Without Fabricating Data\n');
  passed++;

  // ─────────────────────────────────────────────────────────────
  // TEST 7: Video Preview Pathway (Preview Only, Zero Fabrication)
  // ─────────────────────────────────────────────────────────────
  console.log('▶ TEST 7: Crop Video Preview Pathway...');
  const phone7 = '9195' + String(Date.now()).slice(-8);
  await dispatchWebhook(phone7, {
    type: 'video',
    video: { id: 'vid_test_123', mime_type: 'video/mp4', caption: 'Leaf closeup video' }
  });
  const videoReply = await waitForBotReply(phone7, 1);
  console.log('   Video Response:', videoReply.slice(0, 80) + '...');
  if (!videoReply.includes('preview mode') || !videoReply.includes('photo')) {
    throw new Error('Video response did not inform farmer of preview mode and request photos');
  }
  console.log('✅ TEST 7 PASSED: Video Preview Pathway Safely Prompts for Photos\n');
  passed++;

  // ─────────────────────────────────────────────────────────────
  // TEST 8: Dashboard APIs & Message History Verification
  // ─────────────────────────────────────────────────────────────
  console.log('▶ TEST 8: Operations Center Dashboard Sync...');
  const stats = (await axios.get(`${BASE_URL}/api/agri/stats`)).data;
  const assessments = (await axios.get(`${BASE_URL}/api/agri/assessments`)).data;
  const allMessages = (await axios.get(`${BASE_URL}/api/messages`)).data;

  console.log('   Total Farmers in Store:', stats.totalFarmers);
  console.log('   Registered Fields:', stats.registeredFields);
  console.log('   Assessments Completed:', stats.assessmentsCompleted);
  console.log('   Active Message Threads:', allMessages.length);

  if (stats.totalFarmers < 1 || stats.registeredFields < 1 || assessments.length < 1) {
    throw new Error('Dashboard stats reflect incomplete data');
  }
  console.log('✅ TEST 8 PASSED: All Pipeline Events Visible in Operations Center\n');
  passed++;

  console.log('===============================================================');
  console.log(`🎉 ALL ${passed}/${total} PROMPT 8 TESTS PASSED!`);
  console.log('===============================================================');
}

runPrompt8Tests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err.message);
  process.exit(1);
});
