// stellarPaymentService.js
// Handles USDC payment initialization and verification for diaspora patients.
// Mirrors the structure of paystackService.js so the booking flow can treat
// both payment rails identically — same session fields, same verify pattern.
//
// Flow:
//   1. initializeStellarPayment()  → returns payment request (address + amount + memo)
//   2. Patient pays via any Stellar wallet (Lobstr, Freighter, Stellarterm, Valora)
//   3. verifyStellarPayment()      → polls Horizon for matching tx → returns verified:true
//   4. Booking completes identically to a Paystack booking

const stellarService = require('./stellarService');
require('dotenv').config();

// ── 1. INITIALIZE STELLAR PAYMENT ─────────────────────────────────────────────
//
// Generates a USDC payment request for the patient.
// Called at the same point in the booking flow where Paystack is initialized.
//
// @param sessionRef  - Unique booking session reference (reuses Paystack-style QM ref)
// @param ngnAmount   - Fee in Nigerian Naira (converted to USDC internally)
// @param metadata    - { patient_name, phone, specialty, date, time, doctor_id }
//
// Returns: { success, reference, amountUSDC, amountNGN, stellarUri, receivingAddress,
//            memo, manualInstructions, walletLinks }

async function initializeStellarPayment(sessionRef, ngnAmount, metadata = {}) {
  try {
    if (!stellarService.isConfigured()) {
      console.error('[stellar-pay] Stellar keys not configured');
      return { success: false, message: 'Stellar payment not configured' };
    }

    const description = metadata.specialty
      ? `${metadata.specialty} consultation — ${metadata.date} ${metadata.time}`
      : 'QuickMed consultation';

    const paymentRequest = await stellarService.generatePaymentRequest(
      sessionRef,
      ngnAmount,
      metadata.patient_name || 'Patient',
      description
    );

    if (!paymentRequest.success) {
      return { success: false, message: paymentRequest.reason };
    }

    const { amountUSDC, memo, stellarUri, receivingAddress, manualInstructions } = paymentRequest;

    // Deep links for the most popular wallets in Africa/diaspora
    // Lobstr is dominant in Nigeria; Freighter for web users
    const walletLinks = buildWalletLinks(stellarUri, receivingAddress, amountUSDC, memo);

    console.log(`[stellar-pay] ✅ Payment initialized — ref: ${sessionRef} | ${amountUSDC} USDC`);

    return {
      success:            true,
      reference:          sessionRef,  // matches Paystack naming so session code is identical
      paymentMethod:      'stellar',
      amountUSDC,
      amountNGN:          ngnAmount,
      memo,
      stellarUri,
      receivingAddress,
      manualInstructions,
      walletLinks,
      message:            'Stellar payment initialized',
    };

  } catch (err) {
    console.error('[stellar-pay] initializeStellarPayment error:', err.message);
    return { success: false, message: err.message };
  }
}

// ── 2. VERIFY STELLAR PAYMENT ─────────────────────────────────────────────────
//
// Checks Horizon for a payment matching the memo and expected amount.
// Called when patient taps "Verify Payment" — same UX as Paystack verification.
//
// @param memo              - The memo string from the payment request
// @param expectedAmountNGN - Original NGN amount (converted to USDC for comparison)
//
// Returns: { success, verified, amountUSDC, txHash, paidAt, message }

async function verifyStellarPayment(memo, expectedAmountNGN) {
  try {
    const expectedUSDC = stellarService.ngnToUsdc(expectedAmountNGN);

    const result = await stellarService.verifyStellarPayment(memo, expectedUSDC);

    if (!result.success) {
      return {
        success:  false,
        verified: false,
        message:  result.reason || 'Verification error',
      };
    }

    if (!result.verified) {
      const reasonMessages = {
        payment_not_found:  'Payment not found yet — please complete the transfer and try again.',
        insufficient_amount:`Payment received but amount was insufficient (paid ${result.paidAmount} USDC, expected ${expectedUSDC} USDC).`,
      };
      return {
        success:  true,
        verified: false,
        message:  reasonMessages[result.reason] || 'Payment not confirmed yet.',
      };
    }

    return {
      success:     true,
      verified:    true,
      amountUSDC:  result.amountUSDC,
      amountNGN:   expectedAmountNGN,
      txHash:      result.txHash,
      explorerUrl: result.explorerUrl,
      paidAt:      result.paidAt,
      message:     'Payment confirmed on Stellar',
    };

  } catch (err) {
    console.error('[stellar-pay] verifyStellarPayment error:', err.message);
    return { success: false, verified: false, message: err.message };
  }
}

// ── 3. FORMAT PAYMENT MESSAGE FOR WHATSAPP ────────────────────────────────────
//
// Returns a WhatsApp-formatted message with payment instructions.
// Sent to the patient after initializeStellarPayment() succeeds.
// Mirrors formatPaymentMessage() in paystackService.js.

function formatStellarPaymentMessage(paymentData, doctorName, date, time) {
  const { amountUSDC, amountNGN, receivingAddress, memo, walletLinks, manualInstructions } = paymentData;

  return (
    `💫 *Pay with USDC on Stellar*\n\n` +
    `👨‍⚕️ Dr. ${doctorName}\n` +
    `📅 ${date} at ${time}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `💵 *Amount:* ${amountUSDC} USDC\n` +
    `   _(≈ ₦${Number(amountNGN).toLocaleString()})_\n\n` +
    `📲 *Pay via wallet app:*\n` +
    `${walletLinks.lobstr ? `• Lobstr: ${walletLinks.lobstr}\n` : ''}` +
    `${walletLinks.freighter ? `• Freighter: ${walletLinks.freighter}\n` : ''}` +
    `\n` +
    `🔢 *Or send manually:*\n` +
    `• To: \`${receivingAddress}\`\n` +
    `• Amount: *${amountUSDC} USDC*\n` +
    `• Memo (text): *${memo}*\n` +
    `• ⚠️ _Memo is required — without it we can't match your payment_\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `After sending, tap *Verify Payment* to confirm your booking.\n\n` +
    `Need Stellar/USDC? Download Lobstr: https://lobstr.co`
  );
}

// ── 4. WALLET DEEP LINKS ──────────────────────────────────────────────────────
//
// Builds deep links for popular wallets so patient can tap to open directly.
// Most wallets support SEP-7 (web+stellar: URI scheme).

function buildWalletLinks(stellarUri, address, amountUSDC, memo) {
  // Lobstr — most popular wallet in Africa
  // Supports web+stellar: URI directly
  const lobstr = `https://lobstr.co/pay?${new URLSearchParams({
    destination: address,
    asset:       'USDC',
    amount:      String(amountUSDC),
    memo,
    memo_type:   'text',
  }).toString()}`;

  // Freighter — browser extension wallet, popular for web users
  // Doesn't support deep links but shows SEP-7 URI
  const freighter = stellarUri;

  return { lobstr, freighter, sep7: stellarUri };
}

// ── 5. CHECK IF STELLAR IS AVAILABLE ─────────────────────────────────────────
// Called before showing the Stellar payment option to the patient.

function isAvailable() {
  return stellarService.isConfigured();
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  initializeStellarPayment,
  verifyStellarPayment,
  formatStellarPaymentMessage,
  isAvailable,
};