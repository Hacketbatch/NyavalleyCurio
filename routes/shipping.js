// routes/shipping.js
const express = require("express");
const axios = require("axios");
const router = express.Router();
require("dotenv").config();

// -----------------------------
// 🔹 Calculate Live FedEx Rates
// -----------------------------
router.post("/rates", async (req, res) => {
  const { destination, weight } = req.body;

  // Validate inputs
  if (!destination || !weight) {
    return res.status(400).json({ error: "Destination and weight are required" });
  }

  try {
    console.log("🌍 Fetching FedEx shipping rates...");

    // Step 1: Get FedEx Access Token
    const tokenResponse = await axios.post(
      `${process.env.FEDEX_BASE_URL}/oauth/token`,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.FEDEX_API_KEY,
        client_secret: process.env.FEDEX_API_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenResponse.data.access_token;
    console.log("✅ Got FedEx access token");

    // Step 2: Create rate request payload
    const rateRequest = {
  accountNumber: { value: process.env.FEDEX_ACCOUNT_NUMBER },
  requestedShipment: {
    shipper: {
      address: {
        streetLines: ["Eldoret Town"],
        city: "Eldoret",
        postalCode: "30100",
        countryCode: "KE",
      },
    },
    recipient: {
      address: {
        streetLines: [destination],
        city: destination,
        postalCode: "00100",
        countryCode: "KE",
        residential: true,
      },
    },
    pickupType: "DROPOFF_AT_FEDEX_LOCATION",
    packagingType: "YOUR_PACKAGING",
    serviceType: "INTERNATIONAL_PRIORITY",
    rateRequestType: ["ACCOUNT", "LIST"],
    requestedPackageLineItems: [
      {
        weight: {
          units: "KG",
          value: weight,
        },
      },
    ],
  },
};


    // Step 3: Send rate request
    const rateResponse = await axios.post(
      `${process.env.FEDEX_BASE_URL}/rate/v1/rates/quotes`,
      rateRequest,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Step 4: Parse response safely
    const rates = rateResponse.data.output?.rateReplyDetails;
    if (!rates || rates.length === 0) {
      console.log("⚠️ No FedEx rates found in response:", rateResponse.data);
      return res.status(404).json({ error: "No shipping rates found" });
    }

    const ratedShipment = rates[0].ratedShipmentDetails?.[0];
    const totalNetCharge =
      ratedShipment?.totalNetCharge?.amount ||
      ratedShipment?.shipmentRateDetail?.totalNetCharge?.amount;
    const currency =
      ratedShipment?.totalNetCharge?.currency ||
      ratedShipment?.shipmentRateDetail?.totalNetCharge?.currency;

    if (!totalNetCharge) {
      console.log("⚠️ Could not extract amount — full response:", JSON.stringify(rateResponse.data, null, 2));
      return res.json({ shippingCost: 5, currency: "KES", note: "Fallback rate used (no live value returned)" });
    }

    // Step 5: Convert to KES if rate is in USD
    let shippingCost = totalNetCharge;
    if (currency === "USD") {
      const exchangeRate = 129.2; // You can later make this dynamic
      shippingCost = (totalNetCharge * exchangeRate).toFixed(2);
    }

    console.log(`💰 Live shipping cost: ${shippingCost} ${currency === "USD" ? "→ KES" : currency}`);
    res.json({ shippingCost, currency: "KES" });
  } catch (error) {
    console.error("❌ Error fetching FedEx rate:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch FedEx rate" });
  }
});

module.exports = router;
