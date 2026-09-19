/**
 * AgriGuard AI — Multi-Agent Orchestrator & Transparent Risk Engine
 * 
 * Implements the 6 Agent Roles:
 * 1. Intake Agent
 * 2. Data Collection Agent
 * 3. Crop Context Agent
 * 4. Risk Assessment Engine
 * 5. Evidence & Explanation Agent
 * 6. Notification Agent
 * 
 * Strict Principle:
 * Never declares a disease with certainty.
 * Returns strict JSON risk output distinguishing evidence, stress, hypotheses, and actions.
 */

const { matchCropProfile } = require('./cropKnowledgeBase');
const weatherService = require('./weatherService');
const vegetationService = require('./vegetationService');
const assessmentStore = require('./assessmentStore');

// ─────────────────────────────────────────────────────────────────
// ROLE 1: INTAKE AGENT
// ─────────────────────────────────────────────────────────────────
function intakeAgent(params = {}) {
  const {
    farmer = null,
    field = null,
    messageText = '',
    mediaObj = null,
    locationObj = null,
    photoAnalysis = null
  } = params;

  const hasPhoto = !!(mediaObj && (mediaObj.type === 'image' || mediaObj.id)) || !!photoAnalysis;
  const hasLocation = !!(locationObj && locationObj.latitude && locationObj.longitude) ||
                      !!(field && field.latitude && field.longitude);

  return {
    farmer_id: farmer?.id || null,
    farmer_name: farmer?.display_name || farmer?.name || 'Unknown Farmer',
    phone_number: farmer?.phone_number || null,
    field_id: field?.id || null,
    field_name: field?.field_name || (field?.crop_name ? `${field.crop_name} Field` : null),
    crop_name_raw: field?.crop_name || field?.crop_type || null,
    crop_stage_raw: field?.crop_stage || field?.growth_stage || null,
    latitude: locationObj?.latitude || field?.latitude || null,
    longitude: locationObj?.longitude || field?.longitude || null,
    farmer_reported_text: messageText || '',
    has_photo: hasPhoto,
    photo_media_id: mediaObj?.id || null,
    photo_analysis: photoAnalysis || null,
    intake_timestamp: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────────────────────────
// ROLE 2: DATA COLLECTION AGENT
// ─────────────────────────────────────────────────────────────────
async function dataCollectionAgent(intakeData, preloadedWeather = null, preloadedVegetation = null) {
  const lat = intakeData.latitude;
  const lon = intakeData.longitude;

  // Retrieve weather telemetry or use preloaded
  let weather = preloadedWeather;
  if (!weather) {
    weather = await weatherService.getLiveWeatherData(lat, lon);
  }

  // Retrieve vegetation telemetry or use preloaded
  let vegetation = preloadedVegetation;
  if (!vegetation) {
    const fieldObj = {
      latitude: lat,
      longitude: lon,
      crop_type: intakeData.crop_name_raw,
      growth_stage: intakeData.crop_stage_raw
    };
    vegetation = await vegetationService.getVegetationIndicators(fieldObj, weather);
  }

  // Build structured evidence items
  const evidenceItems = [];

  // 1. Crop Profile Evidence
  evidenceItems.push({
    type: 'crop_profile',
    observation: intakeData.crop_name_raw 
      ? `Cultivating ${intakeData.crop_name_raw} in ${intakeData.crop_stage_raw || 'unspecified'} stage`
      : 'Crop profile is unassigned or incomplete',
    source: 'Farmer Profile & Field Registry',
    timestamp: intakeData.intake_timestamp,
    quality: intakeData.crop_name_raw ? 'good' : 'poor'
  });

  // 2. Farmer Inbound Report Evidence
  if (intakeData.farmer_reported_text) {
    evidenceItems.push({
      type: 'farmer_report',
      observation: `Farmer statement: "${intakeData.farmer_reported_text}"`,
      source: 'Inbound WhatsApp Message',
      timestamp: intakeData.intake_timestamp,
      quality: 'good'
    });
  }

  // 3. Photo Evidence (Enriched with Multimodal Vision Output)
  if (intakeData.has_photo) {
    const pa = intakeData.photo_analysis;
    const photoQuality = pa ? (pa.image_quality === 'good' ? 'good' : (pa.image_quality === 'invalid' ? 'poor' : 'limited')) : 'good';
    const photoObs = (pa && pa.visible_symptoms && pa.visible_symptoms.length > 0)
      ? `Observed visual symptoms: ${pa.visible_symptoms.join('; ')} [Quality: ${pa.image_quality || 'unassessed'}]`
      : 'Close-up crop photo attached for visual symptom inspection';

    evidenceItems.push({
      type: 'image',
      observation: photoObs,
      source: pa ? 'Gemini Multimodal Vision Agent' : 'WhatsApp Image Attachment',
      timestamp: intakeData.intake_timestamp,
      quality: photoQuality,
      multimodal_analysis: pa || null
    });
  }

  // 4. Weather Evidence
  const weatherQuality = (weather.data_quality?.status === 'live') ? 'good' : (weather.data_quality?.status === 'cached' ? 'limited' : 'poor');
  if (weather.data_quality?.status === 'unavailable' || weather.observations?.temperature === null) {
    evidenceItems.push({
      type: 'weather',
      observation: 'Weather station telemetry unavailable for field coordinates',
      source: weather.source || 'Open-Meteo Weather API',
      timestamp: weather.retrieved_at || null,
      quality: 'poor'
    });
  } else {
    evidenceItems.push({
      type: 'weather',
      observation: `Ambient Temp: ${weather.observations.temperature}°C, RH: ${weather.observations.relative_humidity}%, Rain today: ${weather.observations.precipitation}mm, Rain past 48h: ${weather.observations.accumulated_past_48h_precipitation}mm, 72h Rain forecast: ${weather.observations.forecast_rain_next_3_days}mm`,
      source: weather.source,
      timestamp: weather.retrieved_at,
      quality: weatherQuality
    });
  }

  // 5. Vegetation Evidence
  const vegQuality = (vegetation.status === 'live' && vegetation.quality?.usable) ? 'good' : (vegetation.status === 'sample' ? 'limited' : 'poor');
  if (vegetation.status === 'unavailable' || !vegetation.quality?.usable) {
    evidenceItems.push({
      type: 'vegetation',
      observation: vegetation.quality?.cloud_rejection 
        ? `Satellite pass occluded by cloud contamination (${vegetation.quality.cloud_cover_percent}% cover)`
        : 'Vegetation satellite observation unavailable',
      source: vegetation.source || 'Copernicus Sentinel-2 Grid',
      timestamp: null,
      quality: 'poor'
    });
  } else {
    evidenceItems.push({
      type: 'vegetation',
      observation: `Current NDVI: ${vegetation.features.current_ndvi}, Previous NDVI: ${vegetation.features.previous_ndvi}, Change: ${vegetation.features.ndvi_change}, Biomass status: ${vegetation.features.canopy_vigor}`,
      source: vegetation.source,
      timestamp: vegetation.observations?.[1]?.timestamp || vegetation.observations?.[0]?.timestamp || null,
      quality: vegQuality
    });
  }

  return {
    weather,
    vegetation,
    evidenceItems
  };
}

// ─────────────────────────────────────────────────────────────────
// ROLE 3: CROP CONTEXT AGENT
// ─────────────────────────────────────────────────────────────────
function cropContextAgent(cropNameRaw, cropStageRaw) {
  const matched = matchCropProfile(cropNameRaw, cropStageRaw);
  return matched;
}

// ─────────────────────────────────────────────────────────────────
// ROLE 4: TRANSPARENT RISK ASSESSMENT ENGINE
// ─────────────────────────────────────────────────────────────────
function calculateAgronomicRisk(intakeData, dataCollectionResult, cropContext) {
  const { weather, vegetation, evidenceItems } = dataCollectionResult;
  const obs = weather.observations || {};
  const vegFeatures = vegetation.features || {};
  const isVegUsable = vegetation.quality?.usable === true;

  const riskFactors = [];
  const alternativeExplanations = [];
  const missingInformation = [];
  const recommendedNextActions = [];
  const confidenceBasis = [];

  // Check critical missing context
  if (!intakeData.crop_name_raw || !cropContext.is_known) {
    missingInformation.push('Accurate crop species classification (e.g. Paddy, Cotton, Tomato, Chili)');
  }
  if (!intakeData.latitude || !intakeData.longitude) {
    missingInformation.push('Verified field GPS coordinates or location pin');
  }
  if (weather.data_quality?.status === 'unavailable' || obs.temperature === null) {
    missingInformation.push('Live weather station telemetry for field coordinates');
  }
  if (!intakeData.has_photo) {
    missingInformation.push('Close-up photograph of symptomatic leaf foliage and under-leaf surface');
  }

  // If both crop and weather are missing -> INSUFFICIENT EVIDENCE
  if ((!intakeData.crop_name_raw || !cropContext.is_known) && (weather.data_quality?.status === 'unavailable' || obs.temperature === null)) {
    return {
      risk_category: 'insufficient_evidence',
      assessment_scope: 'crop_stress',
      confidence: {
        level: 'low',
        basis: ['Crop species and weather telemetry are both missing. Cannot evaluate disease risk.']
      },
      evidence: evidenceItems,
      risk_factors: ['Insufficient agronomic and environmental field context'],
      alternative_explanations: ['General physiological variation', 'Environmental stress of undetermined origin'],
      missing_information: missingInformation,
      recommended_next_action: [
        'Register your field crop and share a location pin to enable microclimate risk tracking.',
        'Send a photo of any leaf showing discoloration for visual inspection.'
      ],
      alert_eligibility: 'none',
      disclaimer: 'AgriGuard AI requires crop species and verified location coordinates before evaluating disease vulnerability.'
    };
  }

  let riskCategory = 'low';
  let assessmentScope = 'environmental_risk';
  let numericScore = 15;

  // Evaluate Environmental Indicators
  if (obs.temperature !== null && obs.relative_humidity !== null) {
    confidenceBasis.push(`Real-time weather station observations verified (${obs.temperature}°C, ${obs.relative_humidity}% RH)`);

    // High Humidity & Rain
    if (obs.relative_humidity >= 85) {
      numericScore += 30;
      riskFactors.push(`High canopy relative humidity (${obs.relative_humidity}%) exceeding provisional pathogen threshold (85%)`);
    }

    // Accumulated Rain & Splash
    if ((obs.accumulated_past_48h_precipitation || 0) > 4.0 || (obs.forecast_rain_next_3_days || 0) > 10.0) {
      numericScore += 25;
      riskFactors.push(`Persistent moisture: ${(obs.accumulated_past_48h_precipitation || 0)}mm past 48h rain + ${(obs.forecast_rain_next_3_days || 0)}mm forecast creates extended leaf wetness`);
    }

    // High Heat
    if (obs.temperature >= 38.0) {
      numericScore += 35;
      assessmentScope = 'crop_stress';
      riskFactors.push(`Extreme thermal stress (${obs.temperature}°C) exceeding physiological photosynthetic threshold (38°C)`);
      alternativeExplanations.push('Pollen desiccation and flower square shedding due to daytime heat shock (Abiotic)');
    }
  }

  // Correlate with Crop Knowledge Base Drivers
  if (cropContext.is_known && cropContext.environmental_drivers) {
    confidenceBasis.push(`Matched crop to ${cropContext.normalized_crop_name} extension knowledge rules`);

    for (const driver of cropContext.environmental_drivers) {
      if (driver.favorable_temp_c && obs.temperature !== null) {
        if (obs.temperature >= driver.favorable_temp_c.min && obs.temperature <= driver.favorable_temp_c.max) {
          if (obs.relative_humidity >= (driver.favorable_humidity_min_percent || 80)) {
            numericScore += 25;
            assessmentScope = 'disease_hypothesis';
            riskFactors.push(`Environmental microclimate highly favorable for ${driver.pathogen_or_stress} (${driver.source_reference})`);
          }
        }
      }
    }

    // Include documented abiotic lookalikes
    if (cropContext.abiotic_lookalikes) {
      alternativeExplanations.push(...cropContext.abiotic_lookalikes);
    }
  }

  // Evaluate Vegetation Index (Only if quality is usable!)
  if (isVegUsable && vegFeatures.current_ndvi !== null) {
    confidenceBasis.push(`Satellite vegetation index available (NDVI: ${vegFeatures.current_ndvi}, Trend: ${vegFeatures.trend})`);
    if (vegFeatures.ndvi_change !== null && vegFeatures.ndvi_change <= -0.08) {
      numericScore += 15;
      riskFactors.push(`Vegetation index shows significant biomass decline (Δ NDVI: ${vegFeatures.ndvi_change})`);
      alternativeExplanations.push('Biomass decline caused by soil moisture depletion or nutrient deficiency');
    }
  } else {
    alternativeExplanations.push('Vegetation index unavailable or occluded by cloud cover; optical canopy confirmation absent');
  }

  // Evaluate Farmer Inbound Text
  const textLower = intakeData.farmer_reported_text.toLowerCase();
  let foliarSymptomFlagged = false;
  if (textLower.includes('spot') || textLower.includes('yellow') || textLower.includes('lesion') || textLower.includes('dry') || textLower.includes('burn')) {
    numericScore += 15;
    foliarSymptomFlagged = true;
    confidenceBasis.push('Farmer reported physical foliar symptoms corroborating potential stress');
  }

  // Evaluate Multimodal Photo Vision Findings
  if (intakeData.photo_analysis) {
    const pa = intakeData.photo_analysis;
    if (pa.visible_symptoms && pa.visible_symptoms.length > 0) {
      if (!foliarSymptomFlagged) {
        numericScore += 15;
      }
      confidenceBasis.push(`Multimodal vision identified foliar patterns: ${pa.visible_symptoms.slice(0, 2).join('; ')}`);
    }
    if (pa.possible_explanations && pa.possible_explanations.length > 0) {
      alternativeExplanations.push(...pa.possible_explanations);
    }
    if (pa.missing_evidence && pa.missing_evidence.length > 0) {
      missingInformation.push(...pa.missing_evidence);
    }
    if (pa.image_quality && pa.image_quality !== 'good') {
      missingInformation.push(`Higher-resolution close-up photo (current image quality: ${pa.image_quality})`);
    }
  }

  // Determine Risk Category
  if (numericScore >= 75) {
    riskCategory = 'high';
  } else if (numericScore >= 45) {
    riskCategory = 'moderate';
  } else if (weather.data_quality?.status === 'unavailable' || obs.temperature === null || !intakeData.latitude) {
    riskCategory = 'insufficient_evidence';
  } else {
    riskCategory = 'low';
  }

  // Determine Confidence Level
  let confidenceLevel = 'medium';
  if (confidenceBasis.length >= 3 && intakeData.has_photo) {
    confidenceLevel = 'high';
  } else if (confidenceBasis.length <= 1 || weather.data_quality?.status === 'unavailable' || riskCategory === 'insufficient_evidence') {
    confidenceLevel = 'low';
  }

  // Recommended Next Actions (Conservative, Non-Chemical first)
  recommendedNextActions.push('Scout 10 randomized plants diagonally across field to check if symptoms are localized or widespread.');
  recommendedNextActions.push('Inspect the underside of discolored leaves with a hand lens for active spores or fungal webbing.');
  if (obs.relative_humidity >= 85) {
    recommendedNextActions.push('Avoid working in wet fields or evening overhead irrigation to reduce canopy wetness duration.');
  }
  recommendedNextActions.push('Do NOT apply chemical fungicides or pesticides until physical symptoms are verified by a certified agricultural extension officer.');

  // Alert Eligibility Policy
  let alertEligibility = 'none';
  if (riskCategory === 'high') {
    if (confidenceLevel === 'high' && isVegUsable) {
      alertEligibility = 'eligible_under_policy';
    } else {
      alertEligibility = 'review_required';
    }
  }

  return {
    risk_category: riskCategory,
    assessment_scope: assessmentScope,
    confidence: {
      level: confidenceLevel,
      basis: confidenceBasis
    },
    evidence: evidenceItems,
    risk_factors: riskFactors.length > 0 ? riskFactors : ['Baseline background microclimate parameters within normal bounds.'],
    alternative_explanations: alternativeExplanations.length > 0 ? alternativeExplanations : ['Normal seasonal senescence or crop physiological acclimation'],
    missing_information: missingInformation,
    recommended_next_action: recommendedNextActions,
    alert_eligibility: alertEligibility,
    disclaimer: 'AgriGuard AI provides provisional environmental risk screening based on documented agronomic rules. It is NOT a laboratory or microscopically verified disease diagnosis.'
  };
}

// ─────────────────────────────────────────────────────────────────
// ROLE 5: EVIDENCE & EXPLANATION AGENT (GEMINI SYNTHESIS + VALIDATOR)
// ─────────────────────────────────────────────────────────────────
async function explanationAgent(ai, geminiModel, assessmentData, intakeData) {
  if (assessmentData.risk_category === 'insufficient_evidence') {
    return `I could not confirm a specific crop disease from the available information. Some conditions may increase crop stress risk, but more evidence is needed. Please share a clear photo and confirm the crop stage. You can also check the affected area in the field.

• *Missing Evidence*: ${assessmentData.missing_information?.slice(0, 2).join('; ') || 'Clear photo and verified crop stage'}
• *Recommended Action*: ${assessmentData.recommended_next_action?.[0] || 'Check affected area in field and share leaf photos.'}

_${assessmentData.disclaimer || 'This provisional assessment is not a definitive agronomic diagnosis.'}_`;
  }

  const icon = assessmentData.risk_category === 'high' ? '🔴' : (assessmentData.risk_category === 'moderate' ? '🟡' : (assessmentData.risk_category === 'low' ? '🟢' : '⚪'));
  const fallbackSummary = `${icon} *AgriGuard Risk Assessment*: Risk Level: *${assessmentData.risk_category.toUpperCase()}* (${assessmentData.assessment_scope.replace('_', ' ')}).
\n*Key Risk Factors*: ${assessmentData.risk_factors.slice(0, 2).join('; ')}.
\n*Alternative Explanations*: ${assessmentData.alternative_explanations.slice(0, 2).join('; ')}.
\n*Missing Evidence*: ${assessmentData.missing_information.slice(0, 2).join('; ') || 'None'}.
\n*Next Steps*: ${assessmentData.recommended_next_action[0]}
\n_${assessmentData.disclaimer || 'This provisional assessment is not a definitive agronomic diagnosis.'}_`;

  if (!ai) {
    return fallbackSummary;
  }

  const prompt = `You are AgriGuard AI's Evidence and Explanation Agent.
Produce a farmer-friendly, concise WhatsApp advisory based strictly on this validated assessment:
${JSON.stringify(assessmentData, null, 2)}

STRICT SAFETY RULES:
1. If risk_category is 'insufficient_evidence', open with:
"I could not confirm a specific crop disease from the available information. Some conditions may increase crop stress risk, but more evidence is needed. Please share a clear photo and confirm the crop stage. You can also check the affected area in the field."
2. NEVER declare a disease as confirmed. Always state it is an unconfirmed hypothesis or environmental risk factor.
3. Clearly distinguish observed facts, calculated risk factors, alternative explanations, and missing evidence.
4. Highlight safe non-chemical verification steps before spraying.
5. Keep under 200 words. Format with bold headers and bullet points.`;

  try {
    const response = await ai.models.generateContent({
      model: geminiModel || 'gemini-2.5-flash',
      config: { temperature: 0.2 },
      contents: [prompt]
    });
    const reply = response.text?.trim() || response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (reply && reply.length > 40) {
      return reply;
    }
  } catch (err) {
    console.error('[AgriGuard Explanation Agent] Gemini generation error:', err.message);
  }

  return fallbackSummary;
}

// ─────────────────────────────────────────────────────────────────
// ROLE 6: NOTIFICATION AGENT (ALERT ENFORCEMENT & DEDUPLICATION)
// ─────────────────────────────────────────────────────────────────
function notificationAgent(assessment, fieldId, assessmentStoreInstance = assessmentStore) {
  // Enforce conservative policy:
  // Do NOT alert if risk is low or insufficient evidence
  if (assessment.risk_category === 'low' || assessment.risk_category === 'insufficient_evidence') {
    return {
      send_alert: false,
      alert_eligible: false,
      suppressed: true,
      reason: 'Risk level is low or evidence is insufficient for proactive alert.'
    };
  }

  // Prevent duplicate alerts: check existing alerts for same field within past 24 hours
  if (fieldId) {
    const alerts = assessmentStoreInstance.getAlerts();
    const oneDayAgo = new Date(Date.now() - 24 * 3600000);
    const existingRecentAlert = alerts.find(a => 
      (a.field_id === fieldId || a.assessment_id === assessment.assessment_id) && 
      new Date(a.triggered_at) > oneDayAgo &&
      a.status !== 'Dismissed'
    );

    if (existingRecentAlert) {
      return {
        send_alert: false,
        reason: `Duplicate alert suppressed: Recent alert (${existingRecentAlert.id}) already active for this field within past 24 hours.`
      };
    }
  }

  return {
    send_alert: true,
    alert_eligibility: assessment.alert_eligibility,
    status: assessment.alert_eligibility === 'eligible_under_policy' ? 'Verified' : 'Pending'
  };
}

// ─────────────────────────────────────────────────────────────────
// MASTER ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────
async function orchestrateCropRiskAssessment(params = {}, services = {}) {
  const {
    farmer = null,
    field = null,
    messageText = '',
    mediaObj = null,
    locationObj = null,
    preloadedWeather = null,
    preloadedVegetation = null,
    photoAnalysis = null,
    ai = null,
    geminiModel = 'gemini-2.5-flash'
  } = params;

  // Step 1: Intake Agent
  const intake = intakeAgent({ farmer, field, messageText, mediaObj, locationObj, photoAnalysis });

  // Step 2: Data Collection Agent
  const dataCollection = await dataCollectionAgent(intake, preloadedWeather, preloadedVegetation);

  // Step 3: Crop Context Agent
  const cropContext = cropContextAgent(intake.crop_name_raw, intake.crop_stage_raw);

  // Step 4: Risk Assessment Engine
  const calculatedRisk = calculateAgronomicRisk(intake, dataCollection, cropContext);

  const assessmentId = 'asmt_' + Date.now();
  const fullAssessment = {
    field_id: intake.field_id || 'unassigned_field',
    assessment_id: assessmentId,
    ...calculatedRisk
  };

  // Step 5: Evidence and Explanation Agent
  const farmerExplanation = await explanationAgent(ai, geminiModel, fullAssessment, intake);
  fullAssessment.summary = farmerExplanation;

  // Step 6: Notification Agent
  const notificationDecision = notificationAgent(fullAssessment, intake.field_id);
  fullAssessment.notification_decision = notificationDecision;

  return fullAssessment;
}

// Backward-compatibility wrapper for evaluateCropRisk
function evaluateCropRisk(field = {}, weather = {}, vegetation = {}, photoAnalysis = null) {
  const safeField = field || {};
  const intake = intakeAgent({ 
    field: safeField, 
    messageText: photoAnalysis?.visualFindings || (photoAnalysis?.visible_symptoms ? photoAnalysis.visible_symptoms.join(', ') : ''),
    photoAnalysis 
  });
  const dataCollection = {
    weather: weather || {},
    vegetation: vegetation || {},
    evidenceItems: []
  };
  const cropContext = cropContextAgent(safeField.crop_name || safeField.crop_type, safeField.crop_stage || safeField.growth_stage);
  const result = calculateAgronomicRisk(intake, dataCollection, cropContext);

  return {
    overallRisk: result.risk_category.toUpperCase(),
    riskScore: result.risk_category === 'high' ? 85 : (result.risk_category === 'moderate' ? 60 : 25),
    confidenceScore: result.confidence.level === 'high' ? 0.90 : (result.confidence.level === 'medium' ? 0.70 : 0.40),
    triggeredRules: result.risk_factors.map((rf, idx) => ({
      ruleId: `RULE-${idx + 1}`,
      name: rf,
      severity: result.risk_category.toUpperCase(),
      description: rf
    })),
    environmentalRiskFactors: result.risk_factors,
    diseaseHypotheses: result.alternative_explanations.map(ae => ({ hypothesis: ae, confidence: 'Unconfirmed Hypothesis' })),
    missingEvidence: result.missing_information,
    recommendedVerificationActions: result.recommended_next_action,
    isConservativeAlert: result.alert_eligibility !== 'none',
    raw_orchestrated_assessment: result
  };
}

module.exports = {
  orchestrateCropRiskAssessment,
  evaluateCropRisk,
  intakeAgent,
  dataCollectionAgent,
  cropContextAgent,
  calculateAgronomicRisk,
  explanationAgent,
  notificationAgent
};
