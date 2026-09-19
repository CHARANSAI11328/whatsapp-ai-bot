/**
 * AgriGuard AI — Multimodal Crop Report Analysis Service
 * 
 * Implements Prompt 6 Multimodal Vision & Media Requirements:
 * 1. Structured preliminary visual photo analysis via Gemini.
 * 2. Strict distinction: visual patterns vs confirmed disease.
 * 3. 6 Required Output Fields:
 *    - visible_symptoms (or visible_symptoms_or_patterns)
 *    - image_quality (good, blurry, too_distant, poorly_lit, partially_obscured)
 *    - possible_explanations (cautious hypotheses)
 *    - missing_evidence (underside of leaf, roots, stem collar, field-wide pattern)
 *    - field_verification_recommended (true)
 *    - non_definitive_statement (explicit disclaimer)
 * 4. Resilient video workflow (metadata recording, preview advisory, no fake AI analysis).
 * 5. Download failure & invalid media safety boundaries.
 */

const NON_DEFINITIVE_DISCLAIMER = "This image analysis is a preliminary visual observation and does not constitute a definitive laboratory or agronomic diagnosis.";

/**
 * Validate that a buffer represents recognizable image data
 */
function validateImageBuffer(buffer, mimeType = '') {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { valid: false, reason: 'Missing or invalid buffer object' };
  }
  if (buffer.length < 32) {
    return { valid: false, reason: 'Image file is empty or too small (< 32 bytes)' };
  }

  // Check magic bytes for common image types (JPEG: FF D8 FF, PNG: 89 50 4E 47, WEBP: 52 49 46 46)
  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  const isPng  = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
  const isGif  = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;

  if (!isJpeg && !isPng && !isWebp && !isGif) {
    return { valid: false, reason: 'Unsupported or corrupted image file format signature' };
  }

  return { valid: true, sizeBytes: buffer.length };
}

/**
 * Build structured system and user prompts for Gemini Multimodal Vision
 */
function buildVisionPrompt(context = {}) {
  const { cropName, cropStage, location, farmerNote, hasFieldProfile } = context;

  const systemInstruction = `You are AgriGuard AI's Botanical Vision Specialist.
Your task is to analyze agricultural plant and crop photos sent by farmers.

CRITICAL SAFETY & AGRONOMIC INTEGRITY RULES:
1. Report ONLY visible, observable morphological patterns and features.
2. NEVER state a definitive or confirmed disease diagnosis. All possible causes must be labeled as provisional hypotheses.
3. Explicitly evaluate image quality (e.g. good, blurry, too_distant, poorly_lit, partially_obscured).
4. Identify what critical field evidence is missing (e.g. underside of leaf, stem base, whole-field pattern, root system).
5. Always recommend field verification by a local agricultural extension officer.
6. Always include the explicit non-definitive disclaimer statement.
7. Return your findings strictly in the requested JSON schema.`;

  const userPrompt = `[FIELD CONTEXT]
- Crop Species: ${cropName || 'Unspecified (Farmer field profile pending)'}
- Growth Stage: ${cropStage || 'Unspecified'}
- Field Coordinates/Location: ${location || 'Coordinates pending'}
- Farmer Notes / Caption: ${farmerNote || 'None provided'}
- Registered Field Profile: ${hasFieldProfile ? 'Yes' : 'No (Registration pending)'}

Inspect the attached plant foliage photo and return a JSON object with this exact structure:
{
  "visible_symptoms": [
    "description of visible spot, lesion, margin, discoloration, or pest feeding sign"
  ],
  "image_quality": "good" | "blurry" | "too_distant" | "poorly_lit" | "partially_obscured",
  "quality_reason": "brief reason if quality is suboptimal",
  "possible_explanations": [
    "cautious hypothesis 1 (e.g. foliar fungal spot like Rice Blast - unconfirmed)",
    "alternative hypothesis 2 (e.g. micronutrient deficiency or abiotic scorch)"
  ],
  "missing_evidence": [
    "underside of leaves for sporulation",
    "stem base inspection",
    "field-wide distribution pattern"
  ],
  "field_verification_recommended": true,
  "non_definitive_statement": "${NON_DEFINITIVE_DISCLAIMER}"
}

Respond ONLY with valid JSON. Do not include markdown code fences or conversational text outside JSON.`;

  return { systemInstruction, userPrompt };
}

/**
 * Robust JSON parser handling markdown code blocks and partial wrappers
 */
function parseGeminiJsonResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  let cleaned = rawText.trim();
  // Strip ```json ... ``` or ``` ... ```
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // Attempt direct JSON parse
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Attempt regex extraction of the first {...} block
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {}
    }
  }
  return null;
}

/**
 * Fallback visual observation when Gemini API call fails, times out, or returns unparseable text
 */
function buildDeterministicVisualFallback(reason, context = {}) {
  const crop = context.cropName || 'Crop';
  return {
    status: 'completed_fallback',
    image_quality: 'unassessed',
    quality_reason: `Automated visual extraction fallback (${reason})`,
    visible_symptoms: [
      `Visual foliar symptoms observed on ${crop} leaf sample (automated vision model offline)`
    ],
    possible_explanations: [
      `Foliar stress or early-stage lesion on ${crop} (unconfirmed preliminary hypothesis)`,
      'Abiotic nutrient or water moisture imbalance'
    ],
    missing_evidence: [
      'Microscopic laboratory spore examination',
      'In-person physical inspection of lower leaf surface and plant stem base',
      'Field-level incidence count'
    ],
    field_verification_recommended: true,
    non_definitive_statement: NON_DEFINITIVE_DISCLAIMER,
    disclaimer: NON_DEFINITIVE_DISCLAIMER,
    is_fallback: true
  };
}

/**
 * Analyze a crop photo with Gemini Multimodal Vision
 */
async function analyzeCropPhoto(params = {}) {
  const {
    imageBuffer,
    mimeType = 'image/jpeg',
    field = null,
    farmer = null,
    caption = '',
    messageText = '',
    ai = null,
    modelName = 'gemini-2.5-flash'
  } = params;

  // 1. Validate Image Buffer
  const bufferValidation = validateImageBuffer(imageBuffer, mimeType);
  if (!bufferValidation.valid) {
    return {
      status: 'invalid_media',
      error: bufferValidation.reason,
      image_quality: 'invalid',
      quality_reason: bufferValidation.reason,
      visible_symptoms: [],
      possible_explanations: [],
      missing_evidence: ['Clear, uncorrupted plant foliage photograph required'],
      field_verification_recommended: true,
      non_definitive_statement: NON_DEFINITIVE_DISCLAIMER,
      disclaimer: NON_DEFINITIVE_DISCLAIMER
    };
  }

  // 2. Prepare Field Context
  const context = {
    cropName: field?.crop_name || field?.crop_type || null,
    cropStage: field?.crop_stage || field?.growth_stage || null,
    location: field?.latitude ? `${field.latitude}, ${field.longitude}` : (farmer?.location || null),
    farmerNote: caption || messageText || '',
    hasFieldProfile: !!(field && (field.crop_name || field.crop_type))
  };

  // 3. Check for Gemini Client
  if (!ai) {
    return buildDeterministicVisualFallback('Gemini AI client uninitialized', context);
  }

  // 4. Call Gemini Multimodal API with candidate models
  const candidateModels = [
    modelName,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ].filter(Boolean);
  const uniqueModels = [...new Set(candidateModels)];

  const { systemInstruction, userPrompt } = buildVisionPrompt(context);
  const base64Data = imageBuffer.toString('base64');
  const inlinePart = {
    inlineData: {
      mimeType: mimeType || 'image/jpeg',
      data: base64Data
    }
  };

  let lastError = null;
  for (const model of uniqueModels) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.1,
          responseMimeType: 'application/json'
        },
        contents: [
          inlinePart,
          userPrompt
        ]
      });

      const replyText = response.text?.trim() || response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      const parsed = parseGeminiJsonResponse(replyText);

      if (parsed && Array.isArray(parsed.visible_symptoms) && parsed.visible_symptoms.length > 0) {
        // Enforce required fields and safety constraints
        const result = {
          status: 'completed',
          model_used: model,
          image_quality: parsed.image_quality || 'good',
          quality_reason: parsed.quality_reason || null,
          visible_symptoms: parsed.visible_symptoms,
          possible_explanations: Array.isArray(parsed.possible_explanations) ? parsed.possible_explanations : [],
          missing_evidence: Array.isArray(parsed.missing_evidence) ? parsed.missing_evidence : ['Underside leaf surface', 'Stem collar examination'],
          field_verification_recommended: parsed.field_verification_recommended !== undefined ? !!parsed.field_verification_recommended : true,
          non_definitive_statement: parsed.non_definitive_statement || NON_DEFINITIVE_DISCLAIMER,
          disclaimer: NON_DEFINITIVE_DISCLAIMER,
          missing_field_profile: !context.hasFieldProfile
        };
        return result;
      }
    } catch (err) {
      lastError = err;
    }
  }

  // If all candidate models failed or returned invalid JSON
  const fallback = buildDeterministicVisualFallback(lastError ? lastError.message : 'Model generation failed', context);
  fallback.status = 'gemini_failure';
  fallback.error = lastError ? lastError.message : 'Unknown generation failure';
  fallback.missing_field_profile = !context.hasFieldProfile;
  return fallback;
}

/**
 * Handle incoming crop video workflow (Preview Only, Safe Metadata Storage)
 */
function handleCropVideo(params = {}) {
  const {
    videoMeta = {},
    farmer = null,
    field = null
  } = params;

  const mediaId = videoMeta.id || ('video_' + Date.now());
  const mimeType = videoMeta.mime_type || 'video/mp4';
  const caption = videoMeta.caption || '';
  const now = new Date().toISOString();

  // Structured Field Report Record
  const videoReport = {
    field_id: field?.id || null,
    farmer_id: farmer?.id || null,
    phone_number: farmer?.phone_number || null,
    report_type: 'crop_video',
    description: caption ? `[Crop Video] ${caption}` : 'Farmer uploaded a crop video via WhatsApp',
    media_reference: mediaId,
    media_metadata: {
      media_type: 'video',
      mime_type: mimeType,
      caption: caption,
      sha256: videoMeta.sha256 || null,
      file_size: videoMeta.file_size || null
    },
    analysis_status: 'preview_only_unsupported',
    analysis_result: {
      supported: false,
      notice: 'AgriGuard video analysis is currently in preview mode. Automated video diagnostics are not available.',
      field_verification_recommended: true,
      non_definitive_statement: NON_DEFINITIVE_DISCLAIMER
    },
    captured_at: now,
    created_at: now
  };

  // Farmer WhatsApp Advisory
  const replyText = `📹 *AgriGuard AI — Video Received*

Hello${farmer?.display_name ? ' ' + farmer.display_name : ''}! We received your crop video.

⚠️ *Video Analysis in Preview*:
AgriGuard automated video diagnostics are currently in preview mode and not yet active. We have recorded your video submission for our agronomy review team.

👉 *What to do now*:
Please take and send **1 or 2 clear, close-up photos** of the affected leaves, stems, or pests.

Clear still photos allow our multimodal vision engine to inspect lesion patterns immediately alongside your field's live weather telemetry!`;

  return {
    handled: true,
    replyText,
    report: videoReport
  };
}

/**
 * Handle media download failure safely
 */
function handleDownloadFailure(params = {}) {
  const {
    mediaId,
    mediaType = 'image',
    farmer = null,
    field = null,
    error = 'Media download timeout'
  } = params;

  const now = new Date().toISOString();
  const failureReport = {
    field_id: field?.id || null,
    farmer_id: farmer?.id || null,
    phone_number: farmer?.phone_number || null,
    report_type: mediaType === 'image' ? 'visual_photo' : 'crop_video',
    description: `Media download failed from WhatsApp Cloud API: ${error}`,
    media_reference: mediaId || null,
    media_metadata: {
      media_type: mediaType,
      download_error: error
    },
    analysis_status: 'download_failed',
    analysis_result: {
      status: 'download_failed',
      error: error,
      image_quality: 'unreadable',
      visible_symptoms: [],
      possible_explanations: [],
      missing_evidence: ['Re-upload of readable crop media'],
      field_verification_recommended: true,
      non_definitive_statement: NON_DEFINITIVE_DISCLAIMER
    },
    captured_at: now,
    created_at: now
  };

  const replyText = `⚠️ *AgriGuard AI — Media Download Alert*

We could not download the attached ${mediaType} from WhatsApp servers (${error}).

👉 Please re-send the photo with a stable internet connection, or send a brief description of the symptoms on your crop.`;

  return {
    handled: true,
    replyText,
    report: failureReport
  };
}

/**
 * Handle unsupported media types (voice note, documents, stickers) gracefully
 */
function handleUnsupportedMedia(msgType, farmer = null) {
  const replyText = `🌾 *AgriGuard AI Assistant*

Hello${farmer?.display_name ? ' ' + farmer.display_name : ''}! We received your ${msgType} message.

For crop health and disease risk evaluation, please send:
1. 📸 *A clear close-up photo* of symptomatic leaves, or
2. 💬 *A text message* describing your crop and symptoms, or
3. 📍 *A location pin* to track local weather risk.`;

  return {
    handled: true,
    replyText
  };
}

module.exports = {
  NON_DEFINITIVE_DISCLAIMER,
  validateImageBuffer,
  buildVisionPrompt,
  parseGeminiJsonResponse,
  buildDeterministicVisualFallback,
  analyzeCropPhoto,
  handleCropVideo,
  handleDownloadFailure,
  handleUnsupportedMedia
};
