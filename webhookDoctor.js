// webhookDoctor.js - UPDATED WITH NEW SCHEDULE FORMAT
const express = require("express");
const axios = require("axios");
const nodemailer = require("nodemailer");
const router = express.Router();

const doctorSessions = require('./doctorSessionManager');
const dbService = require('./databaseService');
const automatedMessaging  = require('./automatedMessaging');
const feedbackService    = require('./feedbackService');
const doctorCardService  = require('./doctorCardService');
const templateService    = require('./templateService');

const DOCTOR_TOKEN = process.env.DOCTOR_WHATSAPP_ACCESS_TOKEN;
const DOCTOR_PHONE_NUMBER_ID = process.env.DOCTOR_PHONE_NUMBER_ID;
const MYTOKEN_DOCTOR = process.env.MYTOKEN;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'scofields109@gmail.com';
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP;
const WEB_FORM_URL = process.env.DOCTOR_REGISTRATION_URL || 'https://quickmed.com/doctor-register';

const DOCTOR_FLOW_ID = "925887289782098";

console.log('👨‍⚕️ Doctor Webhook initialized (WhatsApp Flow Registration)');

const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ---------------------- Helper Functions ----------------------

async function sendDoctorMessage(to, message) {
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/${DOCTOR_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        text: { body: message }
      },
      {
        headers: {
          Authorization: `Bearer ${DOCTOR_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log("✅ Message sent to doctor:", to);
  } catch (error) {
    console.error("❌ Error sending message:", error.response?.data || error.message);
  }
}

// ── Send doctor help as a WhatsApp list (same pattern as patient sendHelpMenu) ─
async function sendDoctorHelpMenu(to, doctorName) {
  const firstName = (doctorName || '').split(' ')[0] || 'Doctor';
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/${DOCTOR_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: { type: 'text', text: '👨‍⚕️ QuickMed Doctor Portal' },
          body:   { text: `Hi Dr. ${firstName}! What would you like to do?` },
          footer: { text: 'Tap a command to get started' },
          action: {
            button: 'View Commands',
            sections: [
              {
                title: 'My Practice',
                rows: [
                  { id: 'dcmd_profile',      title: 'My Profile',           description: 'View your doctor profile' },
                  { id: 'dcmd_appointments', title: 'My Appointments',      description: 'See upcoming bookings' },
                  { id: 'dcmd_earnings',     title: 'Earnings & Payout',    description: 'View earnings and next payout date' },
                  { id: 'dcmd_status',       title: 'Account Status',       description: 'Check your account status' },
                ]
              },
              {
                title: 'Actions & Settings',
                rows: [
                  { id: 'dcmd_update_photo', title: 'Update Profile Photo', description: 'Send a photo then tap here' },
                  { id: 'dcmd_update_name',  title: 'Update Name',          description: 'Change your display name' },
                  { id: 'dcmd_reject',       title: 'Reject Appointment',   description: 'Reject your next appointment' },
                  { id: 'dcmd_report',       title: 'Report a Problem',     description: 'Contact QuickMed support' },
                ]
              }
            ]
          }
        }
      },
      { headers: { Authorization: `Bearer ${DOCTOR_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    console.log('✅ Doctor help menu sent to', to);
  } catch (e) {
    // Fallback to plain text if list fails
    console.error('❌ Doctor help menu error:', e.response?.data?.error || e.message);
    await sendDoctorMessage(to,
      `👨‍⚕️ *Doctor Commands*\n\n` +
      `• *profile* — View your profile\n` +
      `• *appointments* — See upcoming bookings\n` +
      `• *earnings* — Earnings & next payout\n` +
      `• *status* — Account status\n` +
      `• *update photo* — Set profile photo (send photo first)\n` +
      `• *update name* — Change your name\n` +
      `• *reject* — Reject next appointment\n` +
      `• *reject QM12345* — Reject specific booking\n` +
      `• *patient 1234* — Look up patient record\n` +
      `• *report problem* — Contact support\n` +
      `• *help* — Show this menu`
    );
  }
}

async function sendDoctorFlow(to, flowId, screen, flowToken = to) {
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/${DOCTOR_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "interactive",
        interactive: {
          type: "flow",
          header: { type: "text", text: "👨‍⚕️ Doctor Registration" },
          body: { text: "Please complete the form to join QuickMed. Your information will be verified within 24-48 hours." },
          footer: { text: "QuickMed • Secure & Verified" },
          action: {
            name: "flow",
            parameters: {
              flow_message_version: "3",
              flow_token: flowToken,
              flow_id: flowId,
              flow_cta: "Start Registration",
              flow_action: "navigate",
              flow_action_payload: { screen: screen }
            }
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${DOCTOR_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log("✅ Flow sent to doctor:", to);
  } catch (error) {
    console.error("❌ Error sending flow:", error.response?.data || error.message);
    const fallbackUrl = `${WEB_FORM_URL}?phone=${encodeURIComponent(to)}`;
    await sendDoctorMessage(to,
      `We couldn't open the registration form. Please use this link:\n\n${fallbackUrl}`
    );
  }
}

// Format dropdown value (e.g., "0_General_Practice" → "General Practice")
function formatDropdownValue(val) {
  if (!val) return 'Not provided';
  const parts = val.split('_');
  return parts.length > 1 ? parts.slice(1).join(' ') : val;
}

// Format array of dropdown values (e.g., ["0_Monday", "1_Tuesday"] → "Monday, Tuesday")
function formatArrayValues(arr) {
  if (!arr || !Array.isArray(arr)) return typeof arr === 'string' ? arr : 'Not provided';
  return arr.map(v => formatDropdownValue(v)).join(', ');
}

// ─────────────────────────────────────────────────────────────
// Normalise a raw day value from the flow checkbox/dropdown to
// lowercase weekday name.  Handles: "0_Monday", "Monday", "monday"
// ─────────────────────────────────────────────────────────────
function normaliseDay(val) {
  if (!val) return null;
  const clean = formatDropdownValue(val).toLowerCase().trim();
  const valid = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  return valid.includes(clean) ? clean : null;
}

// ─────────────────────────────────────────────────────────────
// Convert an array of time-period selections from the flow's
// CheckboxGroup into a { start, end } object for the slot engine.
//
// Flow sends items like: ["0_Morning_", "1_Afternoon", "3_Night_"]
//
// Period → hours:
//   Morning   (0)  06:00 – 12:00
//   Afternoon (1)  12:00 – 17:00
//   Evening   (2)  17:00 – 21:00
//   Night     (3)  21:00 – 02:00  (overnight)
//
// We pick the earliest start from the selected periods and the
// latest end, preserving overnight semantics.
// ─────────────────────────────────────────────────────────────
const PERIOD_MAP = {
  morning:   { start: '06:00', end: '12:00', order: 0 },
  afternoon: { start: '12:00', end: '17:00', order: 1 },
  evening:   { start: '17:00', end: '21:00', order: 2 },
  night:     { start: '21:00', end: '02:00', order: 3 },  // overnight
};

function periodsToSchedule(rawPeriods) {
  if (!rawPeriods || !Array.isArray(rawPeriods) || rawPeriods.length === 0) {
    return null;
  }

  // Normalise each entry to a period key
  const matched = rawPeriods
    .map(v => {
      const label = formatDropdownValue(v).toLowerCase().replace(/[^a-z]/g, '');
      // "morning_" → "morning", "afternoon" → "afternoon", etc.
      return Object.keys(PERIOD_MAP).find(k => label.startsWith(k)) || null;
    })
    .filter(Boolean);

  if (matched.length === 0) return null;

  // Sort by order so we pick the correct boundary periods
  matched.sort((a, b) => PERIOD_MAP[a].order - PERIOD_MAP[b].order);

  const start = PERIOD_MAP[matched[0]].start;          // earliest period's start
  const end   = PERIOD_MAP[matched[matched.length - 1]].end; // latest period's end

  return { start, end };
}

// Send email notification to admin
async function sendAdminEmail(phone, flowData, fullName, specialty, schedule) {
  const emailBody = `
    New Doctor Registration via WhatsApp Flow

    Doctor Details:
    ================
    Full Name: ${fullName}
    Phone: ${phone}
    Specialty: ${formatDropdownValue(specialty)}
    Medical ID: ${flowData.screen_1_Medical_ID__4 || 'Not provided'}
    Sex: ${formatDropdownValue(flowData.screen_1_Sex_3)}

    Schedule:
    ================
    Available Days: ${(schedule.days || []).join(', ')}
    Start Time:     ${schedule.start || 'Not provided'}
    End Time:       ${schedule.end || 'Not provided'}
    Terms Accepted: ${flowData.screen_2_I_have_read_and_agreed_to_all_Terms_and_Conditions___3 ? 'Yes' : 'No'}

    Submitted At: ${new Date().toLocaleString()}
  `;

  // ── Validate ──────────────────────────────────────────────
  if (normalisedDays.length === 0 || !scheduleFromPeriods) {
    console.error('❌ Missing schedule data:', { normalisedDays, rawPeriods, scheduleFromPeriods });
    await sendDoctorMessage(phone,
      `⚠️ *Registration incomplete.*\n\n` +
      `We couldn't read your availability schedule.\n\n` +
      `Please make sure you selected:\n` +
      `• At least one working day\n` +
      `• At least one time period (Morning / Afternoon / Evening / Night)\n\n` +
      `Type *register* to try again.`
    );
    return;
  }

  // ── Build schedule object for slot engine ─────────────────
  const schedule = {
    days:    normalisedDays,               // ["monday", "wednesday", "friday"]
    start:   scheduleFromPeriods.start,    // "06:00"
    end:     scheduleFromPeriods.end,      // "17:00"
    periods: periodLabels                  // "Morning, Afternoon" (for display)
  };

  console.log(`👤 Name: "${fullName}", Specialty: "${specialty}"`);
  console.log(`📅 Schedule:`, JSON.stringify(schedule));

  // ── Duplicate check ───────────────────────────────────────
  try {
    const { data: existingRows, error: checkError } = await dbService.supabase
      .from(dbService.doctorsTable)
      .select('id, status, registration_status, photo_url')
      .eq('phone', phone)
      .limit(1);

    if (checkError) {
      console.error('⚠️ Duplicate check DB error:', checkError.message);
    }

    const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

    if (existing) {
      const currentStatus = existing.status || existing.registration_status;
      const allowReRegister = ['disapproved', 'rejected', 'removed'].includes(currentStatus);

      if (allowReRegister) {
        // Delete the old record so the new insert can proceed cleanly
        console.log(`♻️ Deleting old ${currentStatus} record for ${phone} — allowing re-registration`);
        await dbService.supabase
          .from(dbService.doctorsTable)
          .delete()
          .eq('id', existing.id);

        // Preserve their photo if they had one and nothing is pending
        if (existing.photo_url) {
          const dcs = require('./doctorCardService');
          dcs.storePendingDoctorPhoto(phone, existing.photo_url);
        }
        // Continue to insert below
      } else {
        // Active, pending, suspended — block re-registration
        console.log(`⚠️ Doctor already exists for ${phone} with status ${currentStatus} — skipping insert`);
        await sendDoctorMessage(phone,
          `✅ *Your registration was already received!*\n\n` +
          `📋 Status: ${currentStatus}\n\n` +
          `Our team is reviewing your application.\n` +
          `Type *status* to check progress.`
        );
        return;
      }
    }
  } catch (checkErr) {
    console.error('⚠️ Duplicate check exception (non-fatal):', checkErr.message);
  }
    console.log('💾 Inserting doctor into Supabase...');

    const { data, error } = await dbService.supabase
      .from(dbService.doctorsTable)
      .insert([doctorRecord])
      .select();

    if (error) {
      // Duplicate phone — WhatsApp fired the webhook twice (race condition).
      // The first call already inserted and sent the confirmation. Silently return.
      if (error.code === '23505' || (error.message && error.message.includes('duplicate key'))) {
        console.log(`ℹ️ Duplicate insert for ${phone} — already registered (race condition). Ignoring.`);
        return;
      }

      console.error("❌ Supabase insert error:", error.message);
      console.error("   Details:", error.details);
      console.error("   Hint:", error.hint);
      await sendDoctorMessage(phone,
        `⚠️ *There was an issue saving your registration.*\n\n` +
        `Please contact support and quote your phone number.\n` +
        `📧 support@quick-med.xyz`
      );
      return;
    }

    console.log("✅ Doctor saved! ID:", data[0]?.id);

    // If doctor sent a profile photo before the form, save it now
    if (data[0]?.id) {
      try {
        const photoResult = await doctorCardService.saveDoctorPhoto(phone);
        if (photoResult.success) {
          console.log(`[registration] Profile photo saved for ${phone}`);
        }
      } catch(e) { /* non-fatal — doctor can upload later with 'update photo' */ }
    }

  } catch (err) {
    console.error("❌ Exception during Supabase insert:", err.message);
    await sendDoctorMessage(phone,
      `⚠️ *There was an issue saving your registration.*\n\n` +
      `Please contact support.\n📧 support@quick-med.xyz`
    );
    return;
  }

  // ── Confirmation to doctor ────────────────────────────────
  await sendDoctorMessage(phone,
    `✅ *Registration Received!*\n\n` +
    `👤 *Name:* ${fullName}\n` +
    `🏥 *Specialty:* ${formatDropdownValue(specialty)}\n` +
    `🪪 *Medical ID:* ${medicalId}\n\n` +
    `📅 *Working Days:* ${normalisedDays.join(', ')}\n` +
    `🕐 *Available:* ${periodLabels} (${schedule.start}–${schedule.end})\n\n` +
    `⏳ Our team will verify your credentials within *24-48 hours*.\n` +
    `You'll receive a WhatsApp notification once approved.\n\n` +
    `Type *status* anytime to check your progress.`
  );

  // ── Notify admin via email only ──────────────────────────────────────────────
  // Onboarding video is sent after APPROVAL from the dashboard — not here.
  await sendAdminEmail(phone, flowData, fullName, specialty, schedule);
}

// ── Get-started video ─────────────────────────────────────────────────────────
async function sendGetStartedVideo(phone, doctorName) {
  const firstName = (doctorName || 'Doctor').split(' ')[0];
  const VIDEO_URL = process.env.DOCTOR_ONBOARDING_VIDEO_URL || 'https://youtu.be/quickmed-doctor-guide';

  // Try template with URL button first (requires Meta approval: quickmed_doctor_welcome)
  try {
    const resp = await axios.post(
      `https://graph.facebook.com/v21.0/${DOCTOR_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: 'quickmed_doctor_welcome',
          language: { code: 'en' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: firstName }] }
            // No button component — URL is static in the approved template
          ]
        }
      },
      { headers: { Authorization: `Bearer ${DOCTOR_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    if (resp.data?.messages?.[0]?.id) {
      console.log(`[onboarding] Video template sent to Dr. ${doctorName}`);
      return;
    }
  } catch(e) {
    console.warn(`[onboarding] Template failed, using plain text: ${e.response?.data?.error?.message || e.message}`);
  }

  // Plain text fallback
  await sendDoctorMessage(phone,
    `🎬 *Welcome to QuickMed, Dr. ${firstName}!*

` +
    `Before your first consultation, please watch our quick onboarding guide:

` +
    `▶️ *Watch here:*
${VIDEO_URL}

` +
    `It covers:
` +
    `• How to receive and confirm bookings
` +
    `• Joining video consultations
` +
    `• Generating medical reports
` +
    `• Getting paid after consultations

` +
    `_Takes only 3 minutes. Type *help* anytime for commands._`
  );
}

// ---------------------- Webhook Handlers ----------------------

router.get("/", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === MYTOKEN_DOCTOR) {
    console.log("✅ Doctor webhook verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});


        const rawResponse = message.interactive.nfm_reply?.response_json;

        if (rawResponse) {
          try {
            const flowData = typeof rawResponse === 'string'
              ? JSON.parse(rawResponse)
              : rawResponse;
            console.log("✅ Parsed flow data:", JSON.stringify(flowData, null, 2));
            await processFlowRegistration(from, flowData);
          } catch (parseErr) {
            console.error("❌ Failed to parse nfm_reply:", parseErr.message);
            await sendDoctorMessage(from,
              "Sorry, we couldn't process your submission. Please try again."
            );
          }
        } else {
          console.error("❌ No response_json in nfm_reply");
          await sendDoctorMessage(from,
            "Sorry, we didn't receive your form data. Please try again."
          );
        }
        return res.sendStatus(200);
      }

      // Older flow_reply format — kept for safety
      if (interactiveType === 'flow_reply') {
        console.log("🎯 FLOW_REPLY detected");

        const rawResponse = message.interactive.flow_reply?.response;

        if (rawResponse) {
          try {
            const flowData = typeof rawResponse === 'string'
              ? JSON.parse(rawResponse)
              : rawResponse;
            await processFlowRegistration(from, flowData);
          } catch (parseErr) {
            console.error("❌ Failed to parse flow_reply:", parseErr.message);
            await sendDoctorMessage(from,
              "Sorry, we couldn't process your submission. Please try again."
            );
          }
        } else {
          await sendDoctorMessage(from,
            "Sorry, we didn't receive your form data. Please try again."
          );
        }
        return res.sendStatus(200);
      }
    }

    // ── Profile update sessions ───────────────────────────────
   
          doctorSessions.completeSession(from);

        } else if (lowerText === 'no' || lowerText === 'n' || lowerText === 'cancel') {
          await sendDoctorMessage(from,
            `❌ Name update cancelled.\n\nYour name remains: ${session.data.currentName}\n\nType *help* for other commands.`
          );
          doctorSessions.completeSession(from);

        } else {
          await sendDoctorMessage(from,
            `⚠️ Please reply with:\n\n• *yes* — confirm\n• *no* — cancel\n\nUpdate name to: ${session.data.pendingName}?`
          );
        }
        return res.sendStatus(200);
      }

     
    // ── Register command ──────────────────────────────────────
    if (lowerText === 'register' || lowerText === 'signup' || lowerText === 'start') {
      if (doctor) {
        const status = doctor.status || doctor.registration_status;

        if (status === 'pending_approval' || status === 'pending') {
          await sendDoctorMessage(from,
            `⏳ *Application Pending Review*\n\n` +
            `Your application is being reviewed.\n\n` +
            `📋 Status: Under Review\n` +
            `⏱️ Expected: 24-48 hours\n\n` +
            `Type *status* to check anytime.`
          );
        } else if (status === 'active' || status === 'approved') {
          await sendDoctorMessage(from,
            `✅ *You're Already Registered!*\n\nYour account is active.\n\nType *profile* to view your details.`
          );
        } else if (status === 'rejected') {
          // Save existing photo_url before deleting (so doctor keeps their photo)
          const existingPhotoUrl = doctor.photo_url || null;

          // Delete old record so they can re-register fresh
          await dbService.supabase
            .from(dbService.doctorsTable)
            .delete()
            .eq('phone', from);

          // If they had a photo, store the media ID back in pending so
          // processFlowRegistration will save it again after the new insert
          if (existingPhotoUrl) {
            const dcs = require('./doctorCardService');
            dcs.storePendingDoctorPhoto(from, existingPhotoUrl);
          }

          await sendDoctorMessage(from,
            `🔄 *Re-Registration Available*\n\n` +
            `Your previous application was not approved.\n` +
            `Reason: ${doctor.rejection_reason || 'See support for details'}\n\n` +
            `You can now submit a new application with corrected information.`
          );
          // Ask for photo first — same as new registration
          await new Promise(r => setTimeout(r, 500));
          doctorSessions.sessions[from] = {
            type: 'awaiting_registration_photo',
            step: 'awaiting_photo',
            createdAt: new Date()
          };
          await sendDoctorMessage(from,
            `📸 *First, let's set up your profile photo!*\n\n` +
            `Please send a clear photo of yourself (headshot or passport style).\n\n` +
            `This will appear on your doctor card shown to patients after they book with you.\n\n` +
            `_Send your photo now to continue._`
          );
      } catch (btnErr) {
        // Fallback if interactive messages fail
        await sendDoctorMessage(from,
          `👋 *Welcome to QuickMed Doctor Portal!*\n\n` +
          `Join doctors earning from online consultations across Nigeria.\n\n` +
          `Type *register* to begin your application (takes less than 5 minutes).`
        );
      }
      return res.sendStatus(200);
    }



    // ── Approved doctor commands ──────────────────────────────
    if (lowerText === 'update name' || lowerText === 'change name') {
      doctorSessions.sessions[from] = {
        step: 'awaiting_new_name',
        data: { currentName: doctor.full_name },
        type: 'profile_update',
        createdAt: new Date()
      };

      await sendDoctorMessage(from,
        `👤 *Update Your Name*\n\nCurrent: ${doctor.full_name}\n\nPlease type your new name:\n\nOr type *cancel* to abort.`
      );
      return res.sendStatus(200);
    }

    if (lowerText === 'appointments' || lowerText === 'my appointments' || lowerText === 'bookings' || lowerText === 'my bookings') {
      try {
        const { data: appts, error } = await dbService.supabase
          .from(dbService.appointmentsTable)
          .select('*')
          .eq('doctor_id', doctor.id)
          .eq('status', 'confirmed')
          .gte('appointment_date', new Date().toISOString().split('T')[0])
          .order('appointment_date', { ascending: true })
          .order('appointment_time', { ascending: true })
          .limit(5);

        if (error) throw error;

        if (!appts || appts.length === 0) {
          await sendDoctorMessage(from,
            `📋 *Your Upcoming Appointments*\n\nNo confirmed appointments yet.\n\nWhen patients book with you, they'll appear here.\n\nType *help* for other commands.`
          );
        } else {
          const formatTime = (t) => {
            const [h, m] = t.split(':').map(Number);
            const period = h >= 12 ? 'PM' : 'AM';
            const display = h % 12 === 0 ? 12 : h % 12;
            return `${display}:${String(m).padStart(2, '0')} ${period}`;
          };
          const formatDate = (d) => {
            const dt = new Date(d + 'T12:00:00Z');
            return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
          };

          let msg = `📋 *Your Upcoming Appointments*\n(${appts.length} shown)\n`;
          appts.forEach((a, i) => {
            const link = a.meeting_link || a.meetingLink || 'Not available';
            msg += `\n─────────────────\n`;
            msg += `*${i + 1}. ${formatDate(a.appointment_date)} at ${formatTime(a.appointment_time)}*\n`;
            msg += `👤 Patient: ${a.patient_name || a.patient_phone}\n`;
            msg += `📋 ID: ${a.booking_id || a.id}\n`;
            msg += `📹 Link: ${link}\n`;
                  `Patient: ${reportData.patientName}`,
      `Doctor: ${reportData.doctorName} (${reportData.specialty})`,
      `Consultation Date: ${reportData.consultationDate}`,
          });
          msg += `\n─────────────────\nType *help* for other commands.`;

          await sendDoctorMessage(from, msg);
        }
      } catch (err) {
        console.error('❌ Error fetching appointments:', err.message);
        await sendDoctorMessage(from, `⚠️ Could not load appointments. Please try again.`);
      }
      return res.sendStatus(200);
    }

    // ── FEATURE 3: Doctor rejects an appointment ─────────────────
    // Exact command: "reject QM12345678" or just "reject" (rejects next upcoming)
    if (lowerText === 'reject' || lowerText.startsWith('reject ')) {
      try {
        const bookingIdArg = text.trim().split(/\s+/)[1]?.toUpperCase();

        // Find the appointment to reject
        let apptQuery = dbService.supabase
          .from(dbService.appointmentsTable)
          .select('*')
          .eq('doctor_id', doctor.id)
          .eq('status', 'confirmed')
          .gte('appointment_date', new Date().toISOString().split('T')[0])
          .order('appointment_date', { ascending: true })
          .order('appointment_time', { ascending: true });

        const { data: appts } = await apptQuery;
        if (!appts || appts.length === 0) {
          await sendDoctorMessage(from, '📋 You have no upcoming appointments to reject.');
          return res.sendStatus(200);
        }

        // Match by booking_id if provided, else take next upcoming
        let appt = bookingIdArg
          ? appts.find(a => (a.booking_id || '').toUpperCase() === bookingIdArg)
          : appts[0];

        if (!appt) {
          await sendDoctorMessage(from,
            `❌ Appointment "${bookingIdArg}" not found.\n\nUse: *reject QM12345678*\nOr just *reject* for your next appointment.`
          );
          return res.sendStatus(200);
        }

        // Try to find a replacement doctor
        const replacement = await dbService.findReplacementDoctor(
          doctor.specialty, appt.appointment_date, appt.appointment_time, doctor.id
        );

        const formatTime = (t) => {
          const [h, m] = t.split(':').map(Number);
          const p = h >= 12 ? 'PM' : 'AM';
          return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${p}`;
        };
        const timeStr = formatTime(appt.appointment_time);
        const dateStr = appt.appointment_date;

        if (replacement) {
          // Reassign to replacement doctor
          await dbService.supabase
            .from(dbService.appointmentsTable)
            .update({ doctor_id: replacement.id })
            .eq('id', appt.id);

          // Notify patient of reassignment
          const PATIENT_TOKEN  = process.env.TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
          const PATIENT_PHONE_ID = process.env.PHONE_NUMBER_ID;
          const axios = require('axios');

          await axios.post(
            `https://graph.facebook.com/v21.0/${PATIENT_PHONE_ID}/messages`,
            {
              messaging_product: 'whatsapp',
              to: appt.patient_phone,
              text: {
                body:
                  `🔄 *Appointment Update*\n\n` +
                  `Your appointment on ${dateStr} at ${timeStr} has been reassigned to a new doctor.\n\n` +
                  `👨‍⚕️ New Doctor: Dr. ${replacement.full_name}\n\n` +
                  `Your consultation link and time remain the same.\n` +
                  `We apologise for the inconvenience.\n\n📞 +2348112735098 for questions.`
              }
            },
            { headers: { Authorization: `Bearer ${PATIENT_TOKEN}`, 'Content-Type': 'application/json' } }
          ).catch(e => console.error('❌ Patient notify failed:', e.message));

          // Notify new doctor
          if (replacement.phone) {
            await sendDoctorMessage(replacement.phone,
              `📋 *New Appointment Assigned to You*\n\n` +
              `👤 Patient: ${appt.patient_name}\n` +
              `📅 Date: ${dateStr}\n` +
              `⏰ Time: ${timeStr}\n\n` +
              `Reassigned from another doctor. Type *appointments* to view all bookings.`
            );
          }

          // Confirm to rejecting doctor
          await sendDoctorMessage(from,
            `✅ *Appointment Rejected & Reassigned*\n\n` +
            `👤 Patient ${appt.patient_name} has been moved to Dr. ${replacement.full_name}.\n` +
            `📅 ${dateStr} at ${timeStr}\n\n` +
            `The patient has been notified.`
          );

        } else {
          // No replacement available — prompt patient to reschedule
          const PATIENT_TOKEN  = process.env.TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
          const PATIENT_PHONE_ID = process.env.PHONE_NUMBER_ID;
          const axios = require('axios');

          await axios.post(
            `https://graph.facebook.com/v21.0/${PATIENT_PHONE_ID}/messages`,
            {
              messaging_product: 'whatsapp',
              to: appt.patient_phone,
              text: {
                body:
                  `⚠️ *Appointment Update*\n\n` +
                  `Unfortunately your appointment on ${dateStr} at ${timeStr} is no longer available.\n\n` +
                  `No other doctors are available at that slot right now.\n\n` +
                  `Please type *book* to choose a new time. We apologise for the inconvenience.\n\n📞 +2348112735098`
              }
            },
            { headers: { Authorization: `Bearer ${PATIENT_TOKEN}`, 'Content-Type': 'application/json' } }
          ).catch(e => console.error('❌ Patient notify failed:', e.message));

          // Cancel the appointment
          await dbService.supabase
            .from(dbService.appointmentsTable)
            .update({ status: 'cancelled' })
            .eq('id', appt.id);

          await sendDoctorMessage(from,
            `✅ *Appointment Rejected*\n\n` +
            `No replacement doctor was available.\n` +
            `Patient ${appt.patient_name} has been notified to reschedule.\n` +
            `📅 ${dateStr} at ${timeStr}`
          );
        }

      } catch (err) {
        console.error('❌ Reject command error:', err.message);
        await sendDoctorMessage(from, '⚠️ Error processing rejection. Please try again.');
      }
      return res.sendStatus(200);
    }


    if (lowerText === 'earnings' || lowerText === 'my earnings' || lowerText === 'balance') {
      try {
        const data = await dbService.getEarningsForDoctor(doctor.id);
        if (!data) throw new Error('Could not load earnings');

        const fmt = (n) => '₦' + Number(n).toLocaleString();
        const c = data.current;
        const p = data.previous;
        const a = data.allTime;

        let msg = '💰 *Your QuickMed Earnings*\n\n';

        msg += '📅 *This Month (' + c.period + ')*\n';
        msg += '• Consultations: ' + c.count + ' calls\n';
        msg += '• Gross: ' + fmt(c.gross) + '\n';
        msg += '• Your Share (70%): *' + fmt(c.doctor) + '*\n\n';

        msg += '📅 *Last Month (' + p.period + ')*\n';
        msg += '• Consultations: ' + p.count + ' calls\n';
        msg += '• Your Share: ' + fmt(p.doctor) + '\n\n';

        msg += '📊 *All Time*\n';
        msg += '• Total Calls: ' + a.count + '\n';
        msg += '• Total Earned: ' + fmt(a.doctor) + '\n\n';

        if (data.lastPayout) {
          const paidDate = new Date(data.lastPayout.paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
          msg += '✅ *Last Payout:* ' + fmt(data.lastPayout.doctor_amount) + ' on ' + paidDate + '\n\n';
        } else {
          msg += '⏳ *No payouts yet*\n\n';
        }

        msg += '📆 *Next Payout Date:* ' + data.nextPayoutDate + '\n';
        msg += '_Payouts processed on the 20th of each month._';

        await sendDoctorMessage(from, msg);
      } catch (err) {
        console.error('❌ earnings command error:', err.message);
        await sendDoctorMessage(from, '⚠️ Could not load earnings. Please try again.');
      }
      return res.sendStatus(200);
    }

    // ── Update profile photo ──────────────────────────────────────────────────
    if (lowerText === 'update photo' || lowerText === 'change photo' ||
        lowerText === 'upload photo' || lowerText === 'set photo' ||
        lowerText === 'update profile photo') {
      // With the new flow, just sending a photo saves it automatically.
      // If they type "update photo" without sending a photo first, guide them.
      await sendDoctorMessage(from,
        `📸 *Update Profile Photo*\n\n` +
        `Just send your photo as a WhatsApp image — it will be saved automatically.\n\n` +
        `No extra steps needed.`
      );
      return res.sendStatus(200);
    }

    // ── Patient record lookup ─────────────────────────────────────────────────
    const patientMatch = text.match(/^patient\s+([\+\d]{4,})/i);
    if (patientMatch) {
      const query = patientMatch[1].trim();
      try {
        let phone = (query.startsWith('+') || query.length > 6) ? query : null;
        if (!phone) {
          // Last-4-digits search — find patient phone ending in these digits
          const { data: appts } = await dbService.supabase
            .from(dbService.appointmentsTable)
            .select('patient_phone, patient_name')
            .filter('patient_phone', 'ilike', '%' + query)
            .order('created_at', { ascending: false })
            .limit(1);

    // ── Open support ticket — thread doctor reply onto Trello card ───────────
    // If this doctor has an open no-show (or support) ticket, their message
    // should go to the Trello card, NOT be silently dropped.
    // This is the mirror of what index.js does for patients.
    // We check this LAST so all normal commands still take priority above.
    try {
      const ticketingService = require('./ticketingService');
      const openTicket = await ticketingService.getOpenTicketByPhone(from);

      if (openTicket?.trello_card_id) {
        const doctorName = doctor?.full_name || from;

        // Check if doctor is trying to close the ticket
        const isResolveCmd = /^(resolved?\.?|close ticket|done|fixed|sorted|all good|thank you|thanks)$/i.test(text.trim());

        if (isResolveCmd) {
          await ticketingService.resolveTicket(from, 'Resolved by doctor');
          await sendDoctorMessage(from,
            `✅ *Ticket Closed*\n\n` +
            `Your support ticket has been marked as resolved.\n\n` +
            `If you need further help, type *report problem* anytime.`
          );
        } else {
          // Thread the message onto the Trello card
          await ticketingService.addUserReplyToCard(openTicket.trello_card_id, text, 'doctor', doctorName);
          await sendDoctorMessage(from,
            `💬 *Message Received*\n\n` +
            `Your reply has been sent to our support team.\n\n` +
            `_They will respond here on WhatsApp shortly._\n\n` +
            `If the issue is resolved, type *resolved* to close this ticket.`
          );
        }
        return res.sendStatus(200);
      }
    } catch (ticketErr) {
      // Non-fatal — fall through to silent drop if ticketing fails
      console.error('[doctor webhook] ticket check error (non-fatal):', ticketErr.message);
    }

    // No open ticket and no matching command — silently ignore
    console.log(`ℹ️ Ignoring non-command message: "${text}"`);
    return res.sendStatus(200);

  } catch (err) {
    console.error("❌ Doctor webhook error:", err.message);
    console.error("Stack:", err.stack);
    return res.sendStatus(500);
  }
});

module.exports = router;