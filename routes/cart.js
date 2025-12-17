const express = require("express");
const router = express.Router();
const { requireLogin } = require("../middleware/auth");
const {
  getCart,
  addToCart,
  updateCart,
} = require("../controllers/cartController");

/* =========================================================
   ROUTE: GET /cart
   PURPOSE: Display the user’s shopping cart page.
   ========================================================= */
router.get("/", requireLogin, getCart);

/* =========================================================
   ROUTE: POST /cart/add
   PURPOSE: Add a product to the user’s cart.
   ========================================================= */
router.post("/add", requireLogin, addToCart);

/* =========================================================
   ROUTE: POST /cart/update
   PURPOSE: Update quantity or remove product from cart.
   ========================================================= */
router.post("/update", requireLogin, updateCart);

/* =========================================================
   ROUTE: GET /cart/checkout
   PURPOSE: Render checkout page with total amount.
   ========================================================= */
router.get("/checkout", requireLogin, (req, res) => {
  const totalAmount = req.query.total || 0;
  const orderId = "Order-" + Date.now();
  res.render("checkout", { totalAmount, orderId });
});

/* =========================================================
   ROUTE: GET /cart/count
   PURPOSE: Return the total number of items in cart.
   Used for dynamic cart badge updates via AJAX.
   ========================================================= */
router.get("/count", requireLogin, (req, res) => {
  const userId = req.session.user.user_id;

  // Query total items from database
  const query = `
    SELECT SUM(quantity) AS totalCount
    FROM cart_items
    WHERE user_id = ?;
  `;

  req.db.query(query, [userId], (err, results) => {
    if (err) {
      console.error("Error fetching cart count:", err);
      return res
        .status(500)
        .json({ success: false, message: "Failed to retrieve cart count" });
    }

    const count = results[0].totalCount || 0;
    res.json({ success: true, count });
  });
});

module.exports = router;
