const assessmentStore = require('./assessmentStore');
const languageService = require('./languageService');

/**
 * Farmer Profile and Multi-Turn WhatsApp Onboarding Service
 * Implements conversational field registration, interactive button quick-replies,
 * multi-language support (Telugu, Hindi, English), and safe fallbacks.
 */

// Common recognized crops in English, Telugu, and Hindi
const RECOGNIZED_CROPS = [
  'paddy', 'rice', 'cotton', 'chili', 'chilli', 'mirchi', 'tomato', 'maize', 
  'corn', 'wheat', 'sugarcane', 'groundnut', 'peanut', 'soybean', 'onion', 'potato', 'banana',
  'వరి', 'పత్తి', 'మిరప', 'మిర్చి', 'టమాట', 'మొక్కజొన్న', 'వేరుశనగ', 'చెరకు',
  'धान', 'चावल', 'कपास', 'मिर्च', 'टमाटर', 'मक्का', 'गेहूं', 'गन्ना'
];

// Date and coordinate validators
function parseCoordinates(text = '', locationObj = null) {
  if (locationObj && typeof locationObj.latitude === 'number' && typeof locationObj.longitude === 'number') {
    const lat = locationObj.latitude;
    const lon = locationObj.longitude;
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { latitude: lat, longitude: lon, placeName: locationObj.name || locationObj.address || null };
    }
  }

  const coordRegex = /([+-]?\d+\.?\d+)\s*,\s*([+-]?\d+\.?\d+)/;
  const match = text.match(coordRegex);
  if (match) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { latitude: lat, longitude: lon, placeName: null };
    }
  }

  return null;
}

function parseSowingInput(text = '') {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // Check ISO format YYYY-MM-DD
  const isoRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
  const isoMatch = clean.match(isoRegex);
  if (isoMatch) {
    const d = new Date(clean);
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 86400000);
    if (!isNaN(d.getTime()) && d <= now && d >= oneYearAgo) {
      return { sowing_date: clean, crop_stage: 'Vegetative' };
    }
  }

  // Check DD-MM-YYYY format
  const dmyRegex = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/;
  const dmyMatch = clean.match(dmyRegex);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    const iso = `${year}-${month}-${day}`;
    const d = new Date(iso);
    const now = new Date();
    if (!isNaN(d.getTime()) && d <= now) {
      return { sowing_date: iso, crop_stage: 'Vegetative' };
    }
  }

  // Check relative days (e.g. "45 days" or "3 weeks")
  const daysMatch = lower.match(/(\d+)\s*(days?|roojulu)/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    if (days >= 1 && days <= 250) {
      const estimatedDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
      let stage = 'Vegetative';
      if (days < 20) stage = 'Seedling';
      else if (days < 50) stage = 'Tillering / Vegetative';
      else if (days < 80) stage = 'Flowering / Reproductive';
      else stage = 'Maturity / Grain Filling';
      return { sowing_date: estimatedDate, crop_stage: stage };
    }
  }

  // Stage keywords
  if (lower.includes('flower') || lower.includes('bloom')) return { sowing_date: null, crop_stage: 'Flowering' };
  if (lower.includes('seedling') || lower.includes('nursery')) return { sowing_date: null, crop_stage: 'Seedling' };
  if (lower.includes('harvest') || lower.includes('mature')) return { sowing_date: null, crop_stage: 'Maturity' };
  if (lower.includes('fruit') || lower.includes('boll')) return { sowing_date: null, crop_stage: 'Fruit / Boll Development' };

  return { sowing_date: null, crop_stage: clean.substring(0, 30) };
}

function parseSoilAndIrrigation(text = '') {
  const lower = text.toLowerCase();
  let soil = 'Loam';
  let irrigation = 'Rainfed';

  if (lower.includes('black') || lower.includes('cotton')) soil = 'Black Cotton Soil';
  else if (lower.includes('red') || lower.includes('sandy')) soil = 'Red Sandy Loam';
  else if (lower.includes('clay')) soil = 'Clay Loam';
  else if (lower.includes('alluvial')) soil = 'Alluvial Soil';

  if (lower.includes('drip')) irrigation = 'Drip Irrigation';
  else if (lower.includes('canal')) irrigation = 'Canal Irrigation';
  else if (lower.includes('bore') || lower.includes('well') || lower.includes('motor')) irrigation = 'Borewell / Sprinkler';
  else if (lower.includes('rain')) irrigation = 'Rainfed';

  return { soil_type: soil, irrigation_type: irrigation };
}

// Check if message is a registration intent
function isRegistrationTrigger(text = '', buttonId = '') {
  if (buttonId === 'btn_register') return true;
  const t = (text || '').toLowerCase().trim();
  return (
    buttonId === 'btn_register' ||
    t === 'i want to register my field' ||
    t === 'i want to register field' ||
    t === 'i want to register' ||
    t === 'register my field' ||
    t === 'register field' ||
    t === 'register' ||
    t === 'new field' ||
    t === 'add field' ||
    t === 'field registration' ||
    t.includes('register my field') ||
    t.includes('register new field') ||
    t.includes('want to register') ||
    t === 'start registration' ||
    t.includes('పొలం నమోదు') ||
    t.includes('నమోదు') ||
    t.includes('రిజిస్టర్') ||
    t.includes('पंजीकरण') ||
    t.includes('रजिस्टर')
  );
}

function isDemoTrigger(text = '') {
  const t = text.toLowerCase().trim();
  return (
    t === 'demo register' ||
    t === 'test mode' ||
    t === 'test field' ||
    t === 'demo field' ||
    t === 'simulate onboarding'
  );
}

function isOnboardingActive(phoneNumber) {
  const state = assessmentStore.getOnboardingState(phoneNumber);
  return state && state.step && state.step !== 'COMPLETED';
}

/**
 * Multi-Turn WhatsApp Onboarding Handler
 */
async function processOnboardingMessage(phoneNumber, messageText = '', mediaObj = null, locationObj = null, interactiveButtonId = null) {
  const cleanPhone = (phoneNumber || '').replace(/\D/g, '');
  const lowerText = (messageText || '').toLowerCase().trim();

  let state = assessmentStore.getOnboardingState(cleanPhone);
  let farmer = assessmentStore.getFarmerByPhone(cleanPhone);
  const currentLang = farmer?.preferred_language || 'en';

  // 1. Handle Language Switch Trigger Anytime (from button or text)
  const explicitLang = languageService.detectLanguageChoice(interactiveButtonId || messageText);
  if (explicitLang) {
    farmer = assessmentStore.saveFarmer({
      phone_number: cleanPhone,
      display_name: farmer?.display_name || ('Farmer ' + cleanPhone.slice(-4)),
      preferred_language: explicitLang
    });

    if (state && state.step === 'AWAITING_LANGUAGE') {
      state.step = 'AWAITING_CROP';
      state.is_minimal = true;
      state.draft_field = {
        farmer_id: farmer.id,
        phone_number: cleanPhone
      };
      assessmentStore.setOnboardingState(cleanPhone, state);
      const cropPrompt = languageService.getCropSelectionPrompt(explicitLang);
      return {
        handled: true,
        replyText: cropPrompt.text,
        buttons: cropPrompt.buttons
      };
    }

    const menu = languageService.getMainMenu(explicitLang);
    return {
      handled: true,
      replyText: menu.text,
      buttons: menu.buttons
    };
  }

  // 2. Handle Cancellation / Reset
  if (lowerText === 'cancel' || lowerText === 'restart' || lowerText === 'reset') {
    assessmentStore.clearOnboardingState(cleanPhone);
    const cancelMsg = currentLang === 'te'
      ? `❌ *పొలం నమోదు రద్దు చేయబడింది.*\n\nమీరు ఎప్పుడైనా *Register my field* లేదా *పొలం నమోదు* అని పంపి మళ్ళీ ప్రారంభించవచ్చు.`
      : `❌ *Field registration has been cancelled.*\n\nYou can type *Register my field* anytime to start over, or send any crop question or photo for assistance.`;
    return {
      handled: true,
      replyText: cancelMsg
    };
  }

  // 3. Handle Test / Demo Mode Trigger
  if (isDemoTrigger(lowerText)) {
    assessmentStore.clearOnboardingState(cleanPhone);
    const demoFarmer = assessmentStore.saveFarmer({
      phone_number: cleanPhone,
      display_name: farmer?.display_name || 'Ramesh Reddy (Demo)',
      preferred_language: 'en',
      village: 'Guntur Rural',
      latitude: 16.3067,
      longitude: 80.4365,
      is_demo: true
    });

    const demoField = assessmentStore.saveField({
      farmer_id: demoFarmer.id,
      phone_number: cleanPhone,
      field_name: 'Plot 1 - Demo Paddy',
      crop_name: 'Paddy',
      crop_type: 'Paddy (BPT 5204)',
      crop_variety: 'BPT 5204',
      sowing_date: new Date(Date.now() - 45 * 86400000).toISOString().split('T')[0],
      crop_stage: 'Tillering to Panicle Initiation',
      growth_stage: 'Tillering to Panicle Initiation',
      area: 3.5,
      latitude: 16.3067,
      longitude: 80.4365,
      soil_type: 'Clay Loam',
      irrigation_type: 'Canal',
      is_demo: true
    });

    return {
      handled: true,
      replyText: `🧪 *Demo Mode Active — Test Field Registered!*

• *Field ID*: \`${demoField.id}\`
• *Farmer*: ${demoFarmer.display_name}
• *Crop*: Paddy (BPT 5204) — Tillering Stage
• *Location*: 📍 Guntur Rural (16.3067, 80.4365)
• *Soil & Water*: Clay Loam, Canal Irrigation

✅ Live Open-Meteo weather telemetry and agro-risk engine are linked. You can now send crop questions or leaf photos!`
    };
  }

  // 4. Initiate New Onboarding Flow
  if (isRegistrationTrigger(lowerText, interactiveButtonId)) {
    const isMinimalFlow = lowerText.includes('want to register') || lowerText === 'register field' || interactiveButtonId === 'btn_register' || (farmer && farmer.display_name && !farmer.display_name.startsWith('Farmer '));

    if (isMinimalFlow) {
      state = {
        step: 'AWAITING_CROP',
        is_minimal: true,
        draft_field: {
          farmer_id: farmer?.id || null,
          phone_number: cleanPhone
        }
      };
      assessmentStore.setOnboardingState(cleanPhone, state);
      const cropPrompt = languageService.getCropSelectionPrompt(currentLang);
      const replyMsg = currentLang === 'en'
        ? `Welcome to AgriGuard AI. Which crop are you growing?`
        : cropPrompt.text;

      return {
        handled: true,
        replyText: replyMsg,
        buttons: cropPrompt.buttons
      };
    } else {
      state = {
        step: 'AWAITING_NAME',
        is_minimal: false,
        draft_field: {
          phone_number: cleanPhone
        }
      };
      assessmentStore.setOnboardingState(cleanPhone, state);
      return {
        handled: true,
        replyText: `🌾 *Welcome to AgriGuard Field Registration!*

*Step 1/6: Farmer Name*
What is your full name?
(Or reply *skip* to remain identified by your phone number)

_Tip: Reply *cancel* anytime to abort._`
      };
    }
  }

  // If no onboarding is active, return handled: false to allow normal processing
  if (!state || !state.step) {
    return { handled: false };
  }

  const isSkip = lowerText === 'skip' || lowerText === 'pass' || lowerText === 'next';

  // ─── STEP 1: AWAITING_NAME ───
  if (state.step === 'AWAITING_NAME') {
    let name = 'Farmer ' + cleanPhone.slice(-4);
    if (!isSkip) {
      const cleanName = messageText.replace(/[•*_\s]+/g, ' ').trim();
      if (cleanName.length >= 2 && cleanName.length <= 50) {
        name = cleanName;
      }
    }

    farmer = assessmentStore.saveFarmer({
      phone_number: cleanPhone,
      display_name: name,
      name: name
    });

    state.draft_field.farmer_id = farmer.id;
    state.step = 'AWAITING_CROP';
    assessmentStore.setOnboardingState(cleanPhone, state);

    return {
      handled: true,
      replyText: `Pleasure to meet you, *${name}*! 👍

🌾 *Step 2/6: Crop Name*
What crop are you cultivating in this field?
(e.g., *Paddy*, *Cotton*, *Tomato*, *Chili*, *Maize*)`
    };
  }

  // ─── STEP 2: AWAITING_CROP ───
  if (state.step === 'AWAITING_CROP') {
    let cropName = currentLang === 'te' ? 'వరి' : 'Paddy';
    if (interactiveButtonId === 'crop_paddy') {
      cropName = currentLang === 'te' ? 'వరి (Paddy)' : (currentLang === 'hi' ? 'धान (Paddy)' : 'Paddy');
    } else if (interactiveButtonId === 'crop_cotton') {
      cropName = currentLang === 'te' ? 'పత్తి (Cotton)' : (currentLang === 'hi' ? 'कपास (Cotton)' : 'Cotton');
    } else if (interactiveButtonId === 'crop_chili') {
      cropName = currentLang === 'te' ? 'మిరప (Chili)' : (currentLang === 'hi' ? 'मिर्च (Chili)' : 'Chili');
    } else if (!isSkip) {
      const detected = RECOGNIZED_CROPS.find(c => lowerText.includes(c));
      if (detected) {
        cropName = detected.charAt(0).toUpperCase() + detected.slice(1);
        if (detected === 'rice' || detected === 'వరి' || detected === 'धान' || detected === 'चावल') {
          cropName = currentLang === 'te' ? 'వరి (Paddy)' : 'Paddy';
        }
        if (detected === 'cotton' || detected === 'పత్తి' || detected === 'कपास') {
          cropName = currentLang === 'te' ? 'పత్తి (Cotton)' : 'Cotton';
        }
        if (detected === 'mirchi' || detected === 'chili' || detected === 'chilli' || detected === 'మిరప' || detected === 'మిర్చి' || detected === 'मिर्च') {
          cropName = currentLang === 'te' ? 'మిరప (Chili)' : 'Chili';
        }
      } else {
        cropName = messageText.trim().slice(0, 40);
      }
    }

    state.draft_field.crop_name = cropName;
    state.draft_field.crop_type = cropName;

    if (state.is_minimal) {
      state.step = 'AWAITING_LOCATION';
      assessmentStore.setOnboardingState(cleanPhone, state);
      const locPrompt = languageService.getLocationPrompt(currentLang, cropName);
      return {
        handled: true,
        replyText: locPrompt.text,
        buttons: locPrompt.buttons || []
      };
    } else {
      state.step = 'AWAITING_SOWING_DATE';
      assessmentStore.setOnboardingState(cleanPhone, state);
      return {
        handled: true,
        replyText: `Got it, registered crop: *${cropName}*! 🌱\n\n📅 *Step 3/6: Sowing Date or Crop Age*\nWhen was this crop sown or transplanted?\n• Enter date: e.g. *2026-08-15*\n• OR approximate age: e.g. *45 days* or *Flowering stage*\n• Or reply *skip* to estimate later.`
      };
    }
  }

  // ─── STEP 3: AWAITING_SOWING_DATE ───
  if (state.step === 'AWAITING_SOWING_DATE') {
    if (interactiveButtonId === 'stage_seedling') {
      const estimatedDate = new Date(Date.now() - 20 * 86400000).toISOString().split('T')[0];
      state.draft_field.sowing_date = estimatedDate;
      state.draft_field.crop_stage = currentLang === 'te' ? 'నారు దశ (15-30 రోజులు)' : (currentLang === 'hi' ? 'अंकुरण अवस्था (15-30 दिन)' : 'Seedling (15-30 Days)');
      state.draft_field.growth_stage = state.draft_field.crop_stage;
    } else if (interactiveButtonId === 'stage_vegetative') {
      const estimatedDate = new Date(Date.now() - 45 * 86400000).toISOString().split('T')[0];
      state.draft_field.sowing_date = estimatedDate;
      state.draft_field.crop_stage = currentLang === 'te' ? 'శాకీయ దశ (1-2 నెలలు)' : (currentLang === 'hi' ? 'वानस्पतिक अवस्था (1-2 महीने)' : 'Vegetative (1-2 Months)');
      state.draft_field.growth_stage = state.draft_field.crop_stage;
    } else if (interactiveButtonId === 'stage_reproductive') {
      const estimatedDate = new Date(Date.now() - 75 * 86400000).toISOString().split('T')[0];
      state.draft_field.sowing_date = estimatedDate;
      state.draft_field.crop_stage = currentLang === 'te' ? 'పూత / గింజ దశ' : (currentLang === 'hi' ? 'फूल / दाना अवस्था' : 'Flowering / Reproductive');
      state.draft_field.growth_stage = state.draft_field.crop_stage;
    } else if (!isSkip) {
      const parsed = parseSowingInput(messageText);
      state.draft_field.sowing_date = parsed.sowing_date;
      state.draft_field.crop_stage = parsed.crop_stage;
      state.draft_field.growth_stage = parsed.crop_stage;
    } else {
      state.draft_field.sowing_date = null;
      state.draft_field.crop_stage = 'Vegetative';
      state.draft_field.growth_stage = 'Vegetative';
    }

    if (state.is_minimal) {
      if (!farmer) {
        farmer = assessmentStore.saveFarmer({
          phone_number: cleanPhone,
          display_name: 'Farmer ' + cleanPhone.slice(-4),
          preferred_language: currentLang
        });
      }

      const finalField = assessmentStore.saveField({
        farmer_id: farmer.id,
        phone_number: cleanPhone,
        field_name: `${state.draft_field.crop_name} Field`,
        crop_name: state.draft_field.crop_name,
        crop_type: state.draft_field.crop_name,
        crop_variety: state.draft_field.crop_variety || null,
        sowing_date: state.draft_field.sowing_date,
        latitude: state.draft_field.latitude,
        longitude: state.draft_field.longitude,
        area: 2.5,
        acreage: 2.5,
        soil_type: 'Clay Loam',
        irrigation_type: 'Canal',
        crop_stage: state.draft_field.crop_stage || 'Vegetative',
        growth_stage: state.draft_field.crop_stage || 'Vegetative'
      });

      assessmentStore.clearOnboardingState(cleanPhone);

      const locDisplay = (finalField.latitude && finalField.longitude)
        ? `${finalField.latitude.toFixed(4)}, ${finalField.longitude.toFixed(4)}`
        : (state.draft_field.village || (currentLang === 'te' ? 'లొకేషన్ నమోదు కాలేదు' : 'Location Pending'));

      const regComp = languageService.getRegistrationComplete(currentLang, {
        fieldId: finalField.id,
        farmerName: farmer.display_name,
        crop: finalField.crop_name,
        stage: finalField.crop_stage,
        location: locDisplay
      });

      return {
        handled: true,
        registeredField: finalField,
        replyText: regComp.text,
        buttons: regComp.buttons
      };
    }

    state.step = 'AWAITING_LOCATION';
    assessmentStore.setOnboardingState(cleanPhone, state);

    return {
      handled: true,
      replyText: `Sowing details saved! 📍

🗺️ *Step 4/6: Field Location*
Please share your field location so we can retrieve live weather:
• Tap 📎 (or +) ➔ *Location* ➔ *Send your location*
• OR type coordinates: e.g. *16.3067, 80.4365*
• OR type your Village / District: e.g. *Tenali, Guntur*
• Or reply *skip* if you do not have it now.`
    };
  }

  // ─── STEP 4: AWAITING_LOCATION ───
  if (state.step === 'AWAITING_LOCATION') {
    if (!isSkip) {
      const coords = parseCoordinates(messageText, locationObj);
      if (coords) {
        state.draft_field.latitude = coords.latitude;
        state.draft_field.longitude = coords.longitude;
        if (coords.placeName) state.draft_field.village = coords.placeName;
      } else {
        // Text village name without raw numbers
        state.draft_field.village = messageText.trim().slice(0, 60);
      }
    } else {
      state.draft_field.latitude = null;
      state.draft_field.longitude = null;
    }

    if (state.is_minimal) {
      state.step = 'AWAITING_SOWING_DATE';
      assessmentStore.setOnboardingState(cleanPhone, state);
      const stagePrompt = languageService.getCropStagePrompt(currentLang);
      return {
        handled: true,
        replyText: stagePrompt.text,
        buttons: stagePrompt.buttons
      };
    }

    state.step = 'AWAITING_PHOTO';
    assessmentStore.setOnboardingState(cleanPhone, state);

    return {
      handled: true,
      replyText: `Location details recorded! 📸

🌿 *Step 5/6: Optional Crop Photo*
Please share a photo of your field or crop foliage.
This creates a visual baseline for our disease intelligence engine.

_Reply *skip* if you do not have a photo right now._`
    };
  }

  // ─── STEP 5: AWAITING_PHOTO ───
  if (state.step === 'AWAITING_PHOTO') {
    if (mediaObj && mediaObj.id) {
      state.draft_field.has_baseline_photo = true;
      state.draft_field.photo_media_id = mediaObj.id;
    }

    state.step = 'AWAITING_SOIL_IRRIGATION';
    assessmentStore.setOnboardingState(cleanPhone, state);

    return {
      handled: true,
      replyText: `${mediaObj ? 'Photo attached! ✅\n\n' : ''}💧 *Step 6/6: Soil & Irrigation Details*
What type of soil and watering system is used?
(e.g., *Black soil, Drip* or *Clay loam, Canal* or *Red soil, Rainfed*)

_Reply *skip* to finish registration._`
    };
  }

  // ─── STEP 6: AWAITING_SOIL_IRRIGATION (FINAL) ───
  if (state.step === 'AWAITING_SOIL_IRRIGATION') {
    let soil = 'Loam';
    let irrigation = 'Rainfed';

    if (!isSkip) {
      const parsed = parseSoilAndIrrigation(messageText);
      soil = parsed.soil_type;
      irrigation = parsed.irrigation_type;
    }

    state.draft_field.soil_type = soil;
    state.draft_field.irrigation_type = irrigation;

    // Ensure farmer is linked
    if (!farmer) {
      farmer = assessmentStore.saveFarmer({
        phone_number: cleanPhone,
        display_name: 'Farmer ' + cleanPhone.slice(-4)
      });
    }

    // Save final field
    const finalField = assessmentStore.saveField({
      farmer_id: farmer.id,
      phone_number: cleanPhone,
      field_name: `${state.draft_field.crop_name} Plot`,
      crop_name: state.draft_field.crop_name,
      crop_type: state.draft_field.crop_name,
      crop_variety: state.draft_field.crop_variety || null,
      sowing_date: state.draft_field.sowing_date,
      latitude: state.draft_field.latitude,
      longitude: state.draft_field.longitude,
      area: 2.5,
      acreage: 2.5,
      soil_type: state.draft_field.soil_type,
      irrigation_type: state.draft_field.irrigation_type,
      crop_stage: state.draft_field.crop_stage || 'Vegetative',
      growth_stage: state.draft_field.crop_stage || 'Vegetative'
    });

    // If baseline photo was uploaded, save a field_report
    if (state.draft_field.has_baseline_photo) {
      assessmentStore.saveFieldReport({
        field_id: finalField.id,
        source_message_id: 'reg_photo_' + Date.now(),
        report_type: 'baseline_photo',
        description: `Baseline registration photo for ${finalField.crop_name} field.`,
        media_reference: state.draft_field.photo_media_id
      });
    }

    // Clear onboarding state
    assessmentStore.clearOnboardingState(cleanPhone);

    const locDisplay = (finalField.latitude && finalField.longitude)
      ? `${finalField.latitude.toFixed(4)}, ${finalField.longitude.toFixed(4)}`
      : (state.draft_field.village || 'Location Pending');

    return {
      handled: true,
      registeredField: finalField,
      replyText: `🎉 *Field Registration Complete!*

Here is your registered field profile:
• *Field ID*: \`${finalField.id}\`
• *Farmer*: ${farmer.display_name}
• *Crop*: ${finalField.crop_name} (${finalField.crop_stage})
• *Sowing Date*: ${finalField.sowing_date || 'Estimated'}
• *Location*: 📍 ${locDisplay}
• *Soil & Water*: ${finalField.soil_type} / ${finalField.irrigation_type}

🛡️ *AgriGuard AI is now actively monitoring this field.*
You can send crop questions, pest queries, or leaf photos anytime for proactive risk analysis!
_(To register another field, simply text "Register my field")_`
    };
  }

  return { handled: false };
}

module.exports = {
  isRegistrationTrigger,
  isDemoTrigger,
  isOnboardingActive,
  processOnboardingMessage,
  parseCoordinates,
  parseSowingInput,
  RECOGNIZED_CROPS
};
