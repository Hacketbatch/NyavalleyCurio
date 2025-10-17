const express = require("express");
const router = express.Router();
const { requireLogin } = require("../middleware/auth");
const { getCart, addToCart, updateCart } = require("../controllers/cartController");

router.get("/", requireLogin, getCart);
router.post("/add", requireLogin, addToCart);
router.post("/update", requireLogin, updateCart);

router.get('/checkout', (req, res) => {
  const totalAmount = req.query.total || 0; // capture from cart link
  const orderId = 'Order-' + Date.now();   // generate a simple unique order ID

  res.render('checkout', { totalAmount, orderId });
});


module.exports = router;


