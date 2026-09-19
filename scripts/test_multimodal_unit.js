/**
 * AgriGuard AI — Multimodal Crop Report Analysis Unit Tests
 * 
 * Tests the 6 required scenarios from Prompt 6:
 * 1. Valid crop photo
 * 2. Invalid media
 * 3. Download failure
 * 4. Gemini failure
 * 5. Missing field profile
 * 6. Unsupported video
 */

const assert = require('assert');
const multimodalService = require('../services/multimodalService');
const assessmentStore = require('../services/assessmentStore');
const riskEngine = require('../services/riskEngine');

// 1x1 Minimal Valid PNG Buffer
const VALID_PNG_BUFFER = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
// 1x1 Minimal Valid JPEG Buffer
const VALID_JPEG_BUFFER = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

// Mock Gemini AI that simulates realistic botanical vision responses
const mockGeminiClient = {
  models: {
    generateContent: async ({ contents, config }) => {
      return {
        text: JSON.stringify({
          visible_symptoms: [
            "Elliptical spindle-shaped lesions with grayish ash centers and dark brown margins",
            "Chlorotic yellow halo surrounding older lesions on leaf lamina"
          ],
          image_quality: "good",
          quality_reason: "High contrast, in-focus close-up of leaf blade",
          possible_explanations: [
            "Foliar fungal infection consistent with Rice Blast (Magnaporthe oryzae) — provisional hypothesis",
            "Brown spot (Bipolaris oryzae) secondary fungal lesion",
            "Potassium deficiency induced marginal chlorosis"
          ],
          missing_evidence: [
            "Lower leaf collar examination for collar rot phase",
            "Underside leaf surface inspection for active conidial sporulation",
            "Field-level distribution pattern and percentage of tillers affected"
          ],
          field_verification_recommended: true,
          non_definitive_statement: multimodalService.NON_DEFINITIVE_DISCLAIMER
        })
      };
    }
  }
};

// Mock Gemini AI that always throws an error (quota/network failure)
const mockGeminiFailingClient = {
  models: {
    generateContent: async () => {
      throw new Error('429 Resource Exhausted: Quota exceeded for model gemini-2.5-flash');
    }
  }
};

async function runMultimodalTestSuite() {
  console.log('===============================================================');
  console.log('🧪 RUNNING AGRIGUARD AI MULTIMODAL CROP ANALYSIS TEST SUITE');
  console.log('   Testing all 6 required Prompt 6 scenarios');
  console.log('===============================================================\n');

  let passed = 0;

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 1: VALID CROP PHOTO
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 1: Valid Crop Photo Analysis...');
  const fieldProfile = {
    id: 'f_test_paddy',
    crop_name: 'Paddy',
    crop_stage: 'Tillering',
    latitude: 16.3067,
    longitude: 80.4365
  };
  const farmer = { id: 'farmer_01', display_name: 'Ramesh Reddy', phone_number: '919440201203' };

  const result1 = await multimodalService.analyzeCropPhoto({
    imageBuffer: VALID_JPEG_BUFFER,
    mimeType: 'image/jpeg',
    field: fieldProfile,
    farmer,
    caption: 'Leaves showing brown spindle spots with gray centers after heavy rain',
    ai: mockGeminiClient,
    modelName: 'gemini-2.5-flash'
  });

  assert.strictEqual(result1.status, 'completed', 'Analysis status should be completed');
  assert.strictEqual(result1.image_quality, 'good', 'Image quality should be good');
  assert(Array.isArray(result1.visible_symptoms) && result1.visible_symptoms.length > 0, 'Visible symptoms must be populated');
  assert(Array.isArray(result1.possible_explanations) && result1.possible_explanations.length > 0, 'Possible explanations must be populated');
  assert(Array.isArray(result1.missing_evidence) && result1.missing_evidence.length > 0, 'Missing evidence must be populated');
  assert.strictEqual(result1.field_verification_recommended, true, 'Field verification must be recommended');
  assert(result1.non_definitive_statement.includes('preliminary visual observation'), 'Non-definitive statement required');
  assert.strictEqual(result1.missing_field_profile, false, 'Field profile is present');

  console.log('   Visible Symptoms:', result1.visible_symptoms[0]);
  console.log('   Image Quality:', result1.image_quality);
  console.log('   Non-Definitive Statement:', result1.non_definitive_statement);
  console.log('✅ Scenario 1 Passed: All 6 required fields present without definitive disease claims.\n');
  passed++;

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 2: INVALID MEDIA (Empty or Corrupt Buffer)
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 2: Invalid Media (Empty or Corrupted Buffer)...');
  const emptyBuffer = Buffer.alloc(0);
  const corruptBuffer = Buffer.from('This is a plain text file pretending to be an image', 'utf8');

  const result2Empty = await multimodalService.analyzeCropPhoto({
    imageBuffer: emptyBuffer,
    mimeType: 'image/jpeg',
    field: fieldProfile,
    ai: mockGeminiClient
  });

  const result2Corrupt = await multimodalService.analyzeCropPhoto({
    imageBuffer: corruptBuffer,
    mimeType: 'image/jpeg',
    field: fieldProfile,
    ai: mockGeminiClient
  });

  assert.strictEqual(result2Empty.status, 'invalid_media');
  assert.strictEqual(result2Empty.image_quality, 'invalid');
  assert.strictEqual(result2Corrupt.status, 'invalid_media');
  assert.strictEqual(result2Corrupt.image_quality, 'invalid');
  assert(result2Corrupt.non_definitive_statement.length > 0, 'Disclaimer must be preserved even on invalid media');

  console.log('   Empty Buffer Result:', result2Empty.error);
  console.log('   Corrupt Buffer Result:', result2Corrupt.error);
  console.log('✅ Scenario 2 Passed: Invalid media safely detected and handled without crashing.\n');
  passed++;

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 3: DOWNLOAD FAILURE
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 3: Media Download Failure Pathway...');
  const dlFail = multimodalService.handleDownloadFailure({
    mediaId: 'media_id_unreachable',
    mediaType: 'image',
    farmer,
    field: fieldProfile,
    error: 'Meta Cloud API 504 Gateway Timeout'
  });

  assert.strictEqual(dlFail.handled, true);
  assert.strictEqual(dlFail.report.analysis_status, 'download_failed');
  assert(dlFail.replyText.includes('Media Download Alert'), 'Farmer reply must inform about download issue');
  assert(dlFail.replyText.includes('re-send'), 'Farmer reply must advise re-upload');

  // Verify it can be stored into assessmentStore without error
  const savedReport = assessmentStore.saveFieldReport(dlFail.report);
  assert.strictEqual(savedReport.analysis_status, 'download_failed');

  console.log('   Download Error Handled:', dlFail.report.description);
  console.log('   Farmer Advice Snippet:', dlFail.replyText.split('\n')[0]);
  console.log('✅ Scenario 3 Passed: Download failure handled gracefully with farmer prompt to re-send.\n');
  passed++;

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 4: GEMINI FAILURE / FALLBACK
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 4: Gemini API Failure / Fallback Handling...');
  const result4 = await multimodalService.analyzeCropPhoto({
    imageBuffer: VALID_PNG_BUFFER,
    mimeType: 'image/png',
    field: fieldProfile,
    farmer,
    ai: mockGeminiFailingClient,
    modelName: 'gemini-2.5-flash'
  });

  assert.strictEqual(result4.status, 'gemini_failure');
  assert.strictEqual(result4.image_quality, 'unassessed');
  assert(Array.isArray(result4.visible_symptoms) && result4.visible_symptoms.length > 0);
  assert(Array.isArray(result4.possible_explanations) && result4.possible_explanations.length > 0);
  assert(Array.isArray(result4.missing_evidence) && result4.missing_evidence.length > 0);
  assert.strictEqual(result4.field_verification_recommended, true);
  assert(result4.non_definitive_statement.includes('preliminary visual observation'));

  console.log('   Gemini Error:', result4.error);
  console.log('   Fallback Observation:', result4.visible_symptoms[0]);
  console.log('   Quality Reason:', result4.quality_reason);
  console.log('✅ Scenario 4 Passed: Resilient deterministic fallback triggered without crashing.\n');
  passed++;

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 5: MISSING FIELD PROFILE
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 5: Crop Photo with Missing Field Profile...');
  const unregisteredFarmer = { id: 'farmer_anon', display_name: 'Unregistered Farmer', phone_number: '919876543210' };

  const result5 = await multimodalService.analyzeCropPhoto({
    imageBuffer: VALID_JPEG_BUFFER,
    mimeType: 'image/jpeg',
    field: null, // No field registered
    farmer: unregisteredFarmer,
    caption: 'What is this yellow spot on my plant leaves?',
    ai: mockGeminiClient
  });

  assert.strictEqual(result5.status, 'completed');
  assert.strictEqual(result5.missing_field_profile, true, 'missing_field_profile flag must be true');
  assert(result5.visible_symptoms.length > 0, 'Symptoms still analyzed');

  // Verify Risk Engine integration with missing field profile
  const riskResult = riskEngine.evaluateCropRisk(null, {}, {}, result5);
  assert(riskResult.missingEvidence.some(m => m.toLowerCase().includes('crop species') || m.toLowerCase().includes('gps') || m.toLowerCase().includes('coordinate')), 'Missing field context must be listed in missing evidence');

  console.log('   Missing Field Profile Flag:', result5.missing_field_profile);
  console.log('   Missing Evidence Highlighted:', riskResult.missingEvidence.slice(0, 2).join('; '));
  console.log('✅ Scenario 5 Passed: Missing field handled properly, flagging field registration requirement.\n');
  passed++;

  // ─────────────────────────────────────────────────────────────
  // SCENARIO 6: UNSUPPORTED VIDEO WORKFLOW
  // ─────────────────────────────────────────────────────────────
  console.log('Scenario 6: Video Workflow (Preview Pathway — No Pretending Gemini Analyzed)...');
  const videoMeta = {
    id: 'wamid_video_sample_123',
    mime_type: 'video/mp4',
    caption: 'Video walkthrough of my paddy field after cyclone',
    sha256: 'a1b2c3d4e5f6',
    file_size: 4850000
  };

  const videoResult = multimodalService.handleCropVideo({
    videoMeta,
    farmer,
    field: fieldProfile
  });

  assert.strictEqual(videoResult.handled, true);
  assert.strictEqual(videoResult.report.report_type, 'crop_video');
  assert.strictEqual(videoResult.report.analysis_status, 'preview_only_unsupported');
  assert.strictEqual(videoResult.report.analysis_result.supported, false);
  assert(videoResult.replyText.includes('Video Analysis in Preview'), 'Reply must state video is in preview');
  assert(videoResult.replyText.includes('photos'), 'Reply must prompt for close-up photos');
  assert(!videoResult.replyText.toLowerCase().includes('i analyzed your video'), 'Must NOT pretend Gemini analyzed video');

  // Save and retrieve from assessment store
  const savedVideoReport = assessmentStore.saveFieldReport(videoResult.report);
  assert.strictEqual(savedVideoReport.report_type, 'crop_video');

  const allReports = assessmentStore.getFieldReports(fieldProfile.id);
  const foundVideo = allReports.find(r => r.report_type === 'crop_video');
  assert(foundVideo, 'Video report must be saved and retrievable in store');

  console.log('   Video Report Type:', videoResult.report.report_type);
  console.log('   Video Status:', videoResult.report.analysis_status);
  console.log('   Farmer Notice:', videoResult.replyText.split('\n')[2]);
  console.log('✅ Scenario 6 Passed: Video recorded in store with preview notice; zero AI fabrication.\n');
  passed++;

  console.log('===============================================================');
  console.log(`🎉 ALL ${passed}/6 MULTIMODAL CROP ANALYSIS SCENARIOS PASSED!`);
  console.log('===============================================================');
}

runMultimodalTestSuite().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
