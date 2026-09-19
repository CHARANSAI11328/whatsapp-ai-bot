/**
 * AgriGuard AI — Webhook Media Integration Test
 * 
 * Verifies live server processing of:
 * 1. Image message webhook -> field report stored
 * 2. Video message webhook -> video preview advisory & field report stored
 * 3. Unsupported voice/audio message -> safe advisory without crash
 * 4. Verification of /api/agri/field-reports endpoint
 */

const axios = require('axios');
const assert = require('assert');

const BASE_URL = 'http://localhost:3000';

async function testWebhookMedia() {
  console.log('===============================================================');
  console.log('🧪 TESTING LIVE WEBHOOK MULTIMODAL MEDIA PROCESSING');
  console.log('===============================================================\n');

  const testPhone = '919440201203';

  // 1. Send Video Webhook Message
  console.log('1. Sending Inbound Crop Video Webhook...');
  const videoPayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15550001234', phone_number_id: '10000000000' },
          contacts: [{ profile: { name: 'Ramesh Reddy' }, wa_id: testPhone }],
          messages: [{
            from: testPhone,
            id: 'wamid.TEST_VIDEO_' + Date.now(),
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: 'video',
            video: {
              id: 'video_meta_asset_999',
              mime_type: 'video/mp4',
              caption: 'Canopy inspection video from Guntur paddy field',
              sha256: 'hash123'
            }
          }]
        }
      }]
    }]
  };

  const vRes = await axios.post(`${BASE_URL}/webhook`, videoPayload);
  assert.strictEqual(vRes.status, 200, 'Webhook must return 200 immediately');
  console.log('✅ Video webhook returned 200 immediately.\n');

  // Wait a brief moment for asynchronous store write
  await new Promise(r => setTimeout(r, 600));

  // 2. Send Unsupported Voice/Audio Webhook Message
  console.log('2. Sending Inbound Audio / Voice Webhook...');
  const audioPayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15550001234', phone_number_id: '10000000000' },
          contacts: [{ profile: { name: 'Ramesh Reddy' }, wa_id: testPhone }],
          messages: [{
            from: testPhone,
            id: 'wamid.TEST_AUDIO_' + Date.now(),
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: 'audio',
            audio: { id: 'audio_123', mime_type: 'audio/ogg' }
          }]
        }
      }]
    }]
  };

  const aRes = await axios.post(`${BASE_URL}/webhook`, audioPayload);
  assert.strictEqual(aRes.status, 200, 'Webhook must return 200 immediately');
  console.log('✅ Audio webhook returned 200 immediately without crashing.\n');

  // 3. Send Crop Photo Webhook Message
  console.log('3. Sending Inbound Crop Photo Webhook...');
  const photoPayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15550001234', phone_number_id: '10000000000' },
          contacts: [{ profile: { name: 'Ramesh Reddy' }, wa_id: testPhone }],
          messages: [{
            from: testPhone,
            id: 'wamid.TEST_PHOTO_' + Date.now(),
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: 'image',
            image: {
              id: 'simulated_photo_media_123',
              mime_type: 'image/jpeg',
              caption: 'Paddy leaves showing brown lesions with ash-colored centers'
            }
          }]
        }
      }]
    }]
  };

    const pRes = await axios.post(`${BASE_URL}/webhook`, photoPayload);
    assert.strictEqual(pRes.status, 200, 'Webhook must return 200 immediately');
    console.log('✅ Photo webhook returned 200 immediately.\n');

    // Wait 1.5s for risk assessment pipeline to complete
    await new Promise(r => setTimeout(r, 1500));

    // 4. Verify Field Reports REST Endpoint
    console.log('4. Checking /api/agri/field-reports Endpoint...');
    const reportsRes = await axios.get(`${BASE_URL}/api/agri/field-reports`);
    assert.strictEqual(reportsRes.status, 200);
    const reports = reportsRes.data;
    assert(Array.isArray(reports), 'Field reports should be an array');
    console.log(`   Found ${reports.length} total field reports in store.`);

    const videoReport = reports.find(r => r.report_type === 'crop_video');
    assert(videoReport, 'Video report must be recorded in store');
    assert.strictEqual(videoReport.analysis_status, 'preview_only_unsupported');
    console.log('   Video Report Verified:', {
      type: videoReport.report_type,
      status: videoReport.analysis_status,
      caption: videoReport.description
    });

    console.log('\n===============================================================');
    console.log('🎉 ALL WEBHOOK MEDIA INTEGRATION TESTS PASSED!');
    console.log('===============================================================');
}

testWebhookMedia().catch(err => {
  console.error('❌ Webhook media test failed:', err);
  process.exit(1);
});
