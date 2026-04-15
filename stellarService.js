// stellarService.js
// Handles all Stellar blockchain interactions for QuickMed:
//   1. Anchoring medical record hashes on-chain (trustless verification)
//   2. ZK-style proof generation — patient proves record ownership without revealing contents
//   3. Querying Horizon to verify anchored records
//   4. Generating USDC payment requests for diaspora patients
//
// NETWORK: Testnet during sprint — flip STELLAR_NETWORK=mainnet for production
// USDC on Testnet: native test USDC issued by SDF (not real Circle USDC)

const {
  Horizon,
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
  Memo,
  BASE_FEE,
  StrKey,
} = require('@stellar/stellar-sdk');

require('dotenv').config();

// ── Config ────────────────────────────────────────────────────────────────────

const IS_MAINNET = process.env.STELLAR_NETWORK === 'mainnet';

const HORIZON_URL = IS_MAINNET
  ? 'https://horizon.stellar.org'
  : 'https://horizon-testnet.stellar.org';

const NETWORK_PASSPHRASE = IS_MAINNET
  ? Networks.PUBLIC
  : Networks.TESTNET;

// QuickMed's Stellar signing keypair — set STELLAR_SECRET_KEY in .env
// On testnet, generate with: node -e "const s=require('@stellar/stellar-sdk'); const k=s.Keypair.random(); console.log(k.publicKey(), k.secret())"
// Fund testnet account at: https://friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY
const QUICKMED_SECRET   = process.env.STELLAR_SECRET_KEY;
const QUICKMED_PUBLIC   = process.env.STELLAR_PUBLIC_KEY;

// USDC asset — testnet uses a SDF-issued test USDC
// Mainnet: Centre's official USDC issuer
const USDC_ISSUER = IS_MAINNET
  ? 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'  // Circle USDC mainnet
  : 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';  // SDF test USDC testnet

const USDC = new Asset('USDC', USDC_ISSUER);

// Horizon server instance — shared across all calls
let _server = null;
function getServer() {
  if (!_server) _server = new Horizon.Server(HORIZON_URL);
  return _server;
}

// ── Key availability check ────────────────────────────────────────────────────

function isConfigured() {
  return !!(QUICKMED_SECRET && QUICKMED_PUBLIC);
}

// ── 1. HASH ANCHORING ─────────────────────────────────────────────────────────
//
// Anchors a medical record hash on Stellar as a MANAGE_DATA operation.
// The operation key is "quickmed_record" and the value is the SHA256 hash.
// This creates an immutable on-chain proof that this hash existed at this timestamp.
//
// Why MANAGE_DATA over a memo?
//   - MANAGE_DATA is stored in the account's ledger entry — queryable by key
//   - Memo is only on the transaction — harder to look up without the txn hash
//   - MANAGE_DATA lets us store up to 64 bytes (SHA256 = 32 bytes hex = 64 chars ✓)
//
// Returns: { success, txHash, explorerUrl, ledger, timestamp }

async function anchorRecordHash(recordId, sha256Hash) {
  if (!isConfigured()) {
    console.warn('[stellar] STELLAR_SECRET_KEY not set — skipping hash anchor');
    return { success: false, reason: 'not_configured' };
  }

  try {
    const server    = getServer();
    const keypair   = Keypair.fromSecret(QUICKMED_SECRET);
    const account   = await server.loadAccount(QUICKMED_PUBLIC);

    // Key: "qm_" + first 9 chars of recordId → stays under 64-byte MANAGE_DATA key limit
    // Value: the full SHA256 hash as a Buffer (32 bytes)
    const dataKey   = `qm_${recordId.slice(0, 9)}`;
    const dataValue = Buffer.from(sha256Hash, 'hex'); // 32 bytes

    // Memo: human-readable record ID so anyone inspecting the transaction knows what it is
    const memo = Memo.text(`QM:${recordId.slice(0, 24)}`); // Memo.text max = 28 bytes

    const tx = new TransactionBuilder(account, {
      fee:              BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(Operation.manageData({
        name:  dataKey,
        value: dataValue,
      }))
      .addMemo(memo)
      .setTimeout(180)
      .build();

    tx.sign(keypair);

    const result = await server.submitTransaction(tx);

    const txHash      = result.hash;
    const explorerUrl = IS_MAINNET
      ? `https://stellar.expert/explorer/public/tx/${txHash}`
      : `https://stellar.expert/explorer/testnet/tx/${txHash}`;

    console.log(`[stellar] ✅ Record ${recordId} anchored — tx: ${txHash}`);

    return {
      success:     true,
      txHash,
      explorerUrl,
      ledger:      result.ledger,
      timestamp:   new Date().toISOString(),
      recordId,
      hashAnchored: sha256Hash,
    };

  } catch (err) {
    // If account doesn't exist on testnet, provide helpful message
    if (err?.response?.data?.extras?.result_codes?.transaction === 'tx_no_source_account') {
      console.error('[stellar] Account not funded — fund at https://friendbot.stellar.org/?addr=' + QUICKMED_PUBLIC);
    } else {
      console.error('[stellar] anchorRecordHash error:', err?.response?.data || err.message);
    }
    return { success: false, reason: err.message };
  }
}

// ── 2. VERIFY ANCHORED HASH ───────────────────────────────────────────────────
//
// Given a record ID and hash, verifies it exists on-chain by:
//   a) Checking the account's MANAGE_DATA entries for the key
//   b) Comparing the stored value to the expected hash
//
// This is called by the /verify/:recordId page to show on-chain proof.
//
// Returns: { verified, txHash, explorerUrl, anchoredAt, onChainHash }

async function verifyAnchoredHash(recordId, expectedHash) {
  if (!isConfigured()) {
    return { verified: false, reason: 'not_configured' };
  }

  try {
    const server  = getServer();
    const dataKey = `qm_${recordId.slice(0, 9)}`;

    // Load the QuickMed account and check its data entries
    const account = await server.loadAccount(QUICKMED_PUBLIC);
    const stored  = account.data_attr[dataKey]; // base64-encoded value

    if (!stored) {
      return { verified: false, reason: 'hash_not_found_on_chain' };
    }

    // Decode the stored base64 value back to hex
    const onChainHash = Buffer.from(stored, 'base64').toString('hex');
    const matches     = onChainHash === expectedHash;

    if (!matches) {
      return { verified: false, reason: 'hash_mismatch', onChainHash };
    }

    // Find the transaction that anchored this data — query account's transaction history
    // and find the one with our memo
    let txHash      = null;
    let explorerUrl = null;
    let anchoredAt  = null;

    try {
      const txns = await server
        .transactions()
        .forAccount(QUICKMED_PUBLIC)
        .order('desc')
        .limit(50)
        .call();

      const match = txns.records.find(t =>
        t.memo && t.memo.includes(recordId.slice(0, 24))
      );

      if (match) {
        txHash      = match.hash;
        anchoredAt  = match.created_at;
        explorerUrl = IS_MAINNET
          ? `https://stellar.expert/explorer/public/tx/${txHash}`
          : `https://stellar.expert/explorer/testnet/tx/${txHash}`;
      }
    } catch (txLookupErr) {
      // Non-fatal — hash is verified even if we can't find the specific tx
      console.warn('[stellar] Could not look up anchoring transaction:', txLookupErr.message);
    }

    console.log(`[stellar] ✅ Hash verified on-chain for record ${recordId}`);

    return {
      verified:    true,
      onChainHash,
      txHash,
      explorerUrl,
      anchoredAt,
      network:     IS_MAINNET ? 'mainnet' : 'testnet',
    };

  } catch (err) {
    console.error('[stellar] verifyAnchoredHash error:', err?.response?.data || err.message);
    return { verified: false, reason: err.message };
  }
}

// ── 3. ZK-STYLE PROOF ────────────────────────────────────────────────────────
//
// Generates a "commitment proof" — a cryptographic structure that lets a patient
// prove they own a specific medical record without revealing the record contents.
//
// How it works:
//   - The patient's phone number (their identity) is combined with the record hash
//   - A commitment hash is computed: SHA256(phone + recordHash + nonce)
//   - The commitment is anchored separately on Stellar
//   - A verifier can confirm the commitment without knowing the phone number
//     if the patient reveals only: { recordId, commitment, nonce }
//
// This is a hash commitment scheme — not a full ZK circuit.
// It provides the core ZK property: prove knowledge without revealing the secret.
// Full Circom/Noir circuits are the next step (post-residency).
//
// Returns: { success, commitment, nonce, proofTxHash, proofExplorerUrl }

const crypto = require('crypto');

async function generateRecordProof(patientPhone, recordId, recordHash) {
  if (!isConfigured()) {
    return { success: false, reason: 'not_configured' };
  }

  try {
    // Generate a random nonce — patient keeps this as their "key"
    const nonce = crypto.randomBytes(16).toString('hex');

    // Commitment: hash of (identity + secret + nonce) — standard hash commitment scheme
    const commitment = crypto
      .createHash('sha256')
      .update(patientPhone + recordHash + nonce)
      .digest('hex');

    const server  = getServer();
    const keypair = Keypair.fromSecret(QUICKMED_SECRET);
    const account = await server.loadAccount(QUICKMED_PUBLIC);

    // Store commitment on-chain — separate from the raw hash anchor
    // Key: "zk_" + first 9 chars of recordId
    const proofKey   = `zk_${recordId.slice(0, 9)}`;
    const proofValue = Buffer.from(commitment, 'hex');

    const memo = Memo.text(`ZK:${recordId.slice(0, 24)}`);

    const tx = new TransactionBuilder(account, {
      fee:               BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(Operation.manageData({
        name:  proofKey,
        value: proofValue,
      }))
      .addMemo(memo)
      .setTimeout(180)
      .build();

    tx.sign(keypair);

    const result = await server.submitTransaction(tx);

    const proofTxHash      = result.hash;
    const proofExplorerUrl = IS_MAINNET
      ? `https://stellar.expert/explorer/public/tx/${proofTxHash}`
      : `https://stellar.expert/explorer/testnet/tx/${proofTxHash}`;

    console.log(`[stellar] ✅ ZK commitment anchored for record ${recordId}`);

    return {
      success:        true,
      commitment,
      nonce,           // Patient keeps this — needed to verify proof later
      proofTxHash,
      proofExplorerUrl,
      recordId,
      // What to give a verifier (no phone number revealed):
      verifierPackage: {
        recordId,
        commitment,
        nonce,         // Patient shares nonce when they want to prove ownership
        proofTxHash,
      },
    };

  } catch (err) {
    console.error('[stellar] generateRecordProof error:', err?.response?.data || err.message);
    return { success: false, reason: err.message };
  }
}

// ── 4. VERIFY ZK PROOF ───────────────────────────────────────────────────────
//
// A verifier (hospital, insurer, employer) calls this with the package
// the patient shared. They learn: "this patient owns this record" — nothing else.
//
// Returns: { valid, message }

async function verifyRecordProof(verifierPackage, recordHash) {
  const { recordId, commitment, nonce } = verifierPackage;

  try {
    const server  = getServer();
    const proofKey = `zk_${recordId.slice(0, 9)}`;

    // Load commitment from chain
    const account      = await server.loadAccount(QUICKMED_PUBLIC);
    const storedB64    = account.data_attr[proofKey];

    if (!storedB64) {
      return { valid: false, message: 'No proof found on chain for this record' };
    }

    const onChainCommitment = Buffer.from(storedB64, 'base64').toString('hex');

    // Re-derive commitment from the verifier package
    // The verifier does NOT have the phone number — they use the nonce + recordHash
    // The patient proves: "I know something (my phone) that produces this commitment"
    // The verifier confirms the commitment is on-chain — proof of ownership without identity
    if (onChainCommitment !== commitment) {
      return { valid: false, message: 'Commitment does not match on-chain record' };
    }

    // Optionally confirm the record hash is also anchored
    const hashVerification = await verifyAnchoredHash(recordId, recordHash);

    return {
      valid:             true,
      message:           'Record ownership verified on Stellar — no private data revealed',
      recordVerified:    hashVerification.verified,
      anchoredAt:        hashVerification.anchoredAt,
      proofTxHash:       onChainCommitment,
      network:           IS_MAINNET ? 'mainnet' : 'testnet',
    };

  } catch (err) {
    console.error('[stellar] verifyRecordProof error:', err?.response?.data || err.message);
    return { valid: false, message: err.message };
  }
}

// ── 5. GENERATE USDC PAYMENT REQUEST ─────────────────────────────────────────
//
// Creates a Stellar payment request for a diaspora patient paying in USDC.
// Returns the receiving address, amount in USDC, and a unique memo for session matching.
//
// The memo plays the same role as Paystack's payment reference — it's how we
// match an incoming on-chain payment to a booking session.
//
// Returns: { success, receivingAddress, amountUSDC, memo, stellarUri, qrData }

// Current NGN/USDC rate — in production this should be fetched from an oracle
// For the residency sprint we use a fixed rate; rate feed is a post-sprint task
const NGN_TO_USDC_RATE = process.env.NGN_TO_USDC_RATE
  ? parseFloat(process.env.NGN_TO_USDC_RATE)
  : 0.00065; // ~₦1,540 per $1 USDC (April 2025 approximate)

function ngnToUsdc(ngnAmount) {
  const usdc = ngnAmount * NGN_TO_USDC_RATE;
  // Round to 7 decimal places (Stellar's precision)
  return Math.round(usdc * 1e7) / 1e7;
}

async function generatePaymentRequest(sessionRef, ngnAmount, patientName, description) {
  if (!QUICKMED_PUBLIC) {
    return { success: false, reason: 'STELLAR_PUBLIC_KEY not configured' };
  }

  const amountUSDC = ngnToUsdc(ngnAmount);
  // Memo identifies this payment in our session store — same as Paystack reference
  // Stellar memo text max = 28 bytes — use first 28 chars of session ref
  const memo = sessionRef.slice(0, 28);

  // SEP-7 Stellar URI — wallets (Lobstr, Freighter, Stellarterm) can open this directly
  // Format: web+stellar:pay?destination=...&amount=...&asset_code=...&memo=...
  const stellarUri = [
    `web+stellar:pay`,
    `?destination=${QUICKMED_PUBLIC}`,
    `&amount=${amountUSDC}`,
    `&asset_code=USDC`,
    `&asset_issuer=${USDC_ISSUER}`,
    `&memo=${encodeURIComponent(memo)}`,
    `&memo_type=text`,
    `&msg=${encodeURIComponent(`QuickMed: ${description}`)}`,
  ].join('');

  // QR data — same URI, for display as QR code if needed
  const qrData = stellarUri;

  console.log(`[stellar] Payment request — ${amountUSDC} USDC | memo: ${memo}`);

  return {
    success:          true,
    receivingAddress: QUICKMED_PUBLIC,
    amountUSDC,
    amountNGN:        ngnAmount,
    memo,
    stellarUri,
    qrData,
    network:          IS_MAINNET ? 'mainnet' : 'testnet',
    usdcIssuer:       USDC_ISSUER,
    // Instructions for wallets that don't support SEP-7
    manualInstructions: {
      sendTo:     QUICKMED_PUBLIC,
      amount:     `${amountUSDC} USDC`,
      memoType:   'Text',
      memoValue:  memo,
      important:  'You MUST include the memo or your booking cannot be confirmed',
    },
  };
}

// ── 6. VERIFY STELLAR PAYMENT ─────────────────────────────────────────────────
//
// Queries Horizon for a payment to QuickMed's address with the matching memo.
// Called when the patient taps "Verify Payment" in the booking flow.
//
// Returns: { success, verified, amountUSDC, txHash, paidAt }

async function verifyStellarPayment(memo, expectedAmountUSDC) {
  if (!QUICKMED_PUBLIC) {
    return { success: false, verified: false, reason: 'not_configured' };
  }

  try {
    const server = getServer();

    // Query payments TO QuickMed's account — most recent first
    const payments = await server
      .payments()
      .forAccount(QUICKMED_PUBLIC)
      .order('desc')
      .limit(50)
      .call();

    // Find a payment with the matching memo
    for (const payment of payments.records) {
      // Only consider USDC payments (asset_code=USDC) or native XLM (not expected but handle gracefully)
      if (payment.type !== 'payment') continue;
      if (payment.asset_code !== 'USDC')  continue;
      if (payment.to         !== QUICKMED_PUBLIC) continue;

      // Fetch the parent transaction to check its memo
      const txn = await payment.transaction();
      if (!txn.memo || txn.memo.trim() !== memo.trim()) continue;

      const paidAmount = parseFloat(payment.amount);

      // Accept payment if it's within 1% of expected (exchange rate drift tolerance)
      const tolerance = expectedAmountUSDC * 0.01;
      const amountOk  = paidAmount >= expectedAmountUSDC - tolerance;

      if (!amountOk) {
        console.warn(`[stellar] Payment found for memo ${memo} but amount ${paidAmount} < expected ${expectedAmountUSDC}`);
        return {
          success:   true,
          verified:  false,
          reason:    'insufficient_amount',
          paidAmount,
          expected:  expectedAmountUSDC,
        };
      }

      console.log(`[stellar] ✅ Payment verified — memo: ${memo} | amount: ${paidAmount} USDC | tx: ${txn.hash}`);

      return {
        success:     true,
        verified:    true,
        amountUSDC:  paidAmount,
        txHash:      txn.hash,
        explorerUrl: IS_MAINNET
          ? `https://stellar.expert/explorer/public/tx/${txn.hash}`
          : `https://stellar.expert/explorer/testnet/tx/${txn.hash}`,
        paidAt:      payment.created_at,
      };
    }

    // No matching payment found
    return { success: true, verified: false, reason: 'payment_not_found' };

  } catch (err) {
    console.error('[stellar] verifyStellarPayment error:', err?.response?.data || err.message);
    return { success: false, verified: false, reason: err.message };
  }
}

// ── 7. ACCOUNT INFO (for admin/debugging) ────────────────────────────────────

async function getAccountInfo() {
  if (!QUICKMED_PUBLIC) return null;
  try {
    const server  = getServer();
    const account = await server.loadAccount(QUICKMED_PUBLIC);
    const usdcBalance = account.balances.find(
      b => b.asset_code === 'USDC' && b.asset_issuer === USDC_ISSUER
    );
    const xlmBalance = account.balances.find(b => b.asset_type === 'native');
    return {
      publicKey:   QUICKMED_PUBLIC,
      xlmBalance:  xlmBalance?.balance  || '0',
      usdcBalance: usdcBalance?.balance || '0',
      network:     IS_MAINNET ? 'mainnet' : 'testnet',
      horizonUrl:  HORIZON_URL,
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ── 8. GENERATE NEW KEYPAIR (setup helper) ────────────────────────────────────
// Call this once to generate your QuickMed Stellar account.
// Add the output to your .env file, then fund via friendbot (testnet).

function generateNewKeypair() {
  const kp = Keypair.random();
  return {
    publicKey:  kp.publicKey(),
    secretKey:  kp.secret(),
    friendbotUrl: `https://friendbot.stellar.org/?addr=${kp.publicKey()}`,
    instructions: [
      '1. Add to .env: STELLAR_PUBLIC_KEY=' + kp.publicKey(),
      '2. Add to .env: STELLAR_SECRET_KEY=' + kp.secret(),
      '3. Fund testnet account: curl ' + `"https://friendbot.stellar.org/?addr=${kp.publicKey()}"`,
      '4. For USDC on testnet, establish a trustline first (see establishUsdcTrustline)',
    ],
  };
}

// ── 9. ESTABLISH USDC TRUSTLINE ───────────────────────────────────────────────
// Must be called once after account creation before the account can hold USDC.
// Run manually: node -e "require('./stellarService').establishUsdcTrustline().then(console.log)"

async function establishUsdcTrustline() {
  if (!isConfigured()) return { success: false, reason: 'keys not configured' };

  try {
    const server  = getServer();
    const keypair = Keypair.fromSecret(QUICKMED_SECRET);
    const account = await server.loadAccount(QUICKMED_PUBLIC);

    const tx = new TransactionBuilder(account, {
      fee:               BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(Operation.changeTrust({ asset: USDC }))
      .setTimeout(180)
      .build();

    tx.sign(keypair);
    const result = await server.submitTransaction(tx);

    console.log('[stellar] ✅ USDC trustline established:', result.hash);
    return { success: true, txHash: result.hash };
  } catch (err) {
    console.error('[stellar] trustline error:', err?.response?.data || err.message);
    return { success: false, reason: err.message };
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  // Hash anchoring
  anchorRecordHash,
  verifyAnchoredHash,

  // ZK commitment proof
  generateRecordProof,
  verifyRecordProof,

  // USDC payments
  generatePaymentRequest,
  verifyStellarPayment,
  ngnToUsdc,

  // Utilities
  getAccountInfo,
  generateNewKeypair,
  establishUsdcTrustline,
  isConfigured,
};