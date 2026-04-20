// stellarPaymentService.js
// Handles USDC payment initialization and verification for diaspora patients.
//
// TESTNET vs MAINNET behaviour:
//   STELLAR_NETWORK=testnet  → Stellar Laboratory links + TEST_BYPASS support
//   STELLAR_NETWORK=mainnet  → Real Lobstr deep links + correct USDC issuer

const stellarService             = require('./stellarService');
const { ngnToUsdc, getRateInfo } = require('./exchangeRateService');
require('dotenv').config();

const USDC_ISSUER = {
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  testnet: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
};

function getNetwork() { return (process.env.STELLAR_NETWORK || 'testnet').toLowerCase(); }
function isTestnet()   { return getNetwork() === 'testnet'; }
function usdcIssuer()  { return USDC_ISSUER[getNetwork()] || USDC_ISSUER.testnet; }

// ── 1. INITIALIZE STELLAR PAYMENT ────────────────────────────────────────────

async function initializeStellarPayment(sessionRef, ngnAmount, metadata = {}) {
  try {
    if (!stellarService.isConfigured()) {
      console.error('[stellar-pay] Stellar keys not configured');
      return { success: false, message: 'Stellar payment not configured' };
    }

    // Fetch live rate ONCE here — pass it to generatePaymentRequest so
    // stellarService doesn't make a second fetch for the same payment.
    const amountUSDC = await ngnToUsdc(ngnAmount);
    const rateInfo   = await getRateInfo();

    console.log(`[stellar-pay] Rate: ₦${rateInfo.rate}/USDC (${rateInfo.source}) | ₦${ngnAmount} → ${amountUSDC} USDC`);

    const description = metadata.specialty
      ? `${metadata.specialty} consultation — ${metadata.date} ${metadata.time}`
      : 'QuickMed consultation';

    const paymentRequest = await stellarService.generatePaymentRequest(
      sessionRef,
      ngnAmount,
      metadata.patient_name || 'Patient',
      description,
      amountUSDC   // pass pre-computed so stellarService doesn't fetch again
    );

    if (!paymentRequest.success) {
      return { success: false, message: paymentRequest.reason };
    }

    const { memo, stellarUri, receivingAddress, manualInstructions } = paymentRequest;
    const walletLinks = buildWalletLinks(receivingAddress, amountUSDC, memo);

    console.log(`[stellar-pay] ✅ Initialized — ref: ${sessionRef} | ${amountUSDC} USDC | ${getNetwork()}`);

    return {
      success:          true,
      reference:        sessionRef,
      paymentMethod:    'stellar',
      network:          getNetwork(),
      isTestnet:        isTestnet(),
      amountUSDC,
      amountNGN:        ngnAmount,
      exchangeRate:     rateInfo.rate,
      rateSource:       rateInfo.source,
      memo,
      stellarUri,
      receivingAddress,
      manualInstructions,
      walletLinks,
      message:          'Stellar payment initialized',
    };

  } catch (err) {
    console.error('[stellar-pay] initializeStellarPayment error:', err.message);
    return { success: false, message: err.message };
  }
}

// ── 2. VERIFY STELLAR PAYMENT ─────────────────────────────────────────────────
//
// Uses the same live rate (from cache) that was used at init time —
// so the expected USDC amount during verification matches what the patient
// was shown. The 1% on-chain tolerance covers any tiny cache drift.

async function verifyStellarPayment(memo, expectedAmountNGN) {
  try {
    // Testnet bypass
    if (isTestnet() && typeof memo === 'string' && memo.endsWith(':TEST_BYPASS')) {
      console.log(`[stellar-pay] 🧪 TEST_BYPASS accepted for memo: ${memo}`);
      const bypassUSDC = await ngnToUsdc(expectedAmountNGN);
      return {
        success:     true,
        verified:    true,
        amountUSDC:  bypassUSDC,
        amountNGN:   expectedAmountNGN,
        txHash:      'TEST_BYPASS_TX',
        explorerUrl: null,
        paidAt:      new Date().toISOString(),
        message:     'TEST_BYPASS — simulated payment (testnet only)',
      };
    }

    // Convert NGN → USDC using live rate (same cached value used at init)
    const expectedUSDC = await ngnToUsdc(expectedAmountNGN);
    console.log(`[stellar-pay] Verifying ${memo} — expecting ${expectedUSDC} USDC (₦${expectedAmountNGN})`);

    const result = await stellarService.verifyStellarPayment(memo, expectedUSDC);

    if (!result.success) {
      return { success: false, verified: false, message: result.reason || 'Verification error' };
    }

    if (!result.verified) {
      const reasonMessages = {
        payment_not_found:   'Payment not found yet — please complete the transfer and try again.',
        insufficient_amount: `Payment received but amount was too low (got ${result.paidAmount} USDC, need ${expectedUSDC} USDC).`,
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

// ── 3. FORMAT PAYMENT MESSAGE ─────────────────────────────────────────────────
//
// Now shows the live exchange rate so patients know exactly what they're getting.

function formatStellarPaymentMessage(paymentData, doctorName, date, time) {
  const {
    amountUSDC, amountNGN, receivingAddress, memo,
    walletLinks, exchangeRate, rateSource,
  } = paymentData;
  const testnet = isTestnet();

  const shortAddr  = `${receivingAddress.slice(0, 8)}...${receivingAddress.slice(-6)}`;
  const rateLabel  = rateSource === 'live' ? '_(live)_' : '_(estimated)_';
  const rateDisplay = exchangeRate
    ? `\n📊 *Rate:* ₦${Number(exchangeRate).toLocaleString()}/USDC ${rateLabel}`
    : '';

  const header =
    `⭐ *Pay with USDC on Stellar*` +
    (testnet ? ` _(TESTNET)_` : ``) + `\n\n` +
    (doctorName ? `👨‍⚕️ Dr. ${doctorName}\n` : ``) +
    `📅 ${date} at ${time}\n\n` +
    `💵 *Amount:* ${amountUSDC} USDC _(≈ ₦${Number(amountNGN).toLocaleString()})_` +
    rateDisplay + `\n` +
    `🔑 *Memo:* \`${memo}\`  ← _required_\n\n`;

  if (testnet) {
    return (
      header +
      `🧪 *TESTNET MODE — use Stellar Laboratory*\n\n` +
      `📲 *Open Stellar Laboratory:*\n${walletLinks.laboratory}\n\n` +
      `📋 *Fill in these values:*\n` +
      `• Destination: \`${receivingAddress}\`\n` +
      `• Asset: USDC (issuer: \`${usdcIssuer().slice(0, 8)}...\`)\n` +
      `• Amount: *${amountUSDC}*\n` +
      `• Memo type: Text · Memo value: *${memo}*\n\n` +
      `⚠️ _Memo is required — without it payment cannot be matched._\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `🧑‍💻 *Developer shortcut — skip the send:*\n` +
      `Type this exactly and tap *Verify Payment*:\n` +
      `\`${memo}:TEST_BYPASS\`\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `Once sent (or bypassed), tap *Verify Payment* to confirm.`
    );
  } else {
    return (
      header +
      `📲 *Tap to pay in Lobstr:*\n${walletLinks.lobstr}\n\n` +
      `🔢 *Or send manually in any Stellar wallet:*\n` +
      `• Address: \`${shortAddr}\`\n  _(full: ${receivingAddress})_\n` +
      `• Asset: *USDC*\n• Amount: *${amountUSDC}*\n• Memo (text): *${memo}*\n\n` +
      `⚠️ _Memo is required — without it payment cannot be matched._\n\n` +
      `Once sent, tap *Verify Payment* to confirm your booking.\n` +
      `New to Stellar? Get Lobstr at lobstr.co`
    );
  }
}

// ── 4. WALLET DEEP LINKS ──────────────────────────────────────────────────────

function buildWalletLinks(address, amountUSDC, memo) {
  const issuer = usdcIssuer();

  if (isTestnet()) {
    const labOp = {
      attributes: { sourceAccount: '', sequence: '', fee: '100', memoType: 'MEMO_TEXT', memoContent: memo },
      operations: [{ id: 0, name: 'payment', attributes: { destination: address, asset: `USDC:${issuer}`, amount: String(amountUSDC) } }]
    };
    return {
      laboratory: `https://laboratory.stellar.org/#txbuilder?network=test&params=${encodeURIComponent(JSON.stringify(labOp))}`,
      lobstr:     null,
      sep7:       null,
    };
  } else {
    const lobstrParams = new URLSearchParams({
      destination: address, amount: String(amountUSDC),
      asset_code: 'USDC', asset_issuer: issuer,
      memo, memo_type: 'text',
    });
    return { lobstr: `https://lobstr.co/pay?${lobstrParams.toString()}`, laboratory: null, sep7: null };
  }
}

// ── 5. TEST BYPASS HELPER ─────────────────────────────────────────────────────

function extractTestBypass(messageText, currentMemo) {
  if (!isTestnet()) return null;
  const clean = (messageText || '').trim();
  if (clean === 'TEST_BYPASS' || clean === `${currentMemo}:TEST_BYPASS`) {
    return `${currentMemo}:TEST_BYPASS`;
  }
  return null;
}

// ── 6. AVAILABILITY CHECK ─────────────────────────────────────────────────────

function isAvailable() { return stellarService.isConfigured(); }

module.exports = {
  initializeStellarPayment,
  verifyStellarPayment,
  formatStellarPaymentMessage,
  extractTestBypass,
  isAvailable,
  isTestnet,
  getNetwork,
};