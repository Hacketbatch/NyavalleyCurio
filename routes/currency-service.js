// currency-service.js (New Utility File)
const axios = require('axios');

const CURRENCY_API_KEY = process.env.EXCHANGE_RATE_API_KEY; // Get your key
const API_URL = `https://v6.exchangerate-api.com/v6/${CURRENCY_API_KEY}/latest/USD`;

//  Cache Object
const rateCache = {
    KES_RATE: null,
    LAST_FETCH: 0,
    TTL: 1800000, // Time to Live: 30 minutes in milliseconds
};

/**
 * Fetches the latest USD to KES rate, using cache if available.
 * @returns {number} The USD to KES exchange rate.
 */
async function getUsdToKesRate() {
    // 1. Check Cache
    if (rateCache.KES_RATE && (Date.now() - rateCache.LAST_FETCH < rateCache.TTL)) {
        console.log(" Using cached USD/KES rate.");
        return rateCache.KES_RATE;
    }

    // 2. Fetch New Rate
    try {
        console.log("🔄 Fetching new USD/KES rate from API...");
        const response = await axios.get(API_URL);
        const kesRate = response.data.conversion_rates.KES;

        if (!kesRate) {
            throw new Error("KES rate not found in API response.");
        }

        // 3. Update Cache
        rateCache.KES_RATE = kesRate;
        rateCache.LAST_FETCH = Date.now();
        
        return kesRate;
    } catch (error) {
        console.error("❌ Failed to fetch exchange rate:", error.message);
        
        // **Critical Fallback:** Use a safe, pre-defined rate if the API fails
        if (rateCache.KES_RATE) {
            console.warn("⚠️ Falling back to cached rate.");
            return rateCache.KES_RATE;
        }
        // If cache is empty and API fails, throw a hard error or use a hardcoded default
        throw new Error("Exchange rate service unavailable. Cannot process payment.");
    }
}

/**
 * Converts a USD amount to KES using the latest exchange rate.
 * @param {number} usdAmount - Amount in USD.
 * @returns {number} Converted amount in KES.
 */
async function convertUsdToKes(usdAmount) {
    const rate = await getUsdToKesRate();
    // Use Math.ceil to ensure you don't lose value, or Math.round for standard banking
    return Math.ceil(usdAmount * rate);
}

module.exports = { convertUsdToKes };