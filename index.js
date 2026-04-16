// index.js - UPDATED WITH SLOT ENGINE
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require('dotenv').config();

const { getSimpleAIResponse, getContextualAIResponse, isEmergency, getEmergencyResponse } = require('./groq-api');
const app = express();
// Capture raw body string for Paystack HMAC verification.
// bodyParser's verify callback fires before the body is parsed,
// giving us the raw Buffer which we convert to string.
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

// ── Admin dashboard ───────────────────────────────────────────
const path = require("path");
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin-dashboard.html"));
});

const WHATSAPP_ACCESS_TOKEN = process.env.TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
const MYTOKEN = process.env.MYTOKEN;
const PORT = process.env.PORT || 3000;

console.log('🚀 Starting QuickMed - Patient/User System...');
console.log('💳 Paystack Test Mode Active');

if (!WHATSAPP_ACCESS_TOKEN) {
  console.error('❌ WHATSAPP_ACCESS_TOKEN missing in .env');
  process.exit(1);
}

// ==============================
// WHATSAPP HELPER FUNCTIONS
// ==============================

async function sendTextMessage(phon_no_id, to, message) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v13.0/${phon_no_id}/messages?access_token=${WHATSAPP_ACCESS_TOKEN}`,
      {
        messaging_product: "whatsapp",
        to: to,
        text: { body: message }
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10000
      }
    );
    console.log("✅ WhatsApp text message sent!");
    return response.data;
  } catch (error) {
    const errCode = error.response?.data?.error?.code;
    const errMsg  = error.response?.data?.error?.message || error.message;
    // 131047 = outside 24-hour messaging window — expected, not an error worth logging
    if (errCode === 131047 || (typeof errMsg === 'string' && errMsg.includes('24 hour'))) {
      console.log(`[WA] 24hr window — skipping message to ${to}`);
    } else {
      console.error("❌ WhatsApp send error:", errMsg);
    }
    throw error;
  }
}


// ==============================
// SPECIALTY HELPERS
// ==============================

// Full list of specialties supported by the registration flow
const ALL_SPECIALTIES = [
  'General Practice', 'Cardiologist', 'Pediatrician', 'Dermatologist',
  'Gynecologist', 'Neurologist', 'Orthopedic Surgeon', 'Psychiatrist',
  'Ophthalmologist', 'ENT Specialist', 'Urologist', 'Dentist',
  'Endocrinologist', 'Gastroenterologist', 'Pulmonologist'
];

// Emoji map for each specialty
const SPECIALTY_EMOJI = {
  'General Practice':     '🩺',
  'Cardiologist':         '❤️',
  'Pediatrician':         '👶',
  'Dermatologist':        '🧴',
  'Gynecologist':         '🌸',
  'Neurologist':          '🧠',
  'Orthopedic Surgeon':   '🦴',
  'Psychiatrist':         '🧘',
  'Ophthalmologist':      '👁️',
  'ENT Specialist':       '👂',
  'Urologist':            '🔬',
  'Dentist':              '🦷',
  'Endocrinologist':      '⚗️',
  'Gastroenterologist':   '🫁',
  'Pulmonologist':        '🫀'
};

// Returns only specialties that have at least one active doctor in the DB
async function getActiveSpecialties() {
  try {
    const { data: doctors } = await dbService.supabase
      .from(dbService.doctorsTable)
      .select('specialty')
      .eq('status', 'active');

    if (!doctors || doctors.length === 0) return ALL_SPECIALTIES; // fallback to full list

    // Get unique specialties from DB, preserving ALL_SPECIALTIES order
    const inDB = new Set(doctors.map(d => (d.specialty || '').trim()));
    const active = ALL_SPECIALTIES.filter(s =>
      [...inDB].some(dbS => dbS.toLowerCase() === s.toLowerCase())
    );

    // If somehow nothing matched, return full list rather than empty
    return active.length > 0 ? active : ALL_SPECIALTIES;
  } catch (e) {
    console.error('❌ getActiveSpecialties error:', e.message);
    return ALL_SPECIALTIES;
  }
}

// Send the specialty selection menu
async function sendSpecialtyMenu(phoneId, to, prefixMsg = '') {
  try {
    const specialties = await getActiveSpecialties();
    const numberedList = specialties.map((s, i) => {
      const emoji = SPECIALTY_EMOJI[s] || '🏥';
      return `${i + 1}️⃣ ${emoji} ${s}`;
    }).join('\n');

    const msg = (prefixMsg ? prefixMsg + '\n\n' : '') +
      `What type of doctor do you need?\n` +
      `Reply with a number:\n\n` +
      numberedList;

    await sendTextMessage(phoneId, to, msg);
  } catch (e) {
    console.error('❌ sendSpecialtyMenu error:', e.message);
    // Fallback to static list
    await sendTextMessage(phoneId, to,
      (prefixMsg ? prefixMsg + '\n\n' : '') +
      'What type of doctor do you need?\n\n' +
      '1️⃣ General Practice\n2️⃣ Cardiologist\n3️⃣ Pediatrician\n4️⃣ Dermatologist\n5️⃣ Gynecologist'
    );
  }
}

// ── Send full help menu as a WhatsApp list message ───────────────────────────
// One "View Options" button → scrollable sheet with 8 items in 2 sections.
async function sendHelpMenu(to, patientName) {
  const firstName = (patientName || '').split(' ')[0] || '';
  const greeting  = firstName ? `Hi ${firstName}! 👋` : `Hi there! 👋`;
  try {
    await axios({
      url: `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      method: 'post',
      headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      data: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: { type: 'text', text: 'QuickMed' },
          body:   { text: `${greeting} What would you like to do today?` },
          footer: { text: 'Tap an option to get started' },
          action: {
            button: 'View Options',
            sections: [
              {
                title: 'Consultations',
                rows: [
                  { id: 'menu_book',        title: 'Book a Doctor',       description: 'Find & book a consultation' },
                  { id: 'menu_appointment', title: 'My Appointment',      description: 'Check your booking details' },
                  { id: 'menu_history',     title: 'My History',          description: 'View past consultations' },
                  { id: 'menu_cancel',      title: 'Cancel Appointment',  description: 'Cancel your current booking' },
                ]
              },
              {
                title: 'Other Services',
                rows: [
                  { id: 'menu_lab',         title: 'Book a Lab Test',     description: 'Find a lab near you' },
                  { id: 'menu_medicine',    title: 'Medicine Checker',    description: 'Check if a drug is safe' },
                  { id: 'menu_tips_stop',   title: 'Manage Health Tips',  description: 'Stop or start daily tips' },
                  { id: 'menu_record', title: 'My Medical Record', description: 'Download your full health record PDF' },
                  { id: 'menu_report',      title: 'Report an Issue',     description: 'Contact our support team' },
                ]
              }
            ]
          }
        }
      })
    });
    console.log('✅ Help menu sent to', to);
  } catch (e) {
    const errDetail = e.response?.data?.error || e.response?.data || e.message;
    console.error('❌ sendHelpMenu error:', JSON.stringify(errDetail));
    // Fallback to text
    await sendTextMessage(PHONE_NUMBER_ID, to,
      `${greeting} Here's what I can help with:

` +
      `📅 *book* — Book a doctor
📋 *appointment* — Check booking
🔬 *lab* — Book a lab test
` +
      `💊 *check [drug]* — Medicine checker
📜 *my history* — Past visits
` +
      `❌ *cancel* — Cancel appointment
🚨 *report issue* — Contact support`
    );
  }
}

// ── Send 3-button quick-reply after AI responses ──────────────────────────────
// Buttons: Book Doctor | Book Lab | Report Issue
// These are interactive reply buttons — patient taps, action triggers immediately.
async function sendQuickButtons(to, bodyText) {
  try {
    await axios({
      url: `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      method: 'post',
      headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      data: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'quick_book', title: 'Book Doctor'  } },
              { type: 'reply', reply: { id: 'quick_lab',  title: 'Book Lab Test' } },
              { type: 'reply', reply: { id: 'quick_help', title: 'More Options'  } },
            ]
          }
        }
      })
    });
  } catch (e) {
    const errDetail = e.response?.data?.error || e.response?.data || e.message;
    console.warn('[buttons] sendQuickButtons failed:', JSON.stringify(errDetail));
  }
}

// ==============================
// ✅ UPDATED: sendDateList
// Now uses slot engine — only shows days doctors actually work
// ==============================

async function sendDateList(to, specialty) {
  try {
    console.log(`📅 Getting available dates for ${specialty}`);

    const availableDates = await dbService.getAvailableDates(specialty);

    if (!availableDates || availableDates.length === 0) {
      await sendTextMessage(PHONE_NUMBER_ID, to,
        `😔 No ${specialty} doctors are available in the next 3 days.\n\n` +
        `Please try:\n` +
        `• A different specialty - type *specialty*\n` +
        `• Contact support for urgent bookings`
      );
      return null;
    }

    // WhatsApp row title max = 24 chars — use short format e.g. 'Sat, 21 Feb'
    const shortDate = (dateStr) => {
      const dt = new Date(dateStr + 'T00:00:00');
      return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    };
    const rows = availableDates.map(d => ({
      id: `date_${d.dateStr}`,
      title: d.isToday ? `Today ${shortDate(d.dateStr)}` : shortDate(d.dateStr),
      description: 'Tap to select'
    }));

    const response = await axios({
      url: `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      method: 'post',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: { type: 'text', text: '📅 Select Appointment Date' },
          body: { text: `Available dates for ${specialty}:` },
          footer: { text: 'Today and next 2 days only' },
          action: {
            button: 'View Dates',
            sections: [{
              title: 'Available Dates',
              rows: rows
            }]
          }
        }
      })
    });

    console.log('✅ Date list sent');
    return response.data;

  } catch (error) {
    console.error('❌ Error sending date list:', error.response?.data || error.message);
    throw error;
  }
}

// ==============================
// ✅ UPDATED: sendTimeList
// Now uses slot engine — real 30-min slots, real doctor availability
// ==============================

async function sendTimeList(to, selectedDate, specialty, specificDoctorId = null) {
  try {
    console.log(`⏰ Getting available slots for ${specialty} on ${selectedDate}${specificDoctorId ? ' (specific doctor: ' + specificDoctorId + ')' : ''}`);

    let availableSlots = await dbService.getAvailableSlots(specialty, selectedDate);

    // If reboking with a specific doctor, filter to only their slots
    if (specificDoctorId && availableSlots) {
      availableSlots = availableSlots.filter(s => s.doctorId === specificDoctorId);
    }

    if (!availableSlots || availableSlots.length === 0) {
      await sendTextMessage(PHONE_NUMBER_ID, to,
        `❌ No ${specialty} slots available on ${selectedDate}.\n\n` +
        `*Try:*\n` +
        `📅 Type *back* - choose a different date\n` +
        `👨‍⚕️ Type *specialty* - try a different doctor type\n` +
        `❌ Type *cancel* - exit booking`
      );
      return null;
    }

    // Format time to 12-hour for display
    const formatTime = (t) => {
      const [h, m] = t.split(':').map(Number);
      const period = h >= 12 ? 'PM' : 'AM';
      const display = h % 12 === 0 ? 12 : h % 12;
      return `${display}:${String(m).padStart(2, '0')} ${period}`;
    };

    // WhatsApp hard limit: 10 rows TOTAL across all sections
    // Cap to first 10 slots (earliest available times)
    const MAX_SLOTS = 10;
    const displaySlots = availableSlots.slice(0, MAX_SLOTS);
    const hasMore = availableSlots.length > MAX_SLOTS;

    // Encode doctorId in the row id so when user picks a slot we use
    // exactly the doctor shown — not a re-run of the fair-distribution algorithm
    const rows = displaySlots.map(slot => ({
      id: `time_${slot.time}_${slot.doctorId}`,
      title: formatTime(slot.time),
      description: `Dr. ${slot.doctorName.split(' ')[0]}`
    }));

    const sections = [{
      title: 'Available Times',
      rows
    }];

    const response = await axios({
      url: `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      method: 'post',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: { type: 'text', text: '⏰ Select Time' },
          body: {
            text: `Showing ${displaySlots.length} of ${availableSlots.length} slot(s) on ${selectedDate}.${hasMore ? ' Earliest times shown.' : ''}`
          },
          footer: { text: selectedDate },
          action: {
            button: 'Select Time',
            sections: sections
          }
        }
      })
    });

    console.log('✅ Time list sent');
    return response.data;

  } catch (error) {
    console.error('❌ Error sending time list:', error.response?.data || error.message);
    throw error;
  }
}

// ==============================
// BOOKING SESSION MANAGEMENT
// ==============================

const bookingSessions    = {};
const meetingLinkCache = {};
const processedMessages = new Map();
const MESSAGE_TTL = 60000;

function isDuplicateMessage(messageId) {
  const now = Date.now();
  for (const [id, timestamp] of processedMessages.entries()) {
    if (now - timestamp > MESSAGE_TTL) processedMessages.delete(id);
  }
  if (processedMessages.has(messageId)) return true;
  processedMessages.set(messageId, now);
  return false;
}

function startBookingSession(phoneNumber) {
  bookingSessions[phoneNumber] = {
    step: 'awaiting_name',
    data: {},
    createdAt: new Date(),
    verifyAttempts: 0
  };
  console.log(`🏥 Started booking session for: ${phoneNumber}`);
}

function updateBookingSession(phoneNumber, updates) {
  if (bookingSessions[phoneNumber]) {
    bookingSessions[phoneNumber] = { ...bookingSessions[phoneNumber], ...updates };
  }
}

function getBookingSession(phoneNumber) {
  return bookingSessions[phoneNumber];
}

function isAppointmentExpired(appointment) {
  if (!appointment?.date || !appointment?.time) return false;
  const appointmentDateTime = new Date(`${appointment.date}T${appointment.time}:00`);
  return appointmentDateTime < new Date();
}

function cleanupStalePaymentSessions() {
  const TWENTY_MIN = 20 * 60 * 1000;
  const now = Date.now();
  let cleaned = 0;
 
  for (const [phone, session] of Object.entries(bookingSessions)) {
    if (session?.step === 'awaiting_payment') {
      const age = now - new Date(session.createdAt).getTime();
      if (age > TWENTY_MIN) {
        console.log(`[payment] Auto-expiring stale payment session for ${phone} (${Math.round(age/60000)}min old)`);
        delete bookingSessions[phone];
        cleaned++;
 
        // Notify the user their session expired (non-fatal if WhatsApp fails)
        sendTextMessage(PHONE_NUMBER_ID, phone,
          `⏰ *Payment session expired.*\n\n` +
          `Your booking session timed out after 20 minutes.\n\n` +
          `If you'd like to book again, type *book*.\n` +
          `If you completed a payment, please contact us with your Paystack reference.`
        ).catch(() => {});
      }
    }
  }
 
  if (cleaned > 0) console.log(`[payment] Cleaned up ${cleaned} stale session(s)`);
}

// ==============================
// SMART AI RESPONSE
// ==============================

async function getSmartAIResponse(phoneNumber, userMessage) {
  try {
    console.log(`🤖 Getting AI response for ${phoneNumber}`);

    const userContext = await dbService.getUserContext(phoneNumber);
    const history = await dbService.getConversationHistory(phoneNumber, 20);

    const bookingKeywords = [
      'book', 'appointment', 'schedule', 'booking',
      'doctor', 'tomorrow', 'today', 'next week',
      'cancel', 'reschedule', 'change appointment',
      'my appointment', 'check appointment',
      'show booking', 'my booking', 'see booking',
      'view appointment', 'check booking'
    ];

    const hasBookingIntent = bookingKeywords.some(keyword =>
      userMessage.toLowerCase().includes(keyword)
    );

    if (hasBookingIntent) {
      const userName = userContext.userName ? `, ${userContext.userName}` : '';
      // Return a short response — sendQuickButtons() will add tap buttons below
      return `I can help you with appointments${userName}! What would you like to do?`;
    }

    // Emergency is now handled before getSmartAIResponse is ever called
    // (intercepted at the top of the webhook handler in emergencyService)

    const aiResponse = await getContextualAIResponse(userMessage, userContext, history);

    return aiResponse;  // tail removed — sendQuickButtons() sends buttons below instead

  } catch (error) {
    console.error('❌ Smart AI Error:', error.message);
    return `I'm having trouble processing your request. Type 'book' to schedule an appointment.`;
  }
}

// ==============================
// ✅ UPDATED: BOOKING FLOW
// ==============================

async function handleBookingFlow(from, phon_no_id, text, session, list_response, list_id, list_title, btn_id) {
  const userMessage = text;

  await dbService.storeMessage(from, `[Booking] ${userMessage}`, null);

  switch (session.step) {
      
      case 'awaiting_record_payment': {
  const isVerifyTap  = btn_id === 'verify_payment';
  const isVerifyText = userMessage.includes('verify');
  const isCancelText = userMessage.includes('cancel') || userMessage === 'stop' || userMessage === 'exit';
 
  if (isCancelText) {
    completeBookingSession(from);
    await sendTextMessage(phon_no_id, from,
      `❌ Record request cancelled.\n\nType *my record* anytime to generate your medical record.`
    );
    break;
  }
 
  if (isVerifyTap || isVerifyText) {
    session.verifyAttempts = (session.verifyAttempts || 0) + 1;
 
    if (session.verifyAttempts > 5) {
      await sendTextMessage(phon_no_id, from,
        `❌ Too many attempts.\n\n` +
        `If you completed payment, contact support@quick-med.xyz with reference:\n` +
        `*${session.data.paymentReference}*`
      );
      completeBookingSession(from);
      break;
    }
 
    await sendTextMessage(phon_no_id, from,
      `🔍 Checking payment... (${session.verifyAttempts}/5)`
    );
 
    try {
      const verification = await paystackService.verifyPayment(session.data.paymentReference);
 
      if (verification.success && verification.verified) {
        completeBookingSession(from);
        // Fire and forget — runs async so patient gets confirmation quickly
        medicalRecordService.generateAndSendRecord(from, session.data.paymentReference)
          .catch(e => console.error('[record] async generation error:', e.message));
      } else {
        await sendTextMessage(phon_no_id, from,
          `⏳ *Payment not confirmed yet.*\n\n` +
          `Please complete the payment on Paystack, then tap *Verify Payment* again.\n\n` +
          `Attempt ${session.verifyAttempts}/5 · Reference: ${session.data.paymentReference}`
        );
        // Re-send button
        try {
          await axios.post(
            `https://graph.facebook.com/v21.0/${phon_no_id}/messages`,
            {
              messaging_product: 'whatsapp',
              to: from,
              type: 'interactive',
              interactive: {
                type: 'button',
                body: { text: 'Tap below once you have paid.' },
                action: { buttons: [{ type: 'reply', reply: { id: 'verify_payment', title: 'Verify Payment' } }] }
              }
            },
            { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
          );
        } catch (e) { /* non-fatal */ }
      }
    } catch (e) {
      await sendTextMessage(phon_no_id, from,
        `⚠️ Verification error: ${e.message}\n\nPlease try again.`
      );
    }
  } else {
    await sendTextMessage(phon_no_id, from,
      `⏳ *Waiting for payment...*\n\n` +
      `Complete payment on Paystack then tap *Verify Payment*.\n` +
      `Or type *cancel* to exit.\n\n` +
      `💡 Reference: ${session.data.paymentReference}`
    );
  }
  break;
}
    // ── Corporate: company code entry ─────────────────────
    case 'awaiting_corp_code': {
      const code = userMessage.trim().toUpperCase();
      if (!code || code === 'CANCEL') {
        completeBookingSession(from);
        await sendTextMessage(phon_no_id, from, `Cancelled. Type *book* to book an appointment.`);
        break;
      }
      const result = await corporateService.registerEmployeeByCode(from, session.data.corpCode, name);
      completeBookingSession(from);
      if (result.success) {
        await sendTextMessage(phon_no_id, from,
          `🎉 *You're now registered under ${result.company.name}!*\n\n` +
          `✅ All your consultations are covered — no payment needed.\n\n` +
          `You can also add family members:\n` +
          `Type *add family* to register your spouse or children.\n\n` +
          `Type *book* whenever you need a doctor.`
        );
      } else if (result.reason === 'already_registered') {
        await sendTextMessage(phon_no_id, from,
          `You are already registered. Type *book* to book an appointment.`
        );
      } else {
        await sendTextMessage(phon_no_id, from,
          `❌ Registration failed. Please try again or contact support: ${process.env.ADMIN_WHATSAPP || '+2348112735098'}`
        );
      }
      break;
    }

   