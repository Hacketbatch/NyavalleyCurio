const express = require("express");
const axios = require("axios");
const router = express.Router();
require("dotenv").config();

// ===================================================
// 1.  Environment Variables & Configuration
// ===================================================
const {
  MPESA_CONSUMER_KEY,
  MPESA_CONSUMER_SECRET,
  MPESA_SHORTCODE,
  MPESA_PASSKEY,
  MPESA_CALLBACK_URL,
  MPESA_ENV,
  //  REQUIRED VARIABLE for currency API
  EXCHANGE_RATE_API_KEY,
} = process.env;

const baseURL =
  MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

// ===================================================
// 2.  M-Pesa Token Caching Mechanism
// ===================================================
const tokenCache = {
  token: null,
  expiry: 0, // Unix timestamp in milliseconds
};

/**
 * Generates a new M-Pesa Access Token and caches it.
 * @returns {string} The new access token.
 */
const generateAccessToken = async () => {
  try {
    const auth = Buffer.from(
      `${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`
    ).toString("base64");

    const response = await axios.get(
      `${baseURL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { Authorization: `Basic ${auth}` },
      }
    );

    const token = response.data.access_token;
    // Set expiry buffer (valid for 3599s, minus 10s for buffer)
    const expiry = Date.now() + response.data.expires_in * 1000 - 10000;

    tokenCache.token = token;
    tokenCache.expiry = expiry;

    console.log(" New M-Pesa Access Token Generated.");
    return token;
  } catch (error) {
    console.error(" Token Generation Error:", error.message);
    throw new Error("Failed to authenticate with M-Pesa API.");
  }
};

/**
 * Express middleware to fetch the Access Token from cache or generate a new one.
 * Attaches the token to req.mpesaToken.
 */
const accessTokenMiddleware = async (req, res, next) => {
  // Check if the cached token is still valid
  if (tokenCache.token && Date.now() < tokenCache.expiry) {
    req.mpesaToken = tokenCache.token;
    return next();
  }

  // Token is expired or missing, generate a new one
  try {
    req.mpesaToken = await generateAccessToken();
    next();
  } catch (error) {
    // Handle error thrown by generateAccessToken
    res.status(500).json({ message: error.message });
  }
};

// ===================================================
// 3.  CURRENCY CONVERSION SERVICE
// ===================================================
const CURRENCY_API_URL = `https://v6.exchangerate-api.com/v6/06f3b604464d8148423bca13/latest/USD`;

// Currency Cache Object
const rateCache = {
  KES_RATE: null,
  LAST_FETCH: 0,
  TTL: 1800000, // 30 minutes in milliseconds
  FALLBACK_RATE: 140, // Safe fallback rate if API fails
};

/**
 * Fetches the latest USD to KES rate, using cache if available.
 * @returns {number} The USD to KES exchange rate.
 */
async function getUsdToKesRate() {
  if (rateCache.KES_RATE && Date.now() - rateCache.LAST_FETCH < rateCache.TTL) {
    return rateCache.KES_RATE;
  }

  try {
    const response = await axios.get(CURRENCY_API_URL);
    const kesRate = response.data.conversion_rates.KES;
    if (!kesRate) throw new Error("KES rate not found in API response.");

    rateCache.KES_RATE = kesRate;
    rateCache.LAST_FETCH = Date.now();
    console.log(` Fetched new USD/KES rate: ${kesRate}`);
    return kesRate;
  } catch (error) {
    console.error("❌ Failed to fetch exchange rate:", error.message);
    if (rateCache.KES_RATE) return rateCache.KES_RATE;
    console.warn("⚠️ Falling back to hardcoded rate.");
    return rateCache.FALLBACK_RATE;
  }
}

/**
 * Converts a USD amount to KES.
 * @param {number} usdAmount - Amount in USD.
 * @returns {number} Converted amount in KES (rounded up to the next integer).
 */
async function convertUsdToKes(usdAmount) {
  const rate = await getUsdToKesRate();
  // Use Math.ceil to aggressively round up to the next whole shilling, protecting the merchant.
  return Math.ceil(usdAmount * rate);
}

// ===================================================
// 4.  Phone Number Formatting Helper (NEW)
// ===================================================

/**
 * Formats a phone number to the M-Pesa required format (2547XXXXXXXX).
 * @param {string} phone - The phone number (e.g., 07XX, 2547XX, +2547XX).
 * @returns {string} The formatted M-Pesa number.
 */
const formatPhoneNumber = (phone) => {
  // 1. Remove non-digit characters and trim
  let formatted = phone.replace(/[^0-9]/g, "").trim();

  // 2. Handle numbers starting with '0' (e.g., 0712...)
  if (formatted.startsWith("0") && formatted.length === 10) {
    return `254${formatted.substring(1)}`;
  }

  // 3. Handle numbers starting with '254'
  if (formatted.startsWith("254") && formatted.length === 12) {
    return formatted;
  }

  // 4. Fallback (return original if format is completely unknown or invalid length)
  // The main validation will happen below.
  return formatted;
};

// ===================================================
// USD to KES Conversion Route
// ===================================================
router.get('/convert/:usd', async (req, res) => {
  try {
    const usd = parseFloat(req.params.usd);
    if (isNaN(usd) || usd <= 0) {
      return res.status(400).json({ message: 'Invalid USD amount' });
    }

    const amountKES = await convertUsdToKes(usd);
    res.json({ amountKES, amountUSD: usd });
  } catch (err) {
    console.error('❌ Conversion Error:', err.message);
    // fallback to hardcoded rate if conversion fails
    const fallbackKES = Math.ceil(parseFloat(req.params.usd) * 140);
    res.status(500).json({ amountKES: fallbackKES, amountUSD: req.params.usd });
  }
});


// ===================================================
//  STK Push Payment Request Route (MODIFIED)
// ===================================================
router.post("/pay", accessTokenMiddleware, async (req, res) => {
  let { phone, amount, accountReference, transactionDesc } = req.body; // 'amount' is USD

  // 1. Input Validation and Currency Conversion
  const usdAmount = Number(amount);
  if (isNaN(usdAmount) || usdAmount <= 0) {
    return res.status(400).json({ message: "Invalid amount provided." });
  }

  // 2. Format and Validate Phone Number
  const finalPhone = formatPhoneNumber(phone);
  if (!finalPhone.startsWith("254") || finalPhone.length !== 12) {
    return res
      .status(400)
      .json({ message: "Invalid phone number format. Must be 2547XXXXXXX." });
  }

  let finalAmountKES;

  try {
    finalAmountKES = await convertUsdToKes(usdAmount);

    // M-Pesa minimum payment is 1 KES
    if (finalAmountKES < 1) {
      return res
        .status(400)
        .json({ message: "Converted amount is less than 1 KES." });
    }

    console.log(
      `Conversion: $${usdAmount.toFixed(2)} -> KES ${finalAmountKES}`
    );

    // Step 3: Token is already attached by middleware
    const token = req.mpesaToken;

    // Step 4: Generate Timestamp & Password
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);

    const password = Buffer.from(
      `${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`
    ).toString("base64");

    // Step 5: Make STK Push Request
    const stkResponse = await axios.post(
      `${baseURL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        //  CRITICAL CHANGE: Use the CONVERTED KES amount
        Amount: finalAmountKES,
        PartyA: finalPhone, // Use formatted phone number
        PartyB: MPESA_SHORTCODE,
        PhoneNumber: finalPhone, // Use formatted phone number
        CallBackURL: MPESA_CALLBACK_URL,
        AccountReference: accountReference || "Nyavalley",
        TransactionDesc: transactionDesc || "Purchase",
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    console.log(" STK Push Request Sent:", stkResponse.data);
    res.status(200).json(stkResponse.data);
  } catch (error) {
    console.error(
      "❌ STK Push Process Error:",
      error.response?.data || error.message
    );
    res.status(500).json({
      message: "Payment request failed due to system error.",
      error: error.response?.data || error.message,
    });
  }
});

// ===================================================
//  M-Pesa Callback Route (UNMODIFIED)
// ===================================================
router.post("/callback", async (req, res) => {
  console.log(
    " M-Pesa Callback Received:",
    JSON.stringify(req.body, null, 2)
  );

  const callback = req.body;
  let orderId = "N/A";
  let resultCode = "N/A";
  let mpesaReceipt = "N/A";

  // Immediate acknowledgement is critical
  res.status(200).json({ ResultCode: 0, ResultDesc: "Callback received" });

  // Step 1: Safely parse and extract transaction data
  try {
    const stkCallback = callback.Body?.stkCallback;
    if (stkCallback) {
      resultCode = stkCallback.ResultCode;

      if (stkCallback.CallbackMetadata && stkCallback.CallbackMetadata.Item) {
        stkCallback.CallbackMetadata.Item.forEach((item) => {
          if (item.Name === "AccountReference") orderId = item.Value;
          if (item.Name === "MpesaReceiptNumber") mpesaReceipt = item.Value;
        });
      }
    }
  } catch (e) {
    console.error("❌ Error parsing M-Pesa callback JSON:", e);
    return;
  }

  // Step 2: Handle success or failure and perform DB update (ASYNC)
  if (resultCode === 0) {
    console.log(
      ` SUCCESS: Transaction ${mpesaReceipt} completed for Order ${orderId}.`
    );

    // This is where your DB update logic (with the new fields) will go:
    // const db = req.app.get("db") || req.db;
    // db.query("UPDATE payments SET status = 'completed', gateway_reference_id = ?, updated_at = NOW() WHERE order_id = ?", [mpesaReceipt, orderId], (err) => { ... });

    console.log(
      `[DB Action]: Updating order ${orderId} status to 'completed' with T-ID ${mpesaReceipt}`
    );
  } else {
    console.log(
      `❌ FAILED: Transaction for Order ${orderId} failed. Result Code: ${resultCode}`
    );
    // Log failure and update status in DB to 'failed'
  }
});

module.exports = router;
