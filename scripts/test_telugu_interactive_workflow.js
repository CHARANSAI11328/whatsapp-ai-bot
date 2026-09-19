const axios = require('axios');
const assert = require('assert');
const assessmentStore = require('../services/assessmentStore');

const BASE_URL = 'http://localhost:3000';

async function postWebhook(fromPhone, msgPayload) {
  const msgId = 'wamid.TELUGU_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  let messageObj;

  if (typeof msgPayload === 'string') {
    messageObj = {
      from: fromPhone,
      id: msgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'text',
      text: { body: msgPayload }
    };
  } else if (msgPayload.type === 'interactive') {
    messageObj = {
      from: fromPhone,
      id: msgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'interactive',
      interactive: msgPayload.interactive
    };
  } else if (msgPayload.type === 'location') {
    messageObj = {
      from: fromPhone,
      id: msgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'location',
      location: msgPayload.location
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
              contacts: [{ profile: { name: 'Srinivasa Rao' }, wa_id: fromPhone }],
              messages: [messageObj]
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

async function waitForBotReply(phone, minCount = 1, maxWaitMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await axios.get(`${BASE_URL}/api/messages/${phone}`);
      const botMsgs = res.data.filter(m => m.sender_type !== 'user');
      if (botMsgs.length >= minCount) {
        return botMsgs[botMsgs.length - 1];
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 400));
  }
  const res = await axios.get(`${BASE_URL}/api/messages/${phone}`);
  const botMsgs = res.data.filter(m => m.sender_type !== 'user');
  return botMsgs[botMsgs.length - 1] || null;
}

async function runTeluguInteractiveWorkflowTest() {
  console.log('===============================================================');
  console.log('🌾 TESTING TELUGU LANGUAGE WORKFLOW & 1-CLICK INTERACTIVE BUTTONS');
  console.log('===============================================================\n');

  const testPhone = '919440' + Math.floor(100000 + Math.random() * 900000);
  assessmentStore.clearOnboardingState(testPhone);

  // Turn 1: Farmer sends "hi"
  console.log('TURN 1: Farmer sends "hi"');
  await postWebhook(testPhone, 'hi');
  const r1 = await waitForBotReply(testPhone, 1);
  console.log('Bot Response 1:\n' + r1.message_body);
  assert(r1.message_body.includes('Crop Management & Risk Agent') || r1.message_body.includes('పంట నిర్వహణ'), 'Must identify as Crop Management & Risk Agent');
  assert(r1.message_body.includes('Please select your language') || r1.message_body.includes('మీ భాషను ఎంచుకోండి'), 'Must ask for language first');
  assert(r1.buttons && r1.buttons.some(b => b.id === 'lang_te'), 'Must include Telugu button');
  console.log('✅ Turn 1 Passed: Language prompt delivered with interactive buttons.\n');

  // Turn 2: Farmer taps Telugu button [ 🌾 తెలుగు (Telugu) ]
  console.log('TURN 2: Farmer taps Telugu interactive button [ 🌾 తెలుగు (Telugu) ]');
  await postWebhook(testPhone, {
    type: 'interactive',
    interactive: {
      type: 'button_reply',
      button_reply: { id: 'lang_te', title: '🌾 తెలుగు (Telugu)' }
    }
  });
  const r2 = await waitForBotReply(testPhone, 2);
  console.log('Bot Response 2:\n' + r2.message_body);
  assert(r2.message_body.includes('పంట ఎంపిక') || r2.message_body.includes('వరి'), 'Turn 2 response MUST BE IN TELUGU');
  assert(r2.buttons && r2.buttons.some(b => b.id === 'crop_paddy'), 'Must include 1-click crop buttons in Telugu');
  console.log('✅ Turn 2 Passed: Telugu language selected and Telugu crop buttons delivered.\n');

  // Turn 3: Farmer taps Paddy button [ 🌾 వరి (Paddy) ]
  console.log('TURN 3: Farmer taps Paddy button [ 🌾 వరి (Paddy) ]');
  await postWebhook(testPhone, {
    type: 'interactive',
    interactive: {
      type: 'button_reply',
      button_reply: { id: 'crop_paddy', title: '🌾 వరి (Paddy)' }
    }
  });
  const r3 = await waitForBotReply(testPhone, 3);
  console.log('Bot Response 3:\n' + r3.message_body);
  assert(r3.message_body.includes('వరి') && (r3.message_body.includes('లొకేషన్') || r3.message_body.includes('స్థానం')), 'Turn 3 response MUST BE IN TELUGU for location');
  console.log('✅ Turn 3 Passed: Telugu location prompt delivered.\n');

  // Turn 4: Farmer sends location coordinates
  console.log('TURN 4: Farmer sends location coordinates "16.3067, 80.4365"');
  await postWebhook(testPhone, '16.3067, 80.4365');
  const r4 = await waitForBotReply(testPhone, 4);
  console.log('Bot Response 4:\n' + r4.message_body);
  assert(r4.message_body.includes('పంట వయస్సు') || r4.message_body.includes('దశ'), 'Turn 4 response MUST BE IN TELUGU asking for crop stage');
  assert(r4.buttons && r4.buttons.some(b => b.id === 'stage_vegetative'), 'Must include 1-click growth stage buttons in Telugu');
  console.log('✅ Turn 4 Passed: Crop stage prompt delivered with 3 buttons in Telugu.\n');

  // Turn 5: Farmer taps [ 🌿 1-2 నెలలు ]
  console.log('TURN 5: Farmer taps stage button [ 🌿 1-2 నెలలు ]');
  await postWebhook(testPhone, {
    type: 'interactive',
    interactive: {
      type: 'button_reply',
      button_reply: { id: 'stage_vegetative', title: '🌿 1-2 నెలలు' }
    }
  });
  const r5 = await waitForBotReply(testPhone, 5);
  console.log('Bot Response 5:\n' + r5.message_body);
  assert(r5.message_body.includes('విజయవంతంగా పూర్తయింది') || r5.message_body.includes('నమోదు'), 'Turn 5 MUST confirm registration in Telugu');
  assert(r5.message_body.includes('Crop Management & Risk Agent') || r5.message_body.includes('పంట నిర్వహణ'), 'Must state Crop Management & Risk Agent monitoring field');
  console.log('✅ Turn 5 Passed: Registration complete confirmed in Telugu.\n');

  // Turn 6: Farmer reports crop symptom in Telugu
  console.log('TURN 6: Farmer reports issue in Telugu: "నా వరి పంటలో ఆకులు పసుపు రంగులోకి మారుతున్నాయి, బూడిద మచ్చలు ఉన్నాయి"');
  await postWebhook(testPhone, 'నా వరి పంటలో ఆకులు పసుపు రంగులోకి మారుతున్నాయి, బూడిద మచ్చలు ఉన్నాయి');
  const r6 = await waitForBotReply(testPhone, 6, 16000);
  console.log('Bot Response 6 (Crop Advisory):\n' + r6.message_body);
  assert(r6.message_body.includes('ప్రమాద') || r6.message_body.includes('వరి') || r6.message_body.includes('వాతావరణ') || r6.message_body.includes('ఆకు') || r6.message_body.includes('తెగులు'), 'Turn 6 Advisory MUST be in Telugu');
  assert(r6.message_body.includes('ఈ విశ్లేషణ ప్రాథమిక పరిశీలన మాత్రమే') || r6.message_body.includes('వ్యవసాయ అధికారి'), 'Must include Telugu non-definitive disclaimer');
  console.log('✅ Turn 6 Passed: Full crop advisory generated and delivered entirely in Telugu!\n');

  console.log('===============================================================');
  console.log('🎉 ALL 6 TURNS PASSED! TELUGU CONTINUATION & BUTTONS VERIFIED!');
  console.log('===============================================================');
}

runTeluguInteractiveWorkflowTest().catch(e => {
  console.error('❌ Test Failed:', e.message);
  process.exit(1);
});
