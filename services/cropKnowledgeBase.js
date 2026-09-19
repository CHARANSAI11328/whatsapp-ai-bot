/**
 * AgriGuard AI — Prototype Crop & Disease Knowledge Base
 * 
 * DISCLAIMER:
 * These thresholds and risk indicators are PROVISIONAL PROTOTYPES based on documented 
 * agronomic extension literature (IRRI, ICAR-CRIDA, TNAU Agritech Portal).
 * They represent documented environmental vulnerability associations, NOT validated 
 * predictive epidemiological models.
 */

const CROP_KNOWLEDGE_BASE = {
  paddy: {
    canonical_name: 'Paddy (Oryza sativa)',
    aliases: ['paddy', 'rice', 'bpt', 'samba'],
    vulnerable_stages: {
      tillering: ['Blast', 'Brown Spot'],
      panicle_initiation: ['Rice Blast (Leaf & Collar)', 'Sheath Blight'],
      flowering: ['Neck Blast', 'False Smut'],
      grain_filling: ['Neck Blast', 'Grain Discoloration']
    },
    documented_environmental_drivers: [
      {
        pathogen_or_stress: 'Rice Blast (Magnaporthe oryzae)',
        favorable_temp_c: { min: 20.0, max: 28.0, optimum: 25.0 },
        favorable_humidity_min_percent: 85,
        favorable_leaf_wetness_hours_min: 14,
        source_reference: 'IRRI Rice Knowledge Bank (Leaf Blast microclimate favorability guidelines)',
        provisional_note: 'Provisional heuristic threshold for canopy microclimate screening.'
      },
      {
        pathogen_or_stress: 'Brown Spot (Bipolaris oryzae)',
        favorable_temp_c: { min: 25.0, max: 32.0, optimum: 28.0 },
        favorable_humidity_min_percent: 80,
        associated_soil_condition: 'Nutrient/potassium deficit or drought-stressed soil',
        source_reference: 'ICAR - Indian Institute of Rice Research (IIRR) Technical Bulletins',
        provisional_note: 'Provisional correlation.'
      }
    ],
    common_abiotic_lookalikes: [
      'Nitrogen deficiency (general uniform yellowing of lower leaves)',
      'Zinc deficiency (Khaira disease: rusty brown speckling)',
      'Submergence chlorosis following field water stagnation'
    ]
  },

  tomato: {
    canonical_name: 'Tomato (Solanum lycopersicum)',
    aliases: ['tomato', 'tamata'],
    vulnerable_stages: {
      vegetative: ['Early Blight', 'Damping Off'],
      flowering: ['Late Blight', 'Early Blight', 'Bacterial Canker'],
      fruit_formation: ['Late Blight', 'Fruit Rot', 'Blossom End Rot (Abiotic)']
    },
    documented_environmental_drivers: [
      {
        pathogen_or_stress: 'Late Blight (Phytophthora infestans)',
        favorable_temp_c: { min: 12.0, max: 24.0, optimum: 18.0 },
        favorable_humidity_min_percent: 85,
        favorable_leaf_wetness_hours_min: 10,
        source_reference: 'University of California IPM Guidelines for Tomato Late Blight (Smith & Fry microclimate model adaptation)',
        provisional_note: 'Provisional adaptation for tropical winter/mist conditions.'
      },
      {
        pathogen_or_stress: 'Early Blight (Alternaria solani)',
        favorable_temp_c: { min: 24.0, max: 32.0, optimum: 28.0 },
        favorable_humidity_min_percent: 80,
        favorable_leaf_wetness_hours_min: 8,
        source_reference: 'TNAU Agritech Portal: Tomato Crop Protection',
        provisional_note: 'Provisional threshold.'
      }
    ],
    common_abiotic_lookalikes: [
      'Blossom End Rot (Calcium immobility / irregular irrigation)',
      'Sunscald (white leathery patches from intense solar radiation)',
      'Magnesium deficiency (interveinal chlorosis on older leaves)'
    ]
  },

  cotton: {
    canonical_name: 'Cotton (Gossypium hirsutum)',
    aliases: ['cotton', 'patti', 'kapas'],
    vulnerable_stages: {
      seedling: ['Damping-off', 'Rhizoctonia Root Rot'],
      vegetative: ['Bacterial Blight (Angular Leaf Spot)', 'Alternaria'],
      flowering_boll: ['Boll Rot', 'Alternaria Macrospora', 'Thermal Square Shedding (Abiotic)']
    },
    documented_environmental_drivers: [
      {
        pathogen_or_stress: 'Bacterial Blight / Angular Leaf Spot (Xanthomonas citri pv. malvacearum)',
        favorable_temp_c: { min: 28.0, max: 36.0, optimum: 32.0 },
        favorable_humidity_min_percent: 80,
        associated_weather: 'Driving wind-blown rain and high daytime warmth',
        source_reference: 'ICAR - Central Institute for Cotton Research (CICR) Advisory Series',
        provisional_note: 'Provisional association.'
      },
      {
        pathogen_or_stress: 'Extreme Thermal Stress & Square Shedding',
        favorable_temp_c: { min: 38.0, max: 48.0, optimum: 40.0 },
        associated_weather: 'Daytime temperature > 38°C during peak flowering',
        source_reference: 'ICAR-CRIDA Agricultural Climatology Technical Note',
        provisional_note: 'Documented abiotic physiological limit.'
      }
    ],
    common_abiotic_lookalikes: [
      'Magnesium / Potassium reddening of foliage during boll development',
      'Heat shock desiccation and square drop',
      'Waterlogging induced root asphyxia in black clay soil'
    ]
  },

  chili: {
    canonical_name: 'Chili (Capsicum annuum)',
    aliases: ['chili', 'chilli', 'mirchi'],
    vulnerable_stages: {
      vegetative: ['Damping-off', 'Cercospora Leaf Spot'],
      flowering: ['Powdery Mildew', 'Thrips Vector Stress (Abiotic/Pest)'],
      fruiting: ['Anthracnose / Fruit Rot (Colletotrichum)', 'Dieback']
    },
    documented_environmental_drivers: [
      {
        pathogen_or_stress: 'Anthracnose / Fruit Rot / Dieback (Colletotrichum capsici)',
        favorable_temp_c: { min: 26.0, max: 32.0, optimum: 28.0 },
        favorable_humidity_min_percent: 85,
        favorable_leaf_wetness_hours_min: 12,
        source_reference: 'ICAR - Indian Institute of Horticultural Research (IIHR) Disease Guidelines',
        provisional_note: 'Provisional threshold.'
      }
    ],
    common_abiotic_lookalikes: [
      'Moisture stress leaf curl',
      'Sunscald on mature fruits',
      'Micronutrient boron deficiency'
    ]
  }
};

/**
 * Match incoming crop text to canonical knowledge profile
 */
function matchCropProfile(cropText = '', stageText = '') {
  const clean = (cropText || '').toLowerCase().trim();
  const cleanStage = (stageText || '').toLowerCase().trim();

  let matchedCropKey = null;
  for (const [key, profile] of Object.entries(CROP_KNOWLEDGE_BASE)) {
    if (profile.aliases.some(alias => clean.includes(alias))) {
      matchedCropKey = key;
      break;
    }
  }

  if (!matchedCropKey) {
    return {
      is_known: false,
      raw_crop_input: cropText,
      normalized_crop_name: cropText ? cropText.charAt(0).toUpperCase() + cropText.slice(1) : 'General Crop',
      normalized_stage: stageText || 'Active Growth',
      knowledge_profile: null,
      disclaimer: 'Crop not found in AgriGuard prototype knowledge base; applying general agronomic heuristics.'
    };
  }

  const profile = CROP_KNOWLEDGE_BASE[matchedCropKey];

  // Match stage
  let matchedStageKey = 'vegetative';
  if (cleanStage.includes('seedling') || cleanStage.includes('nursery')) matchedStageKey = 'seedling';
  else if (cleanStage.includes('tillering') || cleanStage.includes('vegetative')) matchedStageKey = 'tillering';
  else if (cleanStage.includes('flower') || cleanStage.includes('bloom')) matchedStageKey = 'flowering';
  else if (cleanStage.includes('boll') || cleanStage.includes('fruit')) matchedStageKey = 'flowering_boll';
  else if (cleanStage.includes('panicle')) matchedStageKey = 'panicle_initiation';
  else if (cleanStage.includes('grain') || cleanStage.includes('harvest')) matchedStageKey = 'grain_filling';

  const knownVulnerabilities = profile.vulnerable_stages[matchedStageKey] || profile.vulnerable_stages.vegetative || [];

  return {
    is_known: true,
    crop_key: matchedCropKey,
    raw_crop_input: cropText,
    normalized_crop_name: profile.canonical_name,
    normalized_stage: stageText || matchedStageKey,
    vulnerable_diseases: knownVulnerabilities,
    environmental_drivers: profile.documented_environmental_drivers,
    abiotic_lookalikes: profile.common_abiotic_lookalikes,
    knowledge_profile: profile
  };
}

module.exports = {
  CROP_KNOWLEDGE_BASE,
  matchCropProfile
};
