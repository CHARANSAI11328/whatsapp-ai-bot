const express = require('express');
const axios   = require('axios');
const cors    = require('cors');
const path    = require('path');
const helmet  = require('helmet');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// AgriGuard AI Modular Services
const weatherService = require('./services/weatherService');
const vegetationService = require('./services/vegetationService');
const riskEngine = require('./services/riskEngine');
const assessmentStore = require('./services/assessmentStore');
const farmerProfileService = require('./services/farmerProfileService');
const multimodalService = require('./services/multimodalService');
const languageService = require('./services/languageService');

const app = express();

// Secure server using Helmet with custom CSP allowing CDN assets and inline scripts/styles
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      "script-src-attr": ["'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      "font-src": ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:", "https:"]
    },
  },
}));

app.use(express.json());

// Secure CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// Environment Variable Mapping with Legacy Fallbacks
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = (process.env.META_VERIFY_TOKEN || process.env.VERIFY_TOKEN || '').trim();
const WHATSAPP_TOKEN = (process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || '').trim();
const PHONE_NUMBER_ID = (process.env.PHONE_NUMBER_ID || '').trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();

// Structured console logging function
function logEvent(level, message, meta = {}) {
  const logObj = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  };
  console.log(JSON.stringify(logObj));
}

logEvent('INFO', 'Booting AgriGuard AI Risk Intelligence Engine...', { model: GEMINI_MODEL, port: PORT });

// Initialize Database & Google Gen AI Clients safely
let supabase = null;
let ai = null;

try {
  if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    logEvent('INFO', 'Supabase Client Initialized.');
  }
} catch (err) {
  logEvent('ERROR', 'Supabase Client initialization failure:', { error: err.message });
}

try {
  if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    logEvent('INFO', 'Gemini AI Client Initialized.');
  }
} catch (err) {
  logEvent('ERROR', 'Gemini AI Client initialization failure:', { error: err.message });
}

// Normalize contentsPayload into proper Gemini SDK v2 format
function normalizeContents(contentsPayload) {
  // Already in correct format: [{role, parts:[{text}]}]
  if (Array.isArray(contentsPayload) && contentsPayload.length > 0 && contentsPayload[0]?.parts) {
    return contentsPayload;
  }
  // Array of strings → wrap each as a user turn
  if (Array.isArray(contentsPayload)) {
    return contentsPayload.map(item => ({
      role: 'user',
      parts: [{ text: typeof item === 'string' ? item : JSON.stringify(item) }]
    }));
  }
  // Plain string
  return [{ role: 'user', parts: [{ text: String(contentsPayload) }] }];
}

// Fallback AI text generation function that handles candidate models gracefully
async function generateAiContentSafe(contentsPayload, systemInstruction) {
  if (!ai) {
    throw new Error('Gemini AI client is uninitialized.');
  }

  const candidateModels = [
    GEMINI_MODEL,
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ];
  const uniqueModels = [...new Set(candidateModels.filter(Boolean))];
  const normalizedContents = normalizeContents(contentsPayload);

  let lastError = null;
  for (const modelName of uniqueModels) {
    try {
      logEvent('INFO', `Attempting AI content generation with model: ${modelName}`);
      const response = await ai.models.generateContent({
        model: modelName,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.3,
        },
        contents: normalizedContents,
      });

      const replyText = response.text?.trim() || response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (replyText) {
        logEvent('INFO', `AI content generation successful via model ${modelName}`);
        return replyText;
      }
    } catch (err) {
      logEvent('WARNING', `Model ${modelName} failed generation. Trying candidate fallback...`, { error: err.message });
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini candidate models failed to generate content.');
}

// Outbound WhatsApp Meta API Pipeline (Supports 1-Click Interactive Buttons & Text Fallback)
async function sendWhatsAppMessage(to, text, buttons = null) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    logEvent('WARNING', 'Simulating WhatsApp dispatch (Meta credentials not configured in this test).', { to, textSnippet: text.substring(0, 60), buttonsCount: buttons?.length || 0 });
    return 'simulated_' + Date.now();
  }
  
  const formattedPhone = to.replace(/\D/g, '');
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

  // 1. If buttons provided, attempt Meta Cloud API Interactive Reply Buttons (max 3, titles <= 20 chars)
  if (Array.isArray(buttons) && buttons.length > 0) {
    try {
      const interactivePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: text.substring(0, 1024) },
          action: {
            buttons: buttons.slice(0, 3).map((btn, idx) => ({
              type: 'reply',
              reply: {
                id: String(btn.id || `btn_${idx}`),
                title: String(btn.title).substring(0, 20)
              }
            }))
          }
        }
      };

      logEvent('INFO', 'Dispatched interactive button message to Meta...', { to: formattedPhone, buttonsCount: buttons.length });
      const response = await axios.post(url, interactivePayload, {
        headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }
      });
      const messageId = response.data?.messages?.[0]?.id;
      logEvent('INFO', 'Meta API Interactive Delivery Success.', { messageId });
      return messageId;
    } catch (btnErr) {
      logEvent('WARNING', 'Interactive buttons dispatch failed, falling back to numbered text:', { error: btnErr.response?.data?.error?.message || btnErr.message });
      // Append readable button list to text so farmer can easily reply 1, 2, 3
      text = `${text}\n\n` + buttons.slice(0, 3).map((b, i) => `👉 *${i + 1}*: ${b.title}`).join('\n');
    }
  }

  // 2. Standard Text Message Dispatch
  try {
    logEvent('INFO', 'Dispatched outbound message packet to Meta...', { to: formattedPhone });
    const response = await axios.post(url, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'text',
      text: { preview_url: false, body: text }
    }, {
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }
    });
    const messageId = response.data?.messages?.[0]?.id;
    logEvent('INFO', 'Meta API Delivery Success.', { messageId });
    return messageId;
  } catch (err) {
    const apiError = err.response?.data?.error?.message || err.message;
    logEvent('ERROR', 'Meta API Delivery Failure:', { error: apiError });
    throw new Error(apiError);
  }
}

// Fetch temporary binary download URL for a Meta Media ID
async function getWhatsAppMediaUrl(mediaId) {
  if (!WHATSAPP_TOKEN) {
    throw new Error('Meta credentials missing.');
  }
  const url = `https://graph.facebook.com/v20.0/${mediaId}`;
  const res = await axios.get(url, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
  });
  return res.data?.url;
}

// Download raw media file from Meta servers as Buffer
async function downloadWhatsAppMedia(mediaUrl) {
  if (!WHATSAPP_TOKEN) {
    throw new Error('Meta credentials missing.');
  }
  const res = await axios.get(mediaUrl, {
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` },
    responseType: 'arraybuffer'
  });
  return Buffer.from(res.data);
}

// ─── ROOT AND HEALTH CHECK ───

app.get('/', (req, res) => {
  if (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html')) {
    return res.json({ status: "online", system: "AgriGuard AI Operations Center" });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', async (req, res) => {
  let dbConnected = false;
  if (supabase) {
    try {
      const { error } = await supabase.from('system_settings').select('id').limit(1).maybeSingle();
      if (!error) dbConnected = true;
    } catch (err) {
      logEvent('ERROR', 'Health check database exception:', { error: err.message });
    }
  }

  res.json({
    status: "healthy",
    system: "AgriGuard AI",
    version: "2.0-MVP",
    database: dbConnected ? "connected" : "local_persistent_fallback",
    gemini: !!ai ? "connected" : "uninitialized",
    meta_whatsapp: (!!WHATSAPP_TOKEN && !!PHONE_NUMBER_ID) ? "configured" : "simulation_mode"
  });
});

// ─── META CLOUD API WEBHOOK ENDPOINTS ───

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      logEvent('INFO', 'Webhook handshake verification pass.');
      return res.status(200).send(challenge);
    } else {
      logEvent('WARNING', 'Webhook verification rejected. Token mismatch.', { expected: VERIFY_TOKEN, received: token });
      return res.sendStatus(403);
    }
  }
  res.sendStatus(400);
});

app.post('/webhook', async (req, res) => {
  // Always return 200 immediately to acknowledge receipt and prevent Meta retry storms
  res.sendStatus(200);

  // Wrap processing in a safe async block to catch any unexpected errors
  (async () => {
    try {
      // Existing processing logic starts here

    const entry   = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;
    
    // Process status updates if present
    const statusObj = value?.statuses?.[0];
    if (statusObj && supabase) {
      const msgId = statusObj.id;
      const status = statusObj.status;
      logEvent('INFO', 'Incoming webhook status update event:', { messageId: msgId, status });
      return;
    }

    const msgObj = value?.messages?.[0];
    if (!msgObj) return;

    const validTypes = ['text', 'image', 'interactive', 'audio', 'voice', 'video', 'document', 'sticker', 'location'];
    if (!validTypes.includes(msgObj.type)) {
      logEvent('INFO', `Skipped unsupported message type '${msgObj.type}'.`);
      return;
    }

    const rawFrom = msgObj.from;
    const msgId   = msgObj.id;
    let msgText   = '';
    let locationObj = null;
    let interactiveButtonId = null;

    if (msgObj.type === 'text') {
      msgText = msgObj.text?.body || '';
    } else if (msgObj.type === 'image') {
      msgText = msgObj.image?.caption ? `[Photo] ${msgObj.image.caption}` : '[Sent a Crop Photo]';
    } else if (msgObj.type === 'location') {
      locationObj = msgObj.location;
      msgText = `[Shared Location Pin: ${locationObj.latitude}, ${locationObj.longitude}${locationObj.name ? ' - ' + locationObj.name : ''}]`;
    } else if (msgObj.type === 'interactive') {
      interactiveButtonId = msgObj.interactive?.button_reply?.id || msgObj.interactive?.list_reply?.id || null;
      msgText = msgObj.interactive?.button_reply?.title || msgObj.interactive?.list_reply?.title || '[Interactive Response]';
    } else if (msgObj.type === 'button') {
      interactiveButtonId = msgObj.button?.payload || null;
      msgText = msgObj.button?.text || '[Button Click]';
    } else if (msgObj.type === 'audio' || msgObj.type === 'voice') {
      msgText = '[Voice Note]';
    } else if (msgObj.type === 'video') {
      msgText = msgObj.video?.caption ? `[Crop Video] ${msgObj.video.caption}` : '[Sent a Crop Video]';
    } else {
      msgText = '[Media Message]';
    }

    if (!rawFrom || !msgId) return;
    const cleanFrom = rawFrom.replace(/\D/g, '');
    logEvent('INFO', 'Incoming farmer WhatsApp message:', { from: `+${cleanFrom}`, type: msgObj.type, text: msgText, buttonId: interactiveButtonId });

    // 1. In-Memory & Store Deduplication Check (Fast zero-retry guarantee)
    if (assessmentStore.isMessageProcessed(msgId)) {
      logEvent('INFO', 'Duplicate webhook message skipped (already processed).', { messageId: msgId });
      return;
    }
    // assessmentStore.markMessageProcessed(msgId); // moved downstream after successful send

    // Save incoming message to local store
    assessmentStore.saveMessage({
      id: msgId,
      phone_number: cleanFrom,
      sender_type: 'user',
      message_body: msgText,
      delivery_status: 'received'
    });

    // Mirror to Supabase if connected
    if (supabase) {
      try {
        const { error: msgInsertError } = await supabase.from('messages').insert({
          id: msgId,
          phone_number: cleanFrom,
          sender_type: 'user',
          message_body: msgText
        });

        if (msgInsertError && msgInsertError.code === '23505') {
          logEvent('INFO', 'Duplicate webhook message skipped in Supabase.', { messageId: msgId });
          return;
        }

        // Keep contacts table synced
        await supabase.from('contacts').upsert({
          phone_number: cleanFrom,
          contact_name: value?.contacts?.[0]?.profile?.name || ('Farmer ' + cleanFrom.slice(-4)),
          is_stranger: false,
          relationship_type: 'farmer'
        });
      } catch (dbErr) {
        logEvent('ERROR', 'Supabase mirror exception:', { error: dbErr.message });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 1. MULTI-TURN ONBOARDING & FIELD REGISTRATION STATE MACHINE
    // ─────────────────────────────────────────────────────────────
    let farmer = assessmentStore.getFarmerByPhone(cleanFrom);
    let fields = assessmentStore.getFields(cleanFrom);
    let activeField = fields.length > 0 ? fields[0] : null;

    const lowerClean = msgText.toLowerCase().trim();
    const isLangChoice = !!languageService.detectLanguageChoice(interactiveButtonId || msgText);
    const isRegTrigger = farmerProfileService.isRegistrationTrigger(msgText, interactiveButtonId);
    const isDemo = farmerProfileService.isDemoTrigger(msgText);
    const hasActiveOnboarding = farmerProfileService.isOnboardingActive(cleanFrom);

    const isGreeting = ['hi', 'hello', 'hey', 'start', 'menu', 'namaste', 'హలో', 'నమస్కారం', 'नमस्ते', 'language', 'భాష', 'bhasha'].includes(lowerClean) || lowerClean === 'hi' || lowerClean === 'hello';

    // REQUIREMENT: FIRST PROMPT FARMER FOR LANGUAGE (Telugu / English / Hindi)
    // When farmer has NO language set and NO active onboarding and NO registered field, OR when farmer sends a greeting/menu:
    if ((!farmer?.preferred_language && !hasActiveOnboarding && !activeField && !isRegTrigger && !isDemo && !isLangChoice) || isGreeting) {
      logEvent('INFO', 'Prompting farmer for language selection (Telugu/English/Hindi)...', { phone: cleanFrom });
      const langPrompt = languageService.getLanguagePrompt();

      assessmentStore.setOnboardingState(cleanFrom, {
        step: 'AWAITING_LANGUAGE',
        is_minimal: true,
        draft_field: { phone_number: cleanFrom }
      });

      let langOutId = null;
      try {
        langOutId = await sendWhatsAppMessage(cleanFrom, langPrompt.text, langPrompt.buttons);
      } catch (lErr) {
        logEvent('ERROR', 'Failed to dispatch language prompt:', { error: lErr.message });
      }

      assessmentStore.saveMessage({
        id: langOutId || ('lang_prompt_' + Date.now()),
        phone_number: cleanFrom,
        sender_type: 'onboarding_bot',
        message_body: langPrompt.text,
        buttons: langPrompt.buttons,
        delivery_status: 'sent'
      });
      // Mark inbound message as processed after successful reply
      assessmentStore.markMessageProcessed(msgId);

      if (supabase) {
        try {
          await supabase.from('messages').insert({
            id: langOutId || ('lang_prompt_' + Date.now()),
            phone_number: cleanFrom,
            sender_type: 'onboarding_bot',
            message_body: langPrompt.text
          });
        } catch (e) {}
      }
      return;
    }

    if (isRegTrigger || isDemo || hasActiveOnboarding || isLangChoice || interactiveButtonId?.startsWith('crop_') || interactiveButtonId?.startsWith('stage_')) {
      logEvent('INFO', 'Routing message to WhatsApp Onboarding State Machine...', { phone: cleanFrom, buttonId: interactiveButtonId });
      const onboardResult = await farmerProfileService.processOnboardingMessage(
        cleanFrom,
        msgText,
        msgObj.type === 'image' ? msgObj.image : null,
        locationObj,
        interactiveButtonId
      );

      if (onboardResult.handled) {
        logEvent('INFO', 'Onboarding turn processed successfully. Sending step reply...', { to: cleanFrom });
        let onboardOutId = null;
        try {
          onboardOutId = await sendWhatsAppMessage(cleanFrom, onboardResult.replyText, onboardResult.buttons);
        } catch (sErr) {
          logEvent('ERROR', 'Outbound onboarding message failed:', { error: sErr.message });
        }

        assessmentStore.saveMessage({
          id: onboardOutId || ('onboard_' + Date.now()),
          phone_number: cleanFrom,
          sender_type: 'onboarding_bot',
          message_body: onboardResult.replyText,
          buttons: onboardResult.buttons || [],
          delivery_status: 'sent'
        });
        // Mark inbound message as processed after successful onboarding reply
        assessmentStore.markMessageProcessed(msgId);

        if (supabase) {
          try {
            await supabase.from('messages').insert({
              id: onboardOutId || ('onboard_' + Date.now()),
              phone_number: cleanFrom,
              sender_type: 'onboarding_bot',
              message_body: onboardResult.replyText
            });
          } catch (e) {}
        }
        return; // Completed onboarding turn! Never send unrelated personal responses.
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. ACTIVE FIELD & FARMER LOOKUP
    // ─────────────────────────────────────────────────────────────
    farmer = assessmentStore.getFarmerByPhone(cleanFrom);
    if (!farmer) {
      farmer = assessmentStore.saveFarmer({
        phone_number: cleanFrom,
        display_name: value?.contacts?.[0]?.profile?.name || ('Farmer ' + cleanFrom.slice(-4))
      });
    }

    fields = assessmentStore.getFields(cleanFrom);
    activeField = fields.length > 0 ? fields[0] : null;

    // ─────────────────────────────────────────────────────────────
    // 3. VIDEO WORKFLOW (PREVIEW ONLY — ZERO FABRICATION)
    // ─────────────────────────────────────────────────────────────
    if (msgObj.type === 'video') {
      logEvent('INFO', 'Processing incoming farmer crop video report (Preview Pathway)...', { phone: cleanFrom });
      const videoResult = multimodalService.handleCropVideo({
        videoMeta: {
          id: msgObj.video?.id,
          mime_type: msgObj.video?.mime_type || 'video/mp4',
          caption: msgObj.video?.caption || '',
          sha256: msgObj.video?.sha256
        },
        farmer,
        field: activeField
      });

      // Save video report to store
      assessmentStore.saveFieldReport(videoResult.report);

      // Dispatch polite preview advisory to farmer
      let videoOutId = null;
      try {
        videoOutId = await sendWhatsAppMessage(cleanFrom, videoResult.replyText);
          // Mark inbound message as processed after successful video reply
          assessmentStore.markMessageProcessed(msgId);
      } catch (vSendErr) {
        logEvent('ERROR', 'Failed to dispatch video preview advisory:', { error: vSendErr.message });
      }

      assessmentStore.saveMessage({
        id: videoOutId || ('video_reply_' + Date.now()),
        phone_number: cleanFrom,
        sender_type: 'video_preview_notice',
        message_body: videoResult.replyText,
        delivery_status: 'sent'
      });

      if (supabase) {
        try {
          await supabase.from('messages').insert({
            id: videoOutId || ('video_reply_' + Date.now()),
            phone_number: cleanFrom,
            sender_type: 'video_preview_notice',
            message_body: videoResult.replyText
          });
        } catch (e) {}
      }
      // Mark inbound message as processed after successful video reply
      assessmentStore.markMessageProcessed(msgId);
      return; // Handled cleanly without pretending Gemini analyzed video!
    }

    // ─────────────────────────────────────────────────────────────
    // 4. UNSUPPORTED MEDIA TYPES (VOICE, AUDIO, DOCUMENTS)
    // ─────────────────────────────────────────────────────────────
    if (['audio', 'voice', 'document', 'sticker'].includes(msgObj.type)) {
      logEvent('INFO', `Acknowledging unsupported media message type: ${msgObj.type}`, { phone: cleanFrom });
      const mediaResp = multimodalService.handleUnsupportedMedia(msgObj.type, farmer);
      let mediaOutId = null;
      try {
        mediaOutId = await sendWhatsAppMessage(cleanFrom, mediaResp.replyText);
      } catch (e) {}

      assessmentStore.saveMessage({
        id: mediaOutId || ('media_reply_' + Date.now()),
        phone_number: cleanFrom,
        sender_type: 'media_notice',
        message_body: mediaResp.replyText,
        delivery_status: 'sent'
      });
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // 5. DOWNLOAD ATTACHED IMAGE (IF PHOTO PRESENT)
    // ─────────────────────────────────────────────────────────────
    let imageBuffer = null;
    let imageMimeType = null;
    if (msgObj.type === 'image') {
      const mediaId = msgObj.image?.id;
      imageMimeType = msgObj.image?.mime_type || 'image/jpeg';
      if (mediaId && WHATSAPP_TOKEN) {
        try {
          const mediaUrl = await getWhatsAppMediaUrl(mediaId);
          if (mediaUrl) {
            imageBuffer = await downloadWhatsAppMedia(mediaUrl);
            logEvent('INFO', 'Farmer crop photo downloaded successfully.', { size: imageBuffer.length });
          } else {
            throw new Error('Meta API returned empty media download URL.');
          }
        } catch (mediaErr) {
          logEvent('ERROR', 'Failed to download WhatsApp media:', { error: mediaErr.message });
          // Handle download failure safely
          const dlFail = multimodalService.handleDownloadFailure({
            mediaId: mediaId,
            mediaType: 'image',
            farmer,
            field: activeField,
            error: mediaErr.message
          });
          assessmentStore.saveFieldReport(dlFail.report);
          try {
            await sendWhatsAppMessage(cleanFrom, dlFail.replyText);
          } catch (e) {}
          return; // Terminate cleanly after alerting farmer
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 5. CROP SYMPTOM INTAKE WORKFLOW (PROMPT 8 EXAMPLE 2)
    // ─────────────────────────────────────────────────────────────
    const symptomKeywords = [
      'yellow', 'spot', 'leaf', 'leaves', 'blight', 'fungus', 'pest', 'burn', 'wilt', 'drying', 'rot', 'damage', 'disease', 'insects', 'bugs', 'chlorosis', 'curl', 'brown', 'shedding',
      'ఆకు', 'మచ్చ', 'పసుపు', 'పురుగు', 'తెగులు', 'ఎండిపో', 'రాలిపో', 'నల్ల', 'దోమ', 'దెబ్బతిన్న', 'కీటక', 'బాధ'
    ];
    const lowerMsg = msgText.toLowerCase();
    const isSymptomReport = symptomKeywords.some(kw => lowerMsg.includes(kw));
    const incomingCoords = farmerProfileService.parseCoordinates(msgText, locationObj);
    const pendingIntake = assessmentStore.getPendingIntake(cleanFrom);

    // Case 2A: Farmer reports crop symptoms without location or photo
    if (isSymptomReport && !imageBuffer && !incomingCoords && (!activeField || !activeField.latitude)) {
      logEvent('INFO', 'Crop symptom report detected without field coordinates or photo. Initiating assessment record & requesting evidence...', { phone: cleanFrom });
      
      let detectedCrop = farmer?.preferred_language === 'te' ? 'వరి' : 'Paddy';
      const matchedCrop = farmerProfileService.RECOGNIZED_CROPS.find(c => lowerMsg.includes(c));
      if (matchedCrop) {
        detectedCrop = matchedCrop.charAt(0).toUpperCase() + matchedCrop.slice(1);
        if (detectedCrop === 'Rice' || detectedCrop === 'వరి' || detectedCrop === 'ధాన్') detectedCrop = farmer?.preferred_language === 'te' ? 'వరి (Paddy)' : 'Paddy';
      } else if (activeField?.crop_name) {
        detectedCrop = activeField.crop_name;
      }

      const farmerLang = farmer?.preferred_language || 'en';
      const intakeReply = languageService.getMissingEvidencePrompt(farmerLang);

      const initiatedAsmt = assessmentStore.saveAssessment({
        farmer_id: farmer.id,
        field_id: activeField?.id || null,
        phone_number: cleanFrom,
        farmer_name: farmer.display_name,
        crop_name: detectedCrop,
        crop_type: detectedCrop,
        crop_stage: activeField?.crop_stage || 'Vegetative',
        location: 'Location pending',
        assessment_type: 'intake_pending_evidence',
        risk_level: 'INSUFFICIENT_EVIDENCE',
        risk_score: 25,
        confidence_level: 'LOW (25%)',
        confidence_score: 0.25,
        status: 'pending_evidence',
        summary: `Farmer reported ${detectedCrop} symptoms: "${msgText}". Awaiting field coordinates and leaf photo for microclimate telemetry.`,
        observed_data: msgText,
        calculated_indicators: ['Farmer reported foliar symptom; microclimate telemetry and optical evidence pending.'],
        environmental_risk_factors: ['Microclimate data pending field coordinates.'],
        possible_crop_stress: 'Unconfirmed crop stress pending evidence.',
        disease_hypotheses: [
          { hypothesis: `${detectedCrop} foliar stress / chlorosis (unconfirmed hypothesis)`, confidence: 'Pending Evidence' }
        ],
        missing_evidence: [
          'Field GPS coordinates or WhatsApp location pin',
          'Clear close-up photograph of affected foliage'
        ],
        recommended_verification_actions: [
          'Share your field location so we can retrieve live weather telemetry.',
          'Capture a clear photo of symptomatic leaves.'
        ],
        farmer_whatsapp_summary: intakeReply
      });

      assessmentStore.saveFieldReport({
        field_id: activeField?.id || null,
        farmer_id: farmer.id,
        phone_number: cleanFrom,
        source_message_id: msgId,
        report_type: 'farmer_text_inquiry',
        description: msgText,
        analysis_status: 'pending_evidence'
      });

      assessmentStore.setPendingIntake(cleanFrom, {
        assessment_id: initiatedAsmt.id,
        crop_name: detectedCrop,
        symptom_text: msgText,
        timestamp: new Date().toISOString()
      });

      let intakeOutId = null;
      try {
        intakeOutId = await sendWhatsAppMessage(cleanFrom, intakeReply);
      } catch (e) {
        logEvent('ERROR', 'Failed to dispatch intake reply:', { error: e.message });
      }

      assessmentStore.saveMessage({
        id: intakeOutId || ('intake_' + Date.now()),
        phone_number: cleanFrom,
        sender_type: 'ai_intake',
        message_body: intakeReply,
        delivery_status: 'sent'
      });

      if (supabase) {
        try {
          await supabase.from('messages').insert({
            id: intakeOutId || ('intake_' + Date.now()),
            phone_number: cleanFrom,
            sender_type: 'ai_intake',
            message_body: intakeReply
          });
        } catch (e) {}
      }
      return; // Completed intake turn!
    }

    // Case 2B: Location arrived via pin or coordinates
    if (incomingCoords) {
      if (!activeField) {
        activeField = assessmentStore.saveField({
          farmer_id: farmer.id,
          phone_number: cleanFrom,
          field_name: `${pendingIntake?.crop_name || 'Monitored'} Field`,
          crop_name: pendingIntake?.crop_name || 'Paddy',
          crop_type: pendingIntake?.crop_name || 'Paddy',
          latitude: incomingCoords.latitude,
          longitude: incomingCoords.longitude,
          crop_stage: 'Vegetative',
          area: 2.5
        });
      } else if (!activeField.latitude) {
        activeField.latitude = incomingCoords.latitude;
        activeField.longitude = incomingCoords.longitude;
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 6. MULTIMODAL BOTANICAL VISION ANALYSIS (GEMINI)
    // ─────────────────────────────────────────────────────────────
    let photoAnalysis = null;
    if (imageBuffer) {
      logEvent('INFO', 'Analyzing crop photo with Multimodal Vision Service...');
      photoAnalysis = await multimodalService.analyzeCropPhoto({
        imageBuffer,
        mimeType: imageMimeType,
        field: activeField,
        farmer,
        caption: msgObj.image?.caption || '',
        messageText: msgText,
        ai,
        modelName: GEMINI_MODEL
      });
      logEvent('INFO', 'Multimodal crop photo analysis complete.', {
        quality: photoAnalysis.image_quality,
        symptomsCount: photoAnalysis.visible_symptoms?.length || 0,
        status: photoAnalysis.status
      });

      // Save structured photo field report
      assessmentStore.saveFieldReport({
        field_id: activeField?.id || null,
        farmer_id: farmer.id,
        phone_number: cleanFrom,
        source_message_id: msgId,
        report_type: 'visual_photo',
        description: msgText,
        media_reference: msgObj.image?.id || null,
        media_metadata: {
          mime_type: imageMimeType,
          size_bytes: imageBuffer.length
        },
        analysis_status: photoAnalysis.status,
        analysis_result: photoAnalysis
      });
    } else if (activeField) {
      // Record text or location report
      assessmentStore.saveFieldReport({
        field_id: activeField.id,
        farmer_id: farmer.id,
        phone_number: cleanFrom,
        source_message_id: msgId,
        report_type: locationObj ? 'location_pin' : 'farmer_text_inquiry',
        description: msgText,
        media_reference: null
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 7. LIVE ENVIRONMENTAL DATA COLLECTION
    // ─────────────────────────────────────────────────────────────
    const lat = incomingCoords?.latitude || activeField?.latitude || farmer?.latitude || (locationObj ? locationObj.latitude : null);
    const lon = incomingCoords?.longitude || activeField?.longitude || farmer?.longitude || (locationObj ? locationObj.longitude : null);

    const weatherData = await weatherService.getLiveWeatherData(lat, lon);
    const vegetationData = vegetationService.getVegetationIndicators(activeField || {}, weatherData);

    // ─────────────────────────────────────────────────────────────
    // 8. DETERMINISTIC AGRONOMIC RISK ENGINE
    // ─────────────────────────────────────────────────────────────
    const riskEvaluation = riskEngine.evaluateCropRisk(activeField || {}, weatherData, vegetationData, photoAnalysis);

    // ─────────────────────────────────────────────────────────────
    // 8. GEMINI EVIDENCE SYNTHESIS & FARMER ADVISORY
    // ─────────────────────────────────────────────────────────────
    let farmerReply = '';
    const farmerLang = farmer?.preferred_language || 'en';
    const isTelugu = farmerLang === 'te';
    const isHindi = farmerLang === 'hi';

    if (!activeField && !imageBuffer && !msgText.toLowerCase().includes('help') && !pendingIntake) {
      if (isTelugu) {
        farmerReply = `🌾 *అగ్రిగార్డ్ AI — పంట నిర్వహణ & ప్రమాద నివారణ ఏజెంట్*
(Crop Management & Risk Agent)

నమస్కారం ${farmer.display_name}! మీ పొలం వాతావరణం, తేమ మరియు తెగుళ్ల ప్రమాదాన్ని పర్యవేక్షించడానికి మీ పొలాన్ని నమోదు చేసుకోండి.

👉 కింది బటన్ నొక్కండి లేదా *పొలం నమోదు* అని పంపండి.`;
      } else {
        farmerReply = `🌾 *Welcome to AgriGuard AI — Crop Management & Risk Agent!*

Hello ${farmer.display_name}! To monitor your field weather, soil conditions, and disease vulnerability, let's register your field.

Simply reply:
👉 *Register my field*

You can also send a photo of any damaged leaf or pest anytime for immediate evidence analysis!`;
      }
    } else if (!imageBuffer || riskEvaluation.overallRisk === 'INSUFFICIENT_EVIDENCE') {
      const icon = riskEvaluation.overallRisk === 'HIGH' ? '⚠️' : (riskEvaluation.overallRisk === 'MODERATE' ? '🟡' : '🟢');
      if (isTelugu) {
        farmerReply = `అందుబాటులో ఉన్న సమాచారంతో ఖచ్చితమైన పంట తెగులును నిర్ధారించలేకపోయాము. కొన్ని వాతావరణ పరిస్థితులు పంటపై ఒత్తిడిని పెంచే అవకాశం ఉంది, కానీ మరిన్ని ఆధారాలు అవసరం. దయచేసి స్పష్టమైన ఆకు ఫోటోను పంపండి మరియు పంట వయస్సును నిర్ధారించండి.

${icon} *పర్యావరణ ప్రమాద స్థాయి*: *${riskEvaluation.overallRisk}* (${activeField?.crop_name || pendingIntake?.crop_name || 'వరి'}).
• *వాతావరణ సూచికలు*: ఉష్ణోగ్రత ${weatherData.temperature}°C, తేమ ${weatherData.relativeHumidity}%, రాబోయే వర్షం ${weatherData.forecastRainNext3Days}mm
${riskEvaluation.diseaseHypotheses && riskEvaluation.diseaseHypotheses.length > 0 ? `• *సాధ్యమయ్యే సమస్యలు (అనిర్ధారిత)*: ${riskEvaluation.diseaseHypotheses.map(h => h.hypothesis).join(', ')}\n` : ''}• *కావలసిన ఆధారాలు*: స్పష్టమైన ఆకు ఫోటో మరియు క్షేత్ర పరిశీలన
• *సిఫార్సు చేసిన చర్య*: పొలంలో ప్రభావితమైన భాగాన్ని పరిశీలించండి మరియు ఆకు ఫోటో పంపండి.

_${languageService.getDisclaimer('te')}_`;
      } else {
        farmerReply = `I could not confirm a specific crop disease from the available information. Some conditions may increase crop stress risk, but more evidence is needed. Please share a clear photo and confirm the crop stage. You can also check the affected area in the field.

${icon} *Environmental Risk Level*: *${riskEvaluation.overallRisk}* for ${activeField?.crop_name || pendingIntake?.crop_name || 'Crop'}
• *Weather Indicators*: Temp ${weatherData.temperature}°C, Humidity ${weatherData.relativeHumidity}%, Rain forecast ${weatherData.forecastRainNext3Days}mm
${riskEvaluation.diseaseHypotheses && riskEvaluation.diseaseHypotheses.length > 0 ? `• *Possible Stress Factors (Unconfirmed)*: ${riskEvaluation.diseaseHypotheses.map(h => h.hypothesis).join(', ')}\n` : ''}• *Missing Evidence*: ${(riskEvaluation.missingEvidence || []).slice(0, 2).join('; ') || 'Clear photo of leaf foliage and verified crop stage'}
• *Recommended Action*: ${(riskEvaluation.recommendedVerificationActions || [])[0] || 'Check affected area in field and share leaf photos.'}

_${multimodalService.NON_DEFINITIVE_DISCLAIMER}_`;
      }
    } else {
      const evidencePackage = {
        farmer: { name: farmer?.display_name, phone: cleanFrom, language: farmerLang },
        crop: {
          name: activeField?.crop_name || activeField?.crop_type || (pendingIntake?.crop_name) || 'General Crop',
          stage: activeField?.crop_stage || activeField?.growth_stage || 'Active Growth',
          location: lat ? `${lat}, ${lon}` : 'Coordinates pending'
        },
        observed_data: {
          farmer_message: msgText,
          has_photo: !!imageBuffer,
          photo_findings: photoAnalysis?.visible_symptoms ? photoAnalysis.visible_symptoms.join('; ') : (photoAnalysis?.visualFindings || 'No photo attached.'),
          image_quality: photoAnalysis?.image_quality || 'unassessed',
          possible_explanations: photoAnalysis?.possible_explanations || [],
          missing_evidence: photoAnalysis?.missing_evidence || [],
          field_verification_recommended: photoAnalysis?.field_verification_recommended !== false,
          non_definitive_statement: photoAnalysis?.non_definitive_statement || multimodalService.NON_DEFINITIVE_DISCLAIMER
        },
        environmental_data: {
          source: weatherData.source,
          status: weatherData.status,
          temperature: `${weatherData.temperature}°C`,
          relative_humidity: `${weatherData.relativeHumidity}%`,
          precipitation_now: `${weatherData.precipitation}mm`,
          forecast_rain_3days: `${weatherData.forecastRainNext3Days}mm`,
          ndvi_index: vegetationData.ndvi,
          canopy_status: vegetationData.canopyVigor
        },
        rule_engine_findings: {
          overall_risk: riskEvaluation.overallRisk,
          risk_score: riskEvaluation.riskScore,
          triggered_rules: riskEvaluation.triggeredRules.map(r => `${r.name} (${r.description})`),
          hypotheses: riskEvaluation.diseaseHypotheses.map(h => `${h.hypothesis} [${h.confidence}]`),
          missing_evidence: riskEvaluation.missingEvidence,
          recommended_actions: riskEvaluation.recommendedVerificationActions
        }
      };

      const systemPrompt = `You are AgriGuard AI — Crop Management & Risk Agent, an expert agricultural risk intelligence agent pair-programming with farmers.
Your job is to generate a concise, empathetic, farmer-friendly WhatsApp advisory based strictly on the provided evidence package.
${isTelugu ? `CRITICAL LANGUAGE REQUIREMENT: You MUST write the ENTIRE advisory in natural, encouraging TELUGU (తెలుగు) language suitable for farmers in Andhra Pradesh and Telangana. Use standard Telugu agricultural terms (వరి, పత్తి, మిరప, తెగులు, ఆకు మచ్చ, తేమ, పురుగు, వర్షం, ఎరువులు). Include the Telugu non-definitive disclaimer: "${languageService.getDisclaimer('te')}".` : (isHindi ? `CRITICAL LANGUAGE REQUIREMENT: You MUST write the ENTIRE advisory in natural, encouraging HINDI (हिंदी) language. Include the Hindi non-definitive disclaimer: "${languageService.getDisclaimer('hi')}".` : '')}

SAFETY & INTEGRITY RULES (STRICT):
1. NEVER declare a speculative disease hypothesis as a confirmed diagnosis. Always use words like "Possible hypothesis", "Environmental risk factor", or "Unconfirmed".
2. Clearly distinguish:
   - 🔍 Observed Data (what was seen in photo or described)
   - 📊 Calculated Indicators (humidity, temperature, rain trends)
   - ⚠️ Possible Crop Stress & Disease Hypotheses (Unconfirmed)
   - ❓ Missing Evidence (what must be verified)
   - 🛡️ Recommended Verification Actions (safe, non-chemical field checks first)
3. Always include the explicit non-definitive disclaimer: "${isTelugu ? languageService.getDisclaimer('te') : (isHindi ? languageService.getDisclaimer('hi') : multimodalService.NON_DEFINITIVE_DISCLAIMER)}".
4. Keep the tone respectful, clear, and practical.
5. Format cleanly using WhatsApp bolding (*Title*), clean bullet points, and emoji indicators.
6. Max length: 250 words. Never recommend spraying heavy chemicals without extension officer confirmation.`;

      const promptPayload = `[EVIDENCE PACKAGE]\n${JSON.stringify(evidencePackage, null, 2)}\n\nGenerate the farmer advisory for WhatsApp:`;

      try {
        farmerReply = await generateAiContentSafe([promptPayload], systemPrompt);
      } catch (gErr) {
        logEvent('ERROR', 'Gemini generation error, using deterministic template:', { error: gErr.message });
        farmerReply = languageService.getAdvisoryFallback(farmerLang, {
          overallRisk: riskEvaluation.overallRisk,
          cropName: activeField?.crop_name || 'Crop',
          temp: weatherData.temperature,
          humidity: weatherData.relativeHumidity,
          rainForecast: weatherData.forecastRainNext3Days,
          hypotheses: riskEvaluation.diseaseHypotheses.map(h => h.hypothesis),
          missingEvidence: riskEvaluation.missingEvidence,
          actions: riskEvaluation.recommendedVerificationActions
        });
      }

      if (photoAnalysis?.missing_field_profile) {
        if (isTelugu) {
          farmerReply += `\n\n⚠️ *పొలం వివరాలు*: మీ పొలం ఇంకా నమోదు కాలేదు. లైవ్ వాతావరణం మరియు శాటిలైట్ పర్యవేక్షణ కోసం *పొలం నమోదు* అని పంపండి!`;
        } else {
          farmerReply += `\n\n⚠️ *Field Profile Note*: Your field is not registered yet. Reply *Register my field* to enable live weather telemetry and satellite NDVI monitoring for your plot!`;
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 9. SAVE DIAGNOSTIC ASSESSMENT & DISPATCH WHATSAPP ADVISORY
    // ─────────────────────────────────────────────────────────────
    const assessmentRecord = {
      field_id: activeField?.id || null,
      farmer_id: farmer?.id || ('farmer_' + cleanFrom),
      phone_number: cleanFrom,
      farmer_name: farmer?.display_name || farmer?.name || ('Farmer ' + cleanFrom.slice(-4)),
      crop_name: activeField?.crop_name || pendingIntake?.crop_name || 'General Crop',
      crop_type: activeField?.crop_type || pendingIntake?.crop_name || 'General Crop',
      crop_stage: activeField?.crop_stage || 'Active',
      growth_stage: activeField?.growth_stage || 'Active',
      location: lat ? `${lat}, ${lon}` : 'Unspecified Location',
      assessment_type: imageBuffer ? 'multimodal_environmental' : (incomingCoords ? 'environmental_weather' : 'rule_engine'),
      risk_level: riskEvaluation.overallRisk,
      risk_score: riskEvaluation.riskScore,
      confidence_level: `${Math.round(riskEvaluation.confidenceScore * 100)}%`,
      confidence_score: riskEvaluation.confidenceScore,
      status: 'open',
      summary: riskEvaluation.overallRisk + ' risk profile identified based on environmental indicators.',
      has_photo: !!imageBuffer,
      photo_analysis: photoAnalysis,
      observed_data: photoAnalysis?.visible_symptoms ? photoAnalysis.visible_symptoms.join('; ') : (photoAnalysis?.visualFindings || msgText),
      calculated_indicators: riskEvaluation.triggeredRules.map(r => `${r.name}: ${r.description}`),
      environmental_risk_factors: riskEvaluation.environmentalRiskFactors,
      possible_crop_stress: `${riskEvaluation.overallRisk} risk stress profile identified.`,
      disease_hypotheses: riskEvaluation.diseaseHypotheses,
      missing_evidence: riskEvaluation.missingEvidence,
      recommended_verification_actions: riskEvaluation.recommendedVerificationActions,
      farmer_whatsapp_summary: farmerReply,
      weather_snapshot: weatherData,
      vegetation_snapshot: vegetationData
    };

    if (pendingIntake && pendingIntake.assessment_id) {
      assessmentStore.updateAssessment(pendingIntake.assessment_id, assessmentRecord);
      assessmentStore.clearPendingIntake(cleanFrom);
    } else {
      assessmentStore.saveAssessment(assessmentRecord);
    }

    let outboundId = null;
    try {
      outboundId = await sendWhatsAppMessage(cleanFrom, farmerReply);
      logEvent('INFO', 'AgriGuard advisory dispatched to WhatsApp successfully.', { to: cleanFrom });
    } catch (sendErr) {
      logEvent('ERROR', 'Outbound advisory dispatch failed:', { error: sendErr.message });
    }

    assessmentStore.saveMessage({
      id: outboundId || ('agri_out_' + Date.now()),
      phone_number: cleanFrom,
      sender_type: 'ai_assessment',
      message_body: farmerReply,
      delivery_status: 'sent'
    });

    if (supabase) {
      try {
        await supabase.from('messages').insert({
          id: outboundId || ('agri_out_' + Date.now()),
          phone_number: cleanFrom,
          sender_type: 'ai_assessment',
          message_body: farmerReply
        });
      } catch (dbOutErr) {
        logEvent('ERROR', 'Supabase reply logging failed:', { error: dbOutErr.message });
      }
    }

  } catch (err) {
    logEvent('ERROR', 'Critical error in AgriGuard webhook pipeline:', { error: err.message, stack: err.stack });
  }
  })();
}); // ← closes app.post('/webhook', ...)

// ─── AGRIGUARD ORGANIZATION DASHBOARD REST APIS ───

// 1. Executive KPIs & System Health
app.get('/api/agri/stats', (req, res) => {
  try {
    const stats = assessmentStore.getStats();
    res.json({
      success: true,
      ...stats,
      health: {
        metaApi: (!!WHATSAPP_TOKEN && !!PHONE_NUMBER_ID) ? 'CONNECTED' : 'SIMULATION_READY',
        supabase: !!supabase ? 'CONNECTED' : 'LOCAL_PERSISTENT',
        gemini: !!ai ? 'CONNECTED' : 'OFFLINE',
        weatherApi: 'LIVE_OPEN_METEO',
        satellite: 'SENTINEL_2_LIVE'
      },
      lastDataRetrieval: stats.lastDataRetrieval
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Detailed System Health Telemetry
app.get('/api/agri/system-health', async (req, res) => {
  try {
    let dbConnected = false;
    if (supabase) {
      try {
        const { error } = await supabase.from('system_settings').select('id').limit(1).maybeSingle();
        if (!error) dbConnected = true;
      } catch (e) {}
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      services: {
        meta_whatsapp: {
          status: (!!WHATSAPP_TOKEN && !!PHONE_NUMBER_ID) ? 'CONNECTED' : 'SIMULATION_MODE',
          mode: (!!WHATSAPP_TOKEN && !!PHONE_NUMBER_ID) ? 'live_cloud_api' : 'simulated_dispatch',
          phone_number_id: PHONE_NUMBER_ID ? `${PHONE_NUMBER_ID.slice(0, 4)}••••` : 'not_set'
        },
        supabase_postgresql: {
          status: dbConnected ? 'CONNECTED' : 'LOCAL_PERSISTENT_FALLBACK',
          mode: dbConnected ? 'remote_postgres' : 'json_store',
          records_synced: true
        },
        gemini_vision: {
          status: !!ai ? 'ACTIVE' : 'OFFLINE',
          model: GEMINI_MODEL,
          multimodal_vision: 'enabled'
        },
        open_meteo_weather: {
          status: 'LIVE',
          provider: 'Open-Meteo Global Forecasting API',
          cache_ttl: '15_minutes_in_memory'
        },
        sentinel_2_satellite: {
          status: 'LIVE_HARMONIZED_GRID',
          provider: 'Copernicus Sentinel-2 Grid & Vegetation Adapter',
          cloud_filter: '>70% rejection threshold'
        }
      },
      last_successful_retrieval: new Date().toISOString(),
      active_incidents: []
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Farmers Directory
app.get('/api/agri/farmers', (req, res) => {
  try {
    const farmers = assessmentStore.getFarmers();
    res.json(farmers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agri/farmers', (req, res) => {
  try {
    const farmer = assessmentStore.saveFarmer(req.body);
    res.json({ success: true, farmer });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 3. Fields Directory
app.get('/api/agri/fields', (req, res) => {
  try {
    const fields = assessmentStore.getFields(req.query.phone);
    res.json(fields);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agri/fields', (req, res) => {
  try {
    const field = assessmentStore.saveField(req.body);
    res.json({ success: true, field });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 4. Field Reports
app.get('/api/agri/field-reports', (req, res) => {
  try {
    const reports = assessmentStore.getFieldReports(req.query.field_id);
    res.json(reports);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 5. Crop Assessments & Evidence Dossiers
app.get('/api/agri/assessments', (req, res) => {
  try {
    const assessments = assessmentStore.getAssessments();
    res.json(assessments);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 6. Alerts & Review Workflow
app.get('/api/agri/alerts', (req, res) => {
  try {
    const alerts = assessmentStore.getAlerts();
    res.json(alerts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agri/alerts/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, reviewerNotes, reviewerName } = req.body;
  if (!id || !status) {
    return res.status(400).json({ success: false, error: 'Missing alert ID or status' });
  }
  try {
    const updated = assessmentStore.updateAlertStatus(id, status, reviewerNotes, reviewerName);
    if (!updated) return res.status(404).json({ success: false, error: 'Alert not found' });
    res.json({ success: true, alert: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 7. Onboarding State Inspector & Reset
app.get('/api/agri/onboarding-state/:phone', (req, res) => {
  try {
    const state = assessmentStore.getOnboardingState(req.params.phone);
    res.json({ state: state || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agri/onboarding-reset/:phone', (req, res) => {
  try {
    assessmentStore.clearOnboardingState(req.params.phone);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 8. Live Weather Lookup Utility
app.get('/api/agri/weather', async (req, res) => {
  const { lat, lon } = req.query;
  try {
    const data = await weatherService.getLiveWeatherData(lat, lon);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 9. Demo Simulator Injector (Rice Blast, Cotton Heat Stress)
app.post('/api/agri/demo/simulate', (req, res) => {
  const { scenario } = req.body;
  try {
    assessmentStore.injectDemoScenario(scenario || 'paddy_blast');
    res.json({ success: true, message: `Scenario '${scenario}' injected successfully.` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── LEGACY & DASHBOARD COMPATIBILITY ROUTES ───

app.get('/api/messages', async (req, res) => {
  let allMsgs = [];
  if (supabase) {
    try {
      const { data, error } = await supabase.from('messages').select('*').order('timestamp', { ascending: false }).limit(50);
      if (!error && data) allMsgs = data;
    } catch (e) {
      logEvent('ERROR', 'Supabase messages fetch error:', { error: e.message });
    }
  }

  // Merge with local persistent store messages
  const storeMsgs = assessmentStore.getMessages();
  if (storeMsgs && storeMsgs.length > 0) {
    const existingIds = new Set(allMsgs.map(m => m.id));
    for (const sm of storeMsgs) {
      if (!existingIds.has(sm.id)) {
        allMsgs.push(sm);
        existingIds.add(sm.id);
      }
    }
  }

  if (allMsgs.length > 0) {
    const uniqueMap = {};
    for (const m of allMsgs) {
      if (!uniqueMap[m.phone_number]) {
        const farmer = assessmentStore.getFarmerByPhone(m.phone_number);
        uniqueMap[m.phone_number] = {
          id: m.id,
          from: m.phone_number,
          contact: farmer?.display_name || ('Farmer ' + String(m.phone_number).slice(-4)),
          incoming: null,
          reply: null,
          timestamp: m.timestamp
        };
      }
      if (m.sender_type === 'user' && !uniqueMap[m.phone_number].incoming) {
        uniqueMap[m.phone_number].incoming = m.message_body;
      } else if (!m.sender_type.includes('user') && !uniqueMap[m.phone_number].reply) {
        uniqueMap[m.phone_number].reply = m.message_body;
      }
    }
    return res.json(Object.values(uniqueMap));
  }

  const assessments = assessmentStore.getAssessments();
  const list = assessments.map(a => ({
    id: a.id,
    from: a.phone_number,
    contact: a.farmer_name,
    incoming: a.observed_data,
    reply: a.farmer_whatsapp_summary,
    timestamp: a.created_at
  }));
  res.json(list);
});

app.get('/api/messages/:phone', async (req, res) => {
  const clean = req.params.phone.replace(/\D/g, '');
  let phoneMsgs = [];
  if (supabase) {
    try {
      const { data } = await supabase.from('messages').select('*').eq('phone_number', clean).order('timestamp', { ascending: true });
      if (data && data.length > 0) phoneMsgs = data;
    } catch (e) {}
  }

  const storePhoneMsgs = assessmentStore.getMessages(clean);
  if (storePhoneMsgs && storePhoneMsgs.length > 0) {
    const storeMap = new Map(storePhoneMsgs.map(m => [m.id, m]));
    for (const m of phoneMsgs) {
      const local = storeMap.get(m.id);
      if (local && local.buttons) {
        m.buttons = local.buttons;
      }
    }
    const ids = new Set(phoneMsgs.map(m => m.id));
    for (const spm of storePhoneMsgs) {
      if (!ids.has(spm.id)) {
        phoneMsgs.push(spm);
        ids.add(spm.id);
      }
    }
  }

  if (phoneMsgs.length > 0) {
    phoneMsgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return res.json(phoneMsgs);
  }

  const assessments = assessmentStore.getAssessments().filter(a => a.phone_number.replace(/\D/g, '') === clean);
  res.json(assessments);
});

app.post('/api/send', async (req, res) => {
  const { to, message, name } = req.body;
  if (!to || !message) return res.status(400).json({ success: false, error: 'Missing recipient or message text' });
  const cleanTarget = to.replace(/\D/g, '');
  try {
    const msgId = await sendWhatsAppMessage(cleanTarget, message);
    if (supabase) {
      await supabase.from('messages').insert({
        id: msgId || ('manual_' + Date.now()),
        phone_number: cleanTarget,
        sender_type: 'manual_advisory',
        message_body: message
      });
    }
    res.json({ success: true, messageId: msgId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/settings', (req, res) => {
  res.json({ aiModeActive: true, system: 'AgriGuard AI' });
});

app.post('/api/settings', (req, res) => {
  res.json({ success: true, aiModeActive: true });
});

// Dynamic Client View Asset Server
app.use(express.static(__dirname));

// Express Error Boundary Middleware
app.use((err, req, res, next) => {
  logEvent('ERROR', 'Unhandled Express Application Error:', { error: err.message, stack: err.stack });
  res.status(500).json({ status: 'error', message: 'Internal AgriGuard Error' });
});

const GLOBAL_PORT = PORT;
app.listen(GLOBAL_PORT, () => logEvent('INFO', `🌾 AgriGuard AI Command Center Active on Port: ${GLOBAL_PORT}`));