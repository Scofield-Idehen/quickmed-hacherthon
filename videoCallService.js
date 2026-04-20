// videoCallService.js
// Generates Jitsi Meet room details for QuickMed consultations.
//
// Previously used Whereby API (paid). Now uses Jitsi Meet (free, no API key).
// Both doctor and patient join the same Jitsi room via the QuickMed
// consultation page (/consult/:appointmentId?role=doctor|patient).
//
// The room name is derived from the booking ID so it is:
//   - Deterministic (same ID always gives the same room)
//   - Unique per appointment
//   - Human-readable in logs
//
// No external API call is made. No credentials needed.
// Whereby subscription can be cancelled.
'use strict';

const BASE_URL = process.env.BASE_URL || 'https://web3tribe.xyz';

/**
 * Generate meeting details for a consultation.
 *
 * @param {string|object} appointmentIdOrObj - booking ID string, or legacy
 *   object shape { appointmentId } from old Whereby call sites.
 * @returns {{ patientLink: string, hostLink: string, jitsiRoom: string }}
 */
function createMeeting(appointmentIdOrObj) {

  const rawId = typeof appointmentIdOrObj === 'string'
    ? appointmentIdOrObj
String(Date.now()));

  // Clean the ID to a URL-safe room name
  // e.g. "QM14605645" → "QuickMed-QM14605645"
  //      "550e8400-e29b-41d4-..." → "QuickMed-550e8400e29b"
  const roomSlug = 'QuickMed-' + rawId.replace(/-/g, '').slice(0, 20);

  return {
    patientLink,
    hostLink,
  };
}

module.exports = { createMeeting };