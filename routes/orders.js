const express = require("express");
const router = express.Router();
const { requireLogin } = require("../middleware/auth");
const {
  getCheckout,
  placeOrder,
  getMpesaPaymentPage,
  getShippingRates,
  trackOrder,
} = require("../controllers/orderController");

// Checkout page
router.get("/checkout", requireLogin, getCheckout);

// Place order
router.post("/place", requireLogin, placeOrder);

// M-Pesa payment page
router.get("/mpesa-payment", requireLogin, getMpesaPaymentPage);

// Get shipping rates
router.post("/shipping/rates", requireLogin, getShippingRates);

// Track order by tracking number
router.get("/track/:trackingNumber", requireLogin, trackOrder);

module.exports = router;
