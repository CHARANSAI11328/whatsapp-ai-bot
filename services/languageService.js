/**
 * AgriGuard AI — Multi-Language and Interactive Messaging Service
 * 
 * Provides first-class localization for Telugu (తెలుగు), Hindi (हिंदी), and English.
 * Formats interactive WhatsApp Cloud API button payloads for 1-click mobile responses,
 * eliminating the need for farmers to type long text messages.
 */

const LANGUAGES = {
  te: {
    code: 'te',
    name: 'తెలుగు (Telugu)',
    flag: '🌾'
  },
  en: {
    code: 'en',
    name: 'English',
    flag: '🇬🇧'
  },
  hi: {
    code: 'hi',
    name: 'हिंदी (Hindi)',
    flag: '🇮🇳'
  }
};

/**
 * Detect language selection from button ID or text input
 */
function detectLanguageChoice(input = '') {
  if (!input) return null;
  const clean = String(input).trim().toLowerCase();

  if (
    clean === 'lang_te' ||
    clean === 'te' ||
    clean === 'telugu' ||
    clean === 'తెలుగు' ||
    clean.includes('telugu') ||
    clean.includes('తెలుగు') ||
    clean === '2'
  ) {
    return 'te';
  }

  if (
    clean === 'lang_en' ||
    clean === 'en' ||
    clean === 'english' ||
    clean.includes('english') ||
    clean === '1'
  ) {
    return 'en';
  }

  if (
    clean === 'lang_hi' ||
    clean === 'hi' ||
    clean === 'hindi' ||
    clean === 'हिंदी' ||
    clean.includes('hindi') ||
    clean.includes('हिंदी') ||
    clean === '3'
  ) {
    return 'hi';
  }

  return null;
}

/**
 * Step 1: Initial Language Selection Prompt with 3 Interactive Buttons
 */
function getLanguagePrompt() {
  return {
    text: `🌾 *AgriGuard AI — Crop Management & Risk Agent*
*అగ్రిగార్డ్ AI — పంట నిర్వహణ & ప్రమాద నివారణ ఏజెంట్*
*एग्रीगार्ड AI — फसल प्रबंधन एवं जोखिम एजेंट*

Please select your language to continue:
దయచేసి మీ భాషను ఎంచుకోండి:
कृपया अपनी भाषा चुनें:`,
    buttons: [
      { id: 'lang_te', title: '🌾 తెలుగు (Telugu)' },
      { id: 'lang_en', title: '🇬🇧 English' },
      { id: 'lang_hi', title: '🇮🇳 हिंदी (Hindi)' }
    ]
  };
}

/**
 * Step 2: Language Confirmation & Main Action Menu
 */
function getMainMenu(lang = 'en') {
  if (lang === 'te') {
    return {
      text: `నమస్కారం! భాష: *తెలుగు* ఎంపిక చేయబడింది. ✅

🌾 *అగ్రిగార్డ్ AI — పంట నిర్వహణ & ప్రమాద నివారణ ఏజెంట్*
(Crop Management & Risk Agent)

మీ పంట వాతావరణం, తెగుళ్ల ప్రమాదం మరియు శాటిలైట్ పర్యవేక్షణ కోసం మీ పొలాన్ని నమోదు చేసుకోండి.

కింది బటన్‌ను నొక్కండి:`,
      buttons: [
        { id: 'btn_register', title: '🌾 పొలం నమోదు' },
        { id: 'btn_report_symptom', title: '📸 పంట సమస్య' },
        { id: 'btn_help', title: 'ℹ️ సహాయం' }
      ]
    };
  }

  if (lang === 'hi') {
    return {
      text: `नमस्ते! भाषा: *हिंदी* चुनी गई। ✅

🌾 *एग्रीगार्ड AI — फसल प्रबंधन एवं जोखिम एजेंट*
(Crop Management & Risk Agent)

अपने खेत के मौसम, कीट जोखिम और उपग्रह निगरानी के लिए अपने खेत को पंजीकृत करें।

नीचे दिए गए विकल्प पर टैप करें:`,
      buttons: [
        { id: 'btn_register', title: '🌾 खेत पंजीकरण' },
        { id: 'btn_report_symptom', title: '📸 फसल समस्या' },
        { id: 'btn_help', title: 'ℹ️ सहायता' }
      ]
    };
  }

  return {
    text: `Hello! Language set to: *English*. ✅

🌾 *AgriGuard AI — Crop Management & Risk Agent*

To monitor your field microclimate, disease vulnerability, and satellite indices, let's register your field.

Tap an option below:`,
    buttons: [
      { id: 'btn_register', title: '🌾 Register Field' },
      { id: 'btn_report_symptom', title: '📸 Report Issue' },
      { id: 'btn_help', title: 'ℹ️ Help & Info' }
    ]
  };
}

/**
 * Onboarding: Crop Selection with 3 1-Click Buttons
 */
function getCropSelectionPrompt(lang = 'en') {
  if (lang === 'te') {
    return {
      text: `🌾 *దశ 1/3: పంట ఎంపిక*
మీరు ఈ పొలంలో ఏ పంటను సాగు చేస్తున్నారు?
కింది బటన్ నొక్కండి లేదా మీ పంట పేరు టైప్ చేయండి:`,
      buttons: [
        { id: 'crop_paddy', title: '🌾 వరి (Paddy)' },
        { id: 'crop_cotton', title: '🌱 పత్తి (Cotton)' },
        { id: 'crop_chili', title: '🌶️ మిరప (Chili)' }
      ]
    };
  }

  if (lang === 'hi') {
    return {
      text: `🌾 *चरण 1/3: फसल चयन*
आप इस खेत में कौन सी फसल उगा रहे हैं?
नीचे दिए गए बटन पर टैप करें या फसल का नाम लिखें:`,
      buttons: [
        { id: 'crop_paddy', title: '🌾 धान (Paddy)' },
        { id: 'crop_cotton', title: '🌱 कपास (Cotton)' },
        { id: 'crop_chili', title: '🌶️ मिर्च (Chili)' }
      ]
    };
  }

  return {
    text: `🌾 *Step 1/3: Crop Selection*
Which crop are you cultivating in this field?
Tap a button below or type your crop name:`,
    buttons: [
      { id: 'crop_paddy', title: '🌾 Paddy (Rice)' },
      { id: 'crop_cotton', title: '🌱 Cotton' },
      { id: 'crop_chili', title: '🌶️ Chili' }
    ]
  };
}

/**
 * Onboarding: Field Location Prompt
 */
function getLocationPrompt(lang = 'en', cropName = 'Crop') {
  if (lang === 'te') {
    return {
      text: `చాలా మంచిది, *${cropName}*! 🌱

📍 *దశ 2/3: పొలం లొకేషన్*
మీ పొలం యొక్క ఖచ్చితమైన వాతావరణం మరియు వర్షపాతం పర్యవేక్షించడానికి లొకేషన్ షేర్ చేయండి:
• WhatsApp లో 📎 (లేదా +) నొక్కి *Location* పంపండి
• లేదా మీ గ్రామం / మండలం పేరు టైప్ చేయండి (ఉదా: బాపట్ల, గుంటూరు)
• లేదా దాటవేయడానికి *skip* అని పంపండి.`,
      buttons: []
    };
  }

  if (lang === 'hi') {
    return {
      text: `बहुत बढ़िया, *${cropName}*! 🌱

📍 *चरण 2/3: खेत का स्थान*
सटीक मौसम और वर्षा पूर्वानुमान के लिए स्थान साझा करें:
• WhatsApp पर 📎 ➔ *Location* पिन भेजें
• या अपने गांव / जिले का नाम लिखें
• या आगे बढ़ने के लिए *skip* लिखें।`,
      buttons: []
    };
  }

  return {
    text: `Got it, registered crop: *${cropName}*! 🌱

📍 *Step 2/3: Field Location*
Please share your field location for live microclimate & satellite telemetry:
• Tap 📎 ➔ *Location* to send a GPS pin
• OR enter coordinates: e.g. 16.3067, 80.4365
• OR type your Village / District (e.g., Tenali, Guntur)
• Or reply *skip* to add later.`,
    buttons: []
  };
}

/**
 * Onboarding: Crop Stage / Sowing Age with 3 1-Click Buttons
 */
function getCropStagePrompt(lang = 'en') {
  if (lang === 'te') {
    return {
      text: `లొకేషన్ వివరాలు నమోదయ్యాయి! 📍

📅 *దశ 3/3: పంట వయస్సు / దశ*
ఈ పంటను నాటి ఎంత కాలం అయింది? కింది బటన్ నొక్కండి:`,
      buttons: [
        { id: 'stage_seedling', title: '🌱 15-30 రోజులు' },
        { id: 'stage_vegetative', title: '🌿 1-2 నెలలు' },
        { id: 'stage_reproductive', title: '🌾 పూత / గింజ దశ' }
      ]
    };
  }

  if (lang === 'hi') {
    return {
      text: `स्थान दर्ज कर लिया गया! 📍

📅 *चरण 3/3: फसल की आयु / अवस्था*
फसल बोए कितना समय हुआ है? नीचे दिए गए विकल्प पर टैप करें:`,
      buttons: [
        { id: 'stage_seedling', title: '🌱 15-30 दिन' },
        { id: 'stage_vegetative', title: '🌿 1-2 महीने' },
        { id: 'stage_reproductive', title: '🌾 फूल / दाना अवस्था' }
      ]
    };
  }

  return {
    text: `Location details recorded! 📍

📅 *Step 3/3: Crop Stage / Sowing Age*
When was this crop sown or what is its growth stage? Tap a button:`,
    buttons: [
      { id: 'stage_seedling', title: '🌱 15-30 Days' },
      { id: 'stage_vegetative', title: '🌿 1-2 Months' },
      { id: 'stage_reproductive', title: '🌾 Flowering Stage' }
    ]
  };
}

/**
 * Onboarding: Field Registration Complete
 */
function getRegistrationComplete(lang = 'en', { fieldId, farmerName, crop, stage, location }) {
  if (lang === 'te') {
    return {
      text: `🎉 *పొలం నమోదు విజయవంతంగా పూర్తయింది!*

నమోదిత వివరాలు:
• *పొలం ID*: \`${fieldId}\`
• *రైతు*: ${farmerName}
• *పంట*: ${crop} (${stage})
• *లొకేషన్*: 📍 ${location}
• *భాష*: తెలుగు

🛡️ *అగ్రిగార్డ్ పంట నిర్వహణ & ప్రమాద నివారణ ఏజెంట్ (Crop Management & Risk Agent) ఇప్పుడు మీ పొలాన్ని 24/7 పర్యవేక్షిస్తుంది.*
మీ పంటకు ఏదైనా ఆకు తెగులు, రంగు మారడం లేదా పురుగు సమస్య ఉంటే వెంటనే ఫోటో పంపండి. శాటిలైట్ మరియు వాతావరణ విశ్లేషణతో తక్షణ సలహా అందుతుంది!
_(మరొక పొలాన్ని నమోదు చేయడానికి "Register my field" అని పంపండి)_`,
      buttons: [
        { id: 'btn_report_symptom', title: '📸 ఆకు ఫోటో పంపండి' },
        { id: 'btn_field_status', title: '📊 పొలం స్థితి' }
      ]
    };
  }

  if (lang === 'hi') {
    return {
      text: `🎉 *खेत पंजीकरण सफलतापूर्वक पूर्ण हुआ!*

पंजीकृत विवरण:
• *खेत ID*: \`${fieldId}\`
• *किसान*: ${farmerName}
• *फसल*: ${crop} (${stage})
• *स्थान*: 📍 ${location}
• *भाषा*: हिंदी

🛡️ *एग्रीगार्ड फसल प्रबंधन एवं जोखिम एजेंट (Crop Management & Risk Agent) अब आपके खेत की 24/7 निगरानी कर रहा है।*
किसी भी फसल समस्या या पत्ती की फोटो तुरंत भेजें। सटीक उपग्रह और मौसम सलाह प्राप्त होगी!
_(अन्य खेत पंजीकृत करने के लिए "Register my field" लिखें)_`,
      buttons: [
        { id: 'btn_report_symptom', title: '📸 पत्ती की फोटो भेजें' },
        { id: 'btn_field_status', title: '📊 खेत की स्थिति' }
      ]
    };
  }

  return {
    text: `🎉 *Field registration complete!*

Registered Field Profile:
• *Field ID*: \`${fieldId}\`
• *Farmer*: ${farmerName}
• *Crop*: ${crop} (${stage})
• *Location*: 📍 ${location}
• *Language*: English

🛡️ *AgriGuard Crop Management & Risk Agent is now actively monitoring this field.*
You can report crop symptoms or send leaf photos anytime for proactive risk analysis!
_(To register another field, simply text "Register my field")_`,
    buttons: [
      { id: 'btn_report_symptom', title: '📸 Send Leaf Photo' },
      { id: 'btn_field_status', title: '📊 Field Status' }
    ]
  };
}

/**
 * Non-Definitive Disclaimers
 */
function getDisclaimer(lang = 'en') {
  if (lang === 'te') {
    return 'ఈ విశ్లేషణ ప్రాథమిక పరిశీలన మాత్రమే, ఇది ప్రయోగశాల లేదా వ్యవసాయ శాస్త్ర నిర్ధారణ కాదు. మందులు పిచికారీ చేసే ముందు వ్యవసాయ అధికారిని సంప్రదించండి.';
  }
  if (lang === 'hi') {
    return 'यह विश्लेषण एक प्रारंभिक दृश्य अवलोकन है और यह कोई निश्चित प्रयोगशाला निदान नहीं है। किसी भी रासायनिक उपचार से पहले कृषि विस्तार अधिकारी से परामर्श लें।';
  }
  return 'This image analysis is a preliminary visual observation and does not constitute a definitive laboratory or agronomic diagnosis.';
}

/**
 * Evidence Request when Photo or Location is Missing
 */
function getMissingEvidencePrompt(lang = 'en') {
  if (lang === 'te') {
    return `సమాచారం తెలిపినందుకు ధన్యవాదాలు. ఖచ్చితమైన విశ్లేషణ కోసం మరికొన్ని వివరాలు అవసరం:
1. దయచేసి మీ పొలం లొకేషన్ పంపండి (వాతావరణం చూడటానికి).
2. ప్రభావితమైన ఆకుల స్పష్టమైన ఫోటో పంపండి.`;
  }
  if (lang === 'hi') {
    return `सूचना देने के लिए धन्यवाद। स्थिति का सही आकलन करने के लिए कुछ और जानकारी चाहिए:
1. कृपया अपने खेत का स्थान साझा करें (मौसम डेटा के लिए)।
2. प्रभावित पत्तियों की साफ फोटो भेजें।`;
  }
  return 'Thanks for reporting this. I need a few details to assess the situation. Please share your field location and, if possible, a clear photo of the affected leaves.';
}

/**
 * Localized Deterministic Crop Advisory Template
 */
function getAdvisoryFallback(lang = 'en', { overallRisk = 'MODERATE', cropName = 'Crop', temp = 26, humidity = 85, rainForecast = 0, hypotheses = [], missingEvidence = [], actions = [] }) {
  const icon = overallRisk === 'HIGH' ? '🔴' : (overallRisk === 'MODERATE' ? '🟡' : '🟢');
  const disclaimer = getDisclaimer(lang);

  if (lang === 'te') {
    const riskLabel = overallRisk === 'HIGH' ? 'అధిక ప్రమాదం (HIGH)' : (overallRisk === 'MODERATE' ? 'మధ్యస్థ ప్రమాదం (MODERATE)' : 'సాధారణం (LOW)');
    return `${icon} *అగ్రిగార్డ్ పంట సలహా*: ప్రమాద స్థాయి: *${riskLabel}* (${cropName} పంట).

*వాతావరణ సూచికలు*:
• ఉష్ణోగ్రత: ${temp}°C | గాలిలో తేమ: ${humidity}%
• రాబోయే వర్షపాతం: ${rainForecast}mm

*సాధ్యమయ్యే సమస్యలు (నిర్ధారించబడనివి)*:
${hypotheses.length ? hypotheses.map(h => `• ${h}`).join('\n') : '• అధిక తేమ వల్ల శిలీంధ్ర తెగుళ్ల అవకాశం'}

*తదుపరి చేయవలసిన పనులు*:
${actions.length ? actions.map(a => `• ${a}`).join('\n') : '• ఆకుల వెనుక భాగాన్ని పరిశీలించండి. స్థానిక వ్యవసాయ అధికారిని సంప్రదించండి.'}

_${disclaimer}_`;
  }

  if (lang === 'hi') {
    const riskLabel = overallRisk === 'HIGH' ? 'उच्च जोखिम (HIGH)' : (overallRisk === 'MODERATE' ? 'मध्यम जोखिम (MODERATE)' : 'सामान्य (LOW)');
    return `${icon} *एग्रीगार्ड फसल सलाह*: जोखिम स्तर: *${riskLabel}* (${cropName} फसल).

*मौसम संकेतक*:
• तापमान: ${temp}°C | आर्द्रता: ${humidity}%
• आगामी वर्षा: ${rainForecast}mm

*संभावित समस्याएं (अपुष्ट)*:
${hypotheses.length ? hypotheses.map(h => `• ${h}`).join('\n') : '• उच्च नमी के कारण फफूंद जनित रोगों की संभावना'}

*सुझाव*:
${actions.length ? actions.map(a => `• ${a}`).join('\n') : '• पत्तियों के पिछले हिस्से की जांच करें। कृषि विशेषज्ञ से संपर्क करें।'}

_${disclaimer}_`;
  }

  return `${icon} *AgriGuard Field Advisory*: Risk Level: *${overallRisk}* for ${cropName}.

*Weather Indicators*: Temp ${temp}°C, Humidity ${humidity}%, Rain forecast ${rainForecast}mm.

*Disease Hypotheses (Unconfirmed)*:
${hypotheses.length ? hypotheses.map(h => `• ${h}`).join('\n') : '• Fungal spore favorability due to prolonged humidity.'}

*Next Steps*:
${actions.length ? actions.map(a => `• ${a}`).join('\n') : '• Check underside of leaves for active lesions. Consult agricultural extension officer.'}

_${disclaimer}_`;
}

module.exports = {
  LANGUAGES,
  detectLanguageChoice,
  getLanguagePrompt,
  getMainMenu,
  getCropSelectionPrompt,
  getLocationPrompt,
  getCropStagePrompt,
  getRegistrationComplete,
  getDisclaimer,
  getMissingEvidencePrompt,
  getAdvisoryFallback
};
