// medicineService.js — QuickMed AI Medicine Checker
// ─────────────────────────────────────────────────────────────────────────────
// Standalone flow, parallel to lab and booking.
//
// Triggers:
//   - Patient sends an IMAGE  → vision AI identifies the drug
//   - Patient types keywords  → "check drug", "check medicine", "is [x] safe", etc.
//   - Patient types just a drug name while in a medicine session
//
// Flow:
//   1. Identify drug (from image via Groq vision, or from text)
//   2. Pull patient health tags from DB. If none → ask one question.
//   3. AI checks: drug ↔ condition match, contraindications, dosage red flags
//   4. Reply: ✅ Seems fine / ⚠️ Use with caution / ❌ Dangerous
//   5. If ❌ or ⚠️ → prompt to book a doctor
// ─────────────────────────────────────────────────────────────────────────────


// ── Groq text: check drug safety against conditions ──────────────────────────
async function checkDrugSafety(drugName, conditions) {
  const conditionStr = conditions.length
    ? conditions.join(', ')
    : 'unknown health conditions';

  try {
    const resp = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content:
              'You are a pharmacist assistant for QuickMed Nigeria. ' +
              'Replies go directly to patients on WhatsApp — keep them SHORT and SIMPLE. ' +
              'STRICT RULES: Every field is ONE sentence only, max 15 words. ' +
              'No paragraphs. No lists. No extra explanation. No disclaimers. ' +
              'NEVER diagnose or prescribe. Nigerian drugs and generics both recognised.'
          },
          {
            role: 'user',
            content:
              `Drug: ${drugName}\n` +
              `Patient conditions: ${conditionStr}\n\n` +
              `Reply in EXACTLY this format. One line per field. Max 15 words per field. NO extra text:\n` +
              `VERDICT: SAFE or CAUTION or DANGEROUS\n` +
              `USE: [what it treats — max 6 words]\n` +
              `ASSESSMENT: [is it ok for this patient — max 15 words]\n` +
              `ACTION: [what to do — max 12 words]`
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    const text = resp.data?.choices?.[0]?.message?.content?.trim() || '';
    console.log(`[medicine] Safety check result for "${drugName}": ${text.slice(0, 100)}...`);
    return text;
  } catch (e) {
    console.error('❌ [medicine] safety check error:', e.response?.data?.error || e.message);
    return null;
  }
}

// ── Parse AI verdict and format WhatsApp message ──────────────────────────────
    const mainTags = mainRow?.[0]?.health_tags || [];

    // Merge and dedupe, filter out generic 'general'
    const merged = [...new Set([...tags, ...mainTags])]
      .filter(t => t && t !== 'general');

    // Also try to get specialty from past appointments
    if (merged.length === 0) {
      const { data: appts } = await dbService.supabase
        .from(dbService.appointmentsTable)
        .select('doctors(specialty)')
        .eq('patient_phone', phone)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false })
        .limit(3);

      const specialties = (appts || [])
        .map(a => a.doctors?.specialty)
        .filter(Boolean);

// ── Get patient's first name from DB ────────────────────────────────────────────


// ── Convert tags + specialties into readable condition list ───────────────────
function tagsToConditions(tags, specialties) {
  const tagMap = {
    cardiology:    'heart/cardiovascular condition',
    diabetes:      'diabetes',
    mental_health: 'mental health condition',
    gynecology:    'gynaecological condition',
    pediatric:     'child patient',


  const conditions = [];
  for (const tag of tags) {
    if (tagMap[tag]) conditions.push(tagMap[tag]);
    else conditions.push(tag);
  }
  for (const s of specialties) {
    conditions.push(`previously seen ${s} specialist`);
  }

  return [...new Set(conditions)];
}



  // ── Image received ────────────────────────────────────────────────────────
  const isImage = msgObj?.type === 'image';
  if (isImage) {
    const mediaId = msgObj.image?.id;
    if (!mediaId) return false;

    console.log(`[medicine] 📸 Image received from ${phone}`);
    const imgPatientName = await getPatientName(phone);
    const imgGreeting = imgPatientName ? `${imgPatientName}, ` : '';
    await send(phone, `🔍 ${imgGreeting}analysing your medicine image... Please wait.`);

    }

      return true;
    }

    // Drug identified from image — now run the check
    await runDrugCheck(phone, identified, null, imgPatientName);
    return true;
  }

  // ── Session: waiting for patient's condition ──────────────────────────────
  if (session?.step === 'awaiting_condition') {
    // Patient just told us their condition
    const condition = msgText.trim();
    if (!condition || condition.length < 2) {
      await send(phone, '⚠️ Please describe your condition briefly (e.g. "diabetes", "high blood pressure", "I\'m pregnant").');
      return true;
    }
    clearMedicineSession(phone);
    await runDrugCheck(phone, session.drugName, [condition]);
    return true;
  }

  // ── Text trigger: "check paracetamol", "can i take amoxicillin", etc ──────
  if (isMedicineTrigger(text)) {
    // Try to extract drug name from the message itself
    const drugName = extractDrugName(msgText);
    if (drugName) {
      await runDrugCheck(phone, drugName);
    } else {
      // Trigger detected but no drug name yet
      await send(phone,
        '💊 *Medicine Checker*\n\n' +
        'What drug or medicine would you like me to check?\n\n' +
        'You can:\n' +

    if (text === 'cancel') {
      clearMedicineSession(phone);
      await send(phone, '✅ Medicine check cancelled.');
      return true;
    }
    const drugName = msgText.trim();
    clearMedicineSession(phone);
    await runDrugCheck(phone, drugName);
    return true;
  }

  return false;
}

// ── Extract a drug name from a trigger message ────────────────────────────────
function extractDrugName(text) {

    if (m?.[1]) {
      const name = m[1].trim().replace(/\?$/, '').trim();
      if (name.length > 1) return name;
    }
  }
  return null;
}

// ── Core: run the drug check end-to-end 

  if (!conditions) {
    // Pull from DB
    const { tags, specialties } = await getPatientConditions(phone);
    conditions = tagsToConditions(tags, specialties);

    if (conditions.length === 0) {
      // Nothing stored — ask the patient
      medicineSessions.set(phone, { step: 'awaiting_condition', drugName });
      await send(phone,
        `💊 ${greeting}I found *${drugName}*.\n\n` +
        `To check if it\'s safe for you, I need to know your health condition.\n\n` +
        `Please briefly describe:\n` +
        `• What condition are you treating? (e.g. "diabetes", "malaria", "headache", "I\'m pregnant")\n\n` +
        `_Or type *skip* and I\'ll do a general check._`
      );

      // Handle 'skip' as a no-condition check

  ) {
    conditions = [];
  }

  // Run the AI safety check
  const rawResult = await checkDrugSafety(drugName, conditions);

  if (!rawResult) {
    const failGreet = patientName ? `${patientName}, I` : 'I';
    await send(phone,
      `⚠️ ${failGreet} wasn\'t able to complete the check for *${drugName}* right now. Please consult a pharmacist or doctor directly.`
    );
    await sendButtons(phone, 'Speak with a doctor:');
    return;
  }

  const { msg, verdict } = formatSafetyResponse(drugName, rawResult);

  // Send the result
  await send(phone, msg);


  }

  // Tag this patient with any identified conditions for better future tips
  if (conditions.length > 0) {
    try {
      const { tagPatientHealth } = require('./automatedMessaging');
      // Map plain condition strings back to our tag system where possible
      const condToTag = {
        diabetes: 'diabetes', 'high blood pressure': 'hypertension',
        hypertension: 'hypertension', heart: 'cardiology',
        cardiovascular: 'cardiology', asthma: 'asthma',
        pregnancy: 'pregnancy', pregnant: 'pregnancy',
        skin: 'dermatology', mental: 'mental_health',
        kidney: 'kidney', liver: 'liver',
      };

  }
}

module.exports = {
  handleMedicineCheck,
  hasMedicineSession,
  clearMedicineSession,
  isMedicineTrigger,
};