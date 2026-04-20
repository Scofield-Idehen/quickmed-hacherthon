// emailService.js — QuickMed Email Service via Resend
// ─────────────────────────────────────────────────────────────────────────────
// Sends transactional and newsletter emails from quickmed@quick-med.xyz
//
// .env variables (all optional — hardcoded defaults are set below):
//   RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
//   EMAIL_FROM=quickmed@quick-med.xyz
//   EMAIL_FROM_NAME=QuickMed
//   DOCTOR_PLAYBOOK_URL=https://cord-rainstorm-977.notion.site/...
//   DOCTOR_WHATSAPP_NUMBER=2349048649164
// ─────────────────────────────────────────────────────────────────────────────

const { Resend } = require('resend');

const resend        = new Resend(process.env.RESEND_API_KEY);
const BASE_URL      = process.env.BASE_URL || 'https://web3tribe.xyz';
const SUPPORT_EMAIL = 'quickmed@quick-med.xyz';


const DOCTOR_WHATSAPP_NUMBER = process.env.DOCTOR_WHATSAPP_NUMBER || '2349048649164';
const DOCTOR_WHATSAPP_LINK   = `https://wa.me/${DOCTOR_WHATSAPP_NUMBER}`;

// ─────────────────────────────────────────────────────────────────────────────
// BASE LAYOUT
// ─────────────────────────────────────────────────────────────────────────────
function baseLayout({ preheader = '', title = '', subtitle = '', body = '', cta = null }) {
  const ctaButton = cta ? `
    ${cta.linkText ? `
      <p style="font-size:13px;color:#64748b;text-align:center;margin:0 0 20px">
        Or copy the link below:<br>
        <a href="${cta.url}" style="color:#00b4b4;word-break:break-all">${cta.url}</a>
      </p>` : ''}
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'DM Sans',Arial,Helvetica,sans-serif">

  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${preheader}&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;</div>

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="max-width:560px;background:#ffffff;border-radius:12px;
                      border:1.5px solid #00b4b4;overflow:hidden;
                      box-shadow:0 4px 24px rgba(0,180,180,0.08)">

          <tr>
            <td style="background:linear-gradient(90deg,#00b4b4,#0a1628);height:4px;line-height:4px;font-size:4px">&nbsp;</td>
          </tr>

          <tr>
            <td style="padding:28px 40px 20px;text-align:center;border-bottom:1px solid #e8f7f7">
              <div style="display:inline-block;margin-bottom:8px">
                <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                  <rect width="40" height="40" rx="10" fill="#0a1628"/>
                  <path d="M20 28s-8-5.5-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 5.5-8 11-8 11z"
                        fill="none" stroke="#00b4b4" stroke-width="1.8"/>
                  <polyline points="14,20 17,17 20,23 23,15 26,20"
                            fill="none" stroke="#00b4b4" stroke-width="1.5"
                            stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div style="font-family:'Playfair Display',Georgia,serif;font-size:22px;
                          font-weight:700;color:#0a1628;letter-spacing:1px">QUICKMED</div>
              ${subtitle ? `<div style="font-size:12px;color:#64748b;margin-top:4px">${subtitle}</div>` : ''}
            </td>
          </tr>

          ${title ? `
          <tr>
            <td style="padding:24px 40px 4px">
              <h1 style="margin:0;font-family:'Playfair Display',Georgia,serif;
                         font-size:24px;font-weight:700;color:#0a1628;line-height:1.3">
                ${title}
              </h1>
            </td>
          </tr>` : ''}

          <tr>
            <td style="padding:16px 40px 32px">
              ${body}
              ${ctaButton}
            </td>
          </tr>

          <tr>
            <td style="background:#0a1628;padding:20px 40px;text-align:center">
              <p style="margin:0;font-size:12px;color:#94a3b8">
                Contact us: <a href="mailto:${SUPPORT_EMAIL}"
                  style="color:#00b4b4;text-decoration:none">${SUPPORT_EMAIL}</a>
              </p>
              <p style="margin:6px 0 0;font-size:11px;color:#475569">
                QuickMed — Healthcare made accessible in Nigeria<br>
                <a href="${BASE_URL}/unsubscribe?email={{email}}"
                   style="color:#475569;text-decoration:underline">Unsubscribe</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#00b4b4;height:3px;line-height:3px;font-size:3px">&nbsp;</td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BODY HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const p = (text, opts = {}) =>
  `<p style="margin:0 0 16px;font-size:${opts.size || '15px'};color:${opts.color || '#1e293b'};
             line-height:1.7;${opts.extra || ''}">${text}</p>`;

const sectionHeading = text =>
  `<p style="margin:24px 0 8px;font-size:13px;font-weight:700;color:#0a1628;
             letter-spacing:1px;text-transform:uppercase;border-bottom:1.5px solid #e8f7f7;
             padding-bottom:6px">${text}</p>`;

const bulletList = items =>
  `<ul style="margin:0 0 16px;padding-left:20px;color:#334155">
    ${items.map(i => `<li style="margin-bottom:6px;font-size:14px;line-height:1.6">${i}</li>`).join('')}
  </ul>`;

const divider =
  `<div style="border-top:1px solid #e2e8f0;margin:24px 0"></div>`;


// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 1: WELCOME — sent when doctor submits application
// ─────────────────────────────────────────────────────────────────────────────
function templateWelcome({ doctorName, specialty, medicalId }) {
  const firstName = (doctorName || 'Doctor').split(' ')[0];
  const body = `
    ${p(`Dear Dr. ${firstName},`)}
    ${p(`We're excited to let you know that your application to join QuickMed as a doctor has been received.`)}
    ${p(`At QuickMed, we're building a system that makes healthcare more accessible, efficient, and reliable — and having you on board is a big part of that vision.`)}
    ${highlight(`🏥 <strong>Specialty:</strong> ${specialty || 'General Practice'}<br>
                🪪 <strong>Medical ID:</strong> ${medicalId || 'On file'}`)}
    ${p(`Our team will review your application and get back to you shortly. You'll receive a full onboarding guide once you're approved.`)}
    ${p(`If you have any questions in the meantime, our team is always on hand to assist.`)}
    ${divider}
    ${signOff()}
  `;

  return baseLayout({
    preheader: `We've received your QuickMed application, Dr. ${firstName}. We'll be in touch shortly.`,
    title:     'Welcome to QuickMed',
    subtitle:  'Application Received',
    body,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 2: ONBOARDING — sent after admin approves the doctor
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 3: AVAILABILITY
// ─────────────────────────────────────────────────────────────────────────────
function templateAvailability({ doctorName, availabilityLink }) {
  const firstName = (doctorName || 'Doctor').split(' ')[0];
  const link      = availabilityLink || DOCTOR_WHATSAPP_LINK;

  const body = `
    ${p(`Dear Dr. ${firstName},`)}
    ${p(`As we prepare to begin consultations on QuickMed, we'd like to know your availability for the coming week.`)}
    ${p(`This helps us properly schedule patient requests and ensure a smooth experience for everyone.`)}
    ${p(`Please share your availability via WhatsApp using the button below. Kindly include:`)}
    ${bulletList([
      'Your available days for the week',
      'Preferred consultation hours',
      'Any specific times you will not be available',
    ])}
    ${p(`We look forward to having you fully active soon.`)}
    ${p(`If you have any questions or require support, our team is always on hand to assist.`)}
    ${divider}
    ${p('Warm regards,', { color: '#64748b' })}
    <p style="margin:0;font-size:15px;font-weight:700;color:#0a1628">The QuickMed Team</p>
  `;

  return baseLayout({
    preheader: `Dr. ${firstName}, please share your availability for the coming week.`,
    title:     'Share Your Availability',
    subtitle:  'QuickMed Scheduling',
    body,
    cta: {
      url:      link,
      label:    '📅 Send Availability on WhatsApp',
      linkText: true,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 4: REJECTION
// ─────────────────────────────────────────────────────────────────────────────
function templateRejection({ doctorName, reason }) {
  const firstName = (doctorName || 'Doctor').split(' ')[0];
  const body = `nt platform needs and patient base.`)}
    ${p(`You are welcome to reapply in the future. If you believe this decision was made in error or would like to discuss it, please contact our support team.`)}
    ${divider}
    ${p('Warm regards,', { color: '#64748b' })}
    <p style="margin:0;font-size:15px;font-weight:700;color:#0a1628">The QuickMed Team</p>
  `;

  return baseLayout({
    preheader: `An update on your QuickMed doctor application, Dr. ${firstName}.`,
    title:     'Application Update',
    subtitle:  'QuickMed Doctor Registration',
    body,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 5: PAYOUT NOTIFICATION
// ─────────────────────────────────────────────────────────────────────────────
function templatePayout({ doctorName, amount, callCount, period, bankName, accountNumber }) {
  const firstName = (doctorName || 'Doctor').split(' ')[0];
  const fmt       = n => '₦' + Number(n).toLocaleString();

  
// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE 6: NEWSLETTER
// ─────────────────────────────────────────────────────────────────────────────
function templateNewsletter({ doctorName, headline, bodyContent, ctaLabel, ctaUrl }) {
  const firstName = (doctorName || 'Doctor').split(' ')[0];

  const processedBody = bodyContent.includes('<')
    ? bodyContent
    : bodyContent
        .split('\n\n')
        .filter(Boolean)
        .map(para => p(para.replace(/\n/g, '<br>')))
        .join('');

  const body = `
    ${p(`Dear Dr. ${firstName},`)}
    ${processedBody}
    ${divider}
    ${p('Warm regards,', { color: '#64748b' })}
    <p style="margin:0;font-size:15px;font-weight:700;color:#0a1628">The QuickMed Team</p>
  `;

  return baseLayout({
    preheader: headline,
    title:     headline,
    subtitle:  'QuickMed Newsletter',
    body,
    cta: ctaLabel && ctaUrl ? { url: ctaUrl, label: ctaLabel } : null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

// Core send — reply_to always defaults to SUPPORT_EMAIL so replies from
// doctors and patients land in the QuickMed support inbox, never get lost.
async function sendEmail({ to, subject, html, replyTo }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — email not sent');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }
  if (!to || !subject || !html) {
    return { success: false, error: 'Missing to, subject, or html' };
  }
  try {
    const data = await resend.emails.send({
      from:     FROM,                        // quickmed@quick-med.xyz
      to:       Array.isArray(to) ? to : [to],
      subject,
      html,
      reply_to: replyTo || SUPPORT_EMAIL,   // always support@quick-med.xyz unless explicitly overridden
    });
    console.log(`[email] ✅ Sent to ${to}: "${subject}" | id: ${data.id}`);
    return { success: true, id: data.id };
  } catch (e) {
    console.error('[email] ❌ Send failed:', e.message);
    return { success: false, error: e.message };
  }
}

// ── Direct doctor email (sent from admin dashboard) ───────────────────────────
// Wraps the doctor's plain-text message in the branded layout and ensures
// reply_to is explicitly set to SUPPORT_EMAIL so doctor replies come back
// to support@quick-med.xyz and NOT to quickmed@quick-med.xyz (which is
// send-only and does not receive incoming mail).
function templateDirectMessage({ doctorName, adminMessage }) {
  const firstName = (doctorName || 'Doctor').split(' ')[0];
  const paragraphs = adminMessage
    .split('\n\n')
    .filter(Boolean)
    .map(para => p(para.replace(/\n/g, '<br>')))
    .join('');

  const body = `
    ${p(`Dear Dr. ${firstName},`)}
    ${paragraphs}
    ${divider}
    ${p(`If you have any questions or need to respond, please reply directly to this email — your reply will reach our support team at <a href="mailto:${SUPPORT_EMAIL}" style="color:#00b4b4">${SUPPORT_EMAIL}</a>.`)}
    ${signOff()}
  `;

  return baseLayout({
    preheader: `A message from the QuickMed team for Dr. ${firstName}.`,
    title:     'Message from QuickMed',
    subtitle:  'Admin Communication',
    body,
  });
}

async function sendDirectDoctorEmail({ to, doctorName, subject, body }) {
  if (!to || !subject || !body) {
    return { success: false, error: 'Missing to, subject, or body' };
  }
  const html = templateDirectMessage({ doctorName, adminMessage: body });
  return sendEmail({
    to,
    subject,
    html,
    replyTo: SUPPORT_EMAIL,  // explicit — doctor hits Reply → goes to support@quick-med.xyz
  });
}

async function sendWelcomeEmail(doctor) {
  if (!doctor?.email) return { success: false, error: 'No email on file' };
  return sendEmail({
    to:      doctor.email,
    subject: `We've received your application, Dr. ${(doctor.full_name || '').split(' ')[0]} 🏥`,
    html:    templateWelcome({
      doctorName: doctor.full_name,
      specialty:  doctor.specialty,
      medicalId:  doctor.license_number,
    }),
  });
}

async function sendOnboardingEmail(doctor) {
  if (!doctor?.email) return { success: false, error: 'No email on file' };
  return sendEmail({
    to:      doctor.email,
    subject: `You're approved! Welcome to QuickMed, Dr. ${(doctor.full_name || '').split(' ')[0]} 🎉`,
    html:    templateOnboarding({
      doctorName:   doctor.full_name,
      whatsappLink: null,  // uses DOCTOR_WHATSAPP_LINK constant above
      playbookUrl:  null,  // uses DOCTOR_PLAYBOOK_URL constant above
    }),
  });
}

async function sendAvailabilityEmail(doctor) {
  if (!doctor?.email) return { success: false, error: 'No email on file' };
  return sendEmail({
    to:      doctor.email,
    subject: `Please share your availability — QuickMed`,
    html:    templateAvailability({ doctorName: doctor.full_name }),
  });
}

async function sendRejectionEmail(doctor, reason) {
  if (!doctor?.email) return { success: false, error: 'No email on file' };
  return sendEmail({
    to:      doctor.email,
    subject: `Update on your QuickMed application`,
    html:    templateRejection({ doctorName: doctor.full_name, reason }),
  });
}

async function sendPayoutEmail(doctor, { amount, callCount, period, bankName, accountNumber }) {
  if (!doctor?.email) return { success: false, error: 'No email on file' };
  return sendEmail({
    to:      doctor.email,
    subject: `QuickMed Payout — ₦${Number(amount).toLocaleString()} for ${period}`,
    html:    templatePayout({
      doctorName: doctor.full_name,
      amount, callCount, period, bankName, accountNumber,
    }),
  });
}

async function sendNewsletter({ doctors, subject, headline, bodyContent, ctaLabel, ctaUrl }) {
  if (!doctors || doctors.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  let sent = 0, failed = 0, skipped = 0;

  for (const doctor of doctors) {
    if (!doctor.email) { skipped++; continue; }

    const html = templateNewsletter({
      doctorName: doctor.full_name,
      headline, bodyContent, ctaLabel, ctaUrl,
    });

    const result = await sendEmail({ to: doctor.email, subject, html });
    if (result.success) sent++;
    else failed++;

    await new Promise(r => setTimeout(r, 200)); // stay under Resend rate limits
  }

  console.log(`[email] Newsletter complete — sent: ${sent}, failed: ${failed}, skipped (no email): ${skipped}`);
  return { sent, failed, skipped };
}

// ── Preview ───────────────────────────────────────────────────────────────────
function previewTemplate(type, sampleData = {}) {
  const sample = {
    doctorName:    sampleData.doctorName    || 'Daniel Igofur White',
    bankName:      sampleData.bankName      || 'GTBank',
    accountNumber: sampleData.accountNumber || '0123456789',
    headline:      sampleData.headline      || 'A message from the QuickMed team',
    bodyContent:   sampleData.bodyContent   || 'This is a sample newsletter body.\n\nIt can have multiple paragraphs.\n\nEach paragraph separated by a blank line.',
    ctaLabel:      sampleData.ctaLabel      || null,
    ctaUrl:        sampleData.ctaUrl        || null,
  };

  switch (type) {
    case 'welcome':      return templateWelcome(sample);
    case 'onboarding':   return templateOnboarding(sample);
    case 'availability': return templateAvailability(sample);
    case 'newsletter':   return templateNewsletter(sample);
    default:             return templateWelcome(sample);
  }
}

module.exports = {
  sendRejectionEmail,
  sendPayoutEmail,
  sendNewsletter,
  sendDirectDoctorEmail,   // ← use this in /api/admin/email/send-direct route
  previewTemplate,
  sendEmail,
};