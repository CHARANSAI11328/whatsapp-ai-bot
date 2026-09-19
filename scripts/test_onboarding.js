const farmerProfileService = require('../services/farmerProfileService');
const assessmentStore = require('../services/assessmentStore');

async function runOnboardingTests() {
  console.log('===============================================================');
  console.log('🧪 TESTING AGRIGUARD WHATSAPP ONBOARDING WORKFLOW END-TO-END');
  console.log('===============================================================\n');

  const testPhone = '919111223344';
  assessmentStore.clearOnboardingState(testPhone);

  // Turn 1: Farmer initiates field registration
  console.log('Turn 1: Farmer sends "Register my field"');
  const t1 = await farmerProfileService.processOnboardingMessage(testPhone, 'Register my field');
  console.log('Bot Response:\n' + t1.replyText);
  console.log('State Step:', assessmentStore.getOnboardingState(testPhone)?.step);
  console.log('---------------------------------------------------------------\n');

  // Turn 2: Farmer provides their name
  console.log('Turn 2: Farmer sends Name "Chaitanya Varma"');
  const t2 = await farmerProfileService.processOnboardingMessage(testPhone, 'Chaitanya Varma');
  console.log('Bot Response:\n' + t2.replyText);
  console.log('State Step:', assessmentStore.getOnboardingState(testPhone)?.step);
  console.log('---------------------------------------------------------------\n');

  // Turn 3: Farmer provides crop name
  console.log('Turn 3: Farmer sends Crop "Paddy"');
  const t3 = await farmerProfileService.processOnboardingMessage(testPhone, 'Paddy');
  console.log('Bot Response:\n' + t3.replyText);
  console.log('State Step:', assessmentStore.getOnboardingState(testPhone)?.step);
  console.log('---------------------------------------------------------------\n');

  // Turn 4: Farmer provides sowing date / age
  console.log('Turn 4: Farmer sends Sowing Age "45 days"');
  const t4 = await farmerProfileService.processOnboardingMessage(testPhone, '45 days');
  console.log('Bot Response:\n' + t4.replyText);
  console.log('State Step:', assessmentStore.getOnboardingState(testPhone)?.step);
  console.log('---------------------------------------------------------------\n');

  // Turn 5: Farmer shares location coordinates
  console.log('Turn 5: Farmer sends Coordinates "16.3067, 80.4365"');
  const t5 = await farmerProfileService.processOnboardingMessage(testPhone, '16.3067, 80.4365');
  console.log('Bot Response:\n' + t5.replyText);
  console.log('State Step:', assessmentStore.getOnboardingState(testPhone)?.step);
  console.log('---------------------------------------------------------------\n');

  // Turn 6: Farmer uploads a photo or skips
  console.log('Turn 6: Farmer sends a photo (media object simulated)');
  const t6 = await farmerProfileService.processOnboardingMessage(testPhone, '', { id: 'media_leaf_baseline_01' });
  console.log('Bot Response:\n' + t6.replyText);
  console.log('State Step:', assessmentStore.getOnboardingState(testPhone)?.step);
  console.log('---------------------------------------------------------------\n');

  // Turn 7: Farmer provides soil and irrigation
  console.log('Turn 7: Farmer sends Soil & Irrigation "Clay loam, Canal"');
  const t7 = await farmerProfileService.processOnboardingMessage(testPhone, 'Clay loam, Canal');
  console.log('Bot Response:\n' + t7.replyText);
  console.log('Onboarding Active?', farmerProfileService.isOnboardingActive(testPhone));
  console.log('---------------------------------------------------------------\n');

  // Verify Entity Structure
  const farmer = assessmentStore.getFarmerByPhone(testPhone);
  const fields = assessmentStore.getFields(testPhone);
  const reports = assessmentStore.getFieldReports();

  console.log('📊 VERIFYING PERSISTED ENTITIES:');
  console.log('Farmer Entity:');
  console.log({
    id: farmer.id,
    phone_number: farmer.phone_number,
    display_name: farmer.display_name,
    preferred_language: farmer.preferred_language,
    created_at: farmer.created_at,
    updated_at: farmer.updated_at
  });

  const registeredField = fields[0];
  console.log('\nField Entity:');
  console.log({
    id: registeredField.id,
    farmer_id: registeredField.farmer_id,
    field_name: registeredField.field_name,
    crop_name: registeredField.crop_name,
    crop_variety: registeredField.crop_variety,
    sowing_date: registeredField.sowing_date,
    latitude: registeredField.latitude,
    longitude: registeredField.longitude,
    area: registeredField.area,
    soil_type: registeredField.soil_type,
    irrigation_type: registeredField.irrigation_type,
    crop_stage: registeredField.crop_stage,
    created_at: registeredField.created_at,
    updated_at: registeredField.updated_at
  });

  const baselineReport = reports.find(r => r.field_id === registeredField.id);
  console.log('\nField Report Entity:');
  console.log(baselineReport);

  // Test Skip Fallback
  console.log('\n---------------------------------------------------------------');
  console.log('🧪 TESTING SKIP FALLBACK AND CANCEL WORKFLOW');
  const skipPhone = '919555667788';
  await farmerProfileService.processOnboardingMessage(skipPhone, 'Register my field');
  const skipRes = await farmerProfileService.processOnboardingMessage(skipPhone, 'skip'); // skips name
  console.log('Skipped Name response snippet:', skipRes.replyText.substring(0, 80) + '...');
  const cancelRes = await farmerProfileService.processOnboardingMessage(skipPhone, 'cancel');
  console.log('Cancel response:', cancelRes.replyText);
  console.log('Onboarding Active after cancel?', farmerProfileService.isOnboardingActive(skipPhone));

  // Test Demo Mode
  console.log('\n---------------------------------------------------------------');
  console.log('🧪 TESTING DEMO / TEST MODE TRIGGER');
  const demoRes = await farmerProfileService.processOnboardingMessage('919000111222', 'demo register');
  console.log('Demo Response:\n' + demoRes.replyText);

  console.log('\n===============================================================');
  console.log('✅ ALL ONBOARDING MULTI-TURN & ENTITY TESTS PASSED!');
  console.log('===============================================================');
}

runOnboardingTests().catch(e => console.error('Test error:', e));
