// exchangeRateService.js
// Fetches live USDC/NGN rate from CoinGecko free public API.
// No API key needed. Caches for 5 minutes so we don't hammer the API.
// Falls back gracefully if the fetch fails — payments never break.
//
// Place this file in the same folder as stellarService.js

const axios = require('axios');

const CACHE_TTL_MS    = 5 * 60 * 1000;  // 5 minutes
const FALLBACK_RATE   = 1550;            // ₦ per 1 USDC — update occasionally as backstop
const SLIPPAGE_BUFFER = 0.98;            // 2% buffer — patient sends slightly more USDC
                                         // to protect against rate movement between
                                         // display time and payment landing on-chain

let cachedRate      = null;
let cacheExpiry     = 0;
let lastFetchFailed = false;

/**
 * Returns live USDC/NGN rate (₦ per 1 USDC) with 2% buffer applied.
 *
 * Example: market ₦1,580 → buffered ₦1,548
 * This means ₦3,000 → 1.938 USDC instead of 1.898 USDC.
 * Small difference, but protects against rate ticks during payment.
 */
async function getUsdcToNgnRate() {
  const now = Date.now();

  if (cachedRate && now < cacheExpiry) {
    console.log(`[rate] Cached: ₦${cachedRate}/USDC`);
    return cachedRate;
  }

  try {
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price',
      {
        params: { ids: 'usd-coin', vs_currencies: 'ngn' },
        timeout: 5000,
        headers: { 'Accept': 'application/json' },
      }
    );

    const rawRate = response.data?.['usd-coin']?.ngn;

    if (!rawRate || typeof rawRate !== 'number' || rawRate < 100) {
      throw new Error(`Unexpected value from CoinGecko: ${rawRate}`);
    }

    const bufferedRate = Math.floor(rawRate * SLIPPAGE_BUFFER);

    cachedRate      = bufferedRate;
    cacheExpiry     = now + CACHE_TTL_MS;
    lastFetchFailed = false;

    console.log(`[rate] ✅ Live: ₦${rawRate} → buffered: ₦${bufferedRate}/USDC`);
    return bufferedRate;

  } catch (error) {
    console.error(`[rate] ❌ CoinGecko fetch failed: ${error.message}`);
    lastFetchFailed = true;

    // Stale cache beats hardcoded fallback
    if (cachedRate) {
      console.log(`[rate] Using stale cache: ₦${cachedRate}/USDC`);
      return cachedRate;
    }

    console.log(`[rate] Using hardcoded fallback: ₦${FALLBACK_RATE}/USDC`);
    return FALLBACK_RATE;
  }
}

/**
 * Convert NGN amount to USDC using the live rate.
 * Rounds UP to nearest microunit (6dp = USDC standard precision).
 * Example: ₦3,000 at ₦1,548/USDC → 1.938992 USDC
 */
async function ngnToUsdc(ngnAmount) {
  const rate    = await getUsdcToNgnRate();
  const raw     = ngnAmount / rate;
  const rounded = Math.ceil(raw * 1_000_000) / 1_000_000;
  console.log(`[rate] ₦${ngnAmount} → ${rounded} USDC (at ₦${rate}/USDC)`);
  return rounded;
}

/**
 * Rate info for payment message display.
 */
async function getRateInfo() {
  const rate = await getUsdcToNgnRate();
  return {
    rate,
    source:      lastFetchFailed ? 'estimated' : 'live',
    buffered:    true,
    cachedSince: cacheExpiry ? new Date(cacheExpiry - CACHE_TTL_MS).toISOString() : null,
  };
}

module.exports = { getUsdcToNgnRate, ngnToUsdc, getRateInfo };