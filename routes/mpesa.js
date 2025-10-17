// routes/mpesa.js
const express = require("express");
const axios = require("axios");
const router = express.Router();
require("dotenv").config();

// Get M-Pesa credentials from .env
const {
  MPESA_CONSUMER_KEY,
  MPESA_CONSUMER_SECRET,
  MPESA_SHORTCODE,
  MPESA_PASSKEY,
  MPESA_CALLBACK_URL,
  MPESA_ENV,
} = process.env;

// Base URLs
const baseURL =
  MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

// Payment page - removed as it's now handled by orders route

// 🔹 Generate Access Token
router.get("/token", async (req, res) => {
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
    res.json({ access_token: response.data.access_token });
  } catch (error) {
    res.status(500).json({
      message: "Failed to generate access token",
      error: error.message,
    });
  }
});

// 🔹 STK Push Request
router.post("/pay", async (req, res) => {
  let { phone, amount, accountReference, transactionDesc } = req.body;
  // Ensure amount is an integer (M-Pesa only accepts whole numbers)
  amount = Math.floor(Number(amount));

  try {
    // Step 1: Get Access Token
    const auth = Buffer.from(
      `${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`
    ).toString("base64");
    const { data } = await axios.get(
      `${baseURL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { Authorization: `Basic ${auth}` },
      }
    );
    const token = data.access_token;

    // Step 2: Prepare timestamp + password
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);
    const password = Buffer.from(
      `${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`
    ).toString("base64");

    // Step 3: Send STK Push
    const stkResponse = await axios.post(
      `${baseURL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: MPESA_SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: MPESA_CALLBACK_URL,
        AccountReference: accountReference || "Nyavalley",
        TransactionDesc: transactionDesc || "Purchase",
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    res.json(stkResponse.data);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      message: "STK Push failed",
      error: error.response?.data || error.message,
    });
  }
});

// 🔹 Callback Route
router.post("/mpesa/callback", (req, res) => {
  console.log(
    "✅ M-Pesa Callback Received:",
    JSON.stringify(req.body, null, 2)
  );

  // Extract orderId and result code from callback
  const callback = req.body;
  let orderId = null;
  let resultCode = null;
  let mpesaReceipt = null;

  // Safaricom sends the orderId in the AccountReference field (set during STK push)
  try {
    if (
      callback.Body &&
      callback.Body.stkCallback &&
      callback.Body.stkCallback.CallbackMetadata
    ) {
      const meta = callback.Body.stkCallback.CallbackMetadata;
      // Find AccountReference and MpesaReceiptNumber
      meta.Item.forEach((item) => {
        if (item.Name === "AccountReference") orderId = item.Value;
        if (item.Name === "MpesaReceiptNumber") mpesaReceipt = item.Value;
      });
      resultCode = callback.Body.stkCallback.ResultCode;
    } else if (callback.Body && callback.Body.stkCallback) {
      resultCode = callback.Body.stkCallback.ResultCode;
    }
  } catch (e) {
    console.error("Error parsing M-Pesa callback:", e);
  }

  // Only update payment if successful
  if (resultCode === 0 || resultCode === "0") {
    // Get db connection from req.app
    const db = req.app.get("db") || req.db;
    if (!db) {
      console.error("No DB connection available in callback");
      return res.status(500).json({ message: "No DB connection" });
    }
    // Update payment status to completed
    let updateQuery =
      "UPDATE payments SET payment_status = 'completed', transaction_id = ? WHERE order_id = ?";
    db.query(updateQuery, [mpesaReceipt, orderId], (err, result) => {
      if (err) {
        console.error("Error updating payment status:", err);
        return res.status(500).json({ message: "DB update error" });
      }
      console.log("Payment status updated for order:", orderId);
      res.json({ message: "Callback received and payment updated" });
    });
  } else {
    res.json({ message: "Callback received, payment not successful" });
  }
});

module.exports = router;
