const express = require("express");
const router = express.Router();
const { requireLogin } = require("../middleware/auth");
const {
  getCheckout,
  placeOrder,
  getMpesaPaymentPage,
} = require("../controllers/orderController");

router.get("/checkout", requireLogin, getCheckout);
router.post("/place", requireLogin, placeOrder);
router.get("/mpesa-payment", requireLogin, getMpesaPaymentPage);

module.exports = router;
