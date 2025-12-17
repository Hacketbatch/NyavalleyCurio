const axios = require("axios");

function getCheckout(req, res) {
  const userId = req.session.user.user_id;
  const addressQuery = "SELECT * FROM addresses WHERE user_id = ?";
  req.db.query(addressQuery, [userId], (err, addresses) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Server Error");
    }
    const cartQuery = `
            SELECT ci.*, p.name, p.price, p.image_url 
            FROM cart_items ci 
            JOIN products p ON ci.product_id = p.product_id 
            WHERE ci.user_id = ?
        `;
    req.db.query(cartQuery, [userId], (err, cartItems) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Server Error");
      }
      let total = 0;
cartItems.forEach((item) => {
  total += item.price * item.quantity;
});

// Include shipping cost if provided
const shippingCost = parseFloat(req.body.shipping_cost) || 0;
total += shippingCost;

console.log("Calculated total (including shipping):", total);

      res.render("pages/checkout", {
        user: req.session.user,
        addresses,
        cartItems,
        total,
      });
    });
  });
}

function getMpesaPaymentPage(req, res) {
  const { orderId, amount } = req.query;
  if (!orderId || !amount) {
    return res.redirect("/checkout");
  }
  res.render("pages/mpesa-payment", {
    user: req.session.user,
    orderId,
    amount: parseFloat(amount),
  });
}



// Helper to fetch live shipping rate (Step 2)
async function fetchShippingRate(destination, totalWeight) {
  try {
    // 🔹 Replace this with your actual FedEx API endpoint
    const apiUrl = "http://localhost:3001/api/shipping/rates"; 

    const response = await axios.post(apiUrl, {
      origin: {
        city: "Eldoret",
        postal_code: "30100",
        country: "KE",
      },
      destination,
      weight: totalWeight,
    });

    // Assuming the API returns: { success: true, rate: 250 }
    if (response.data && response.data.rate) {
      console.log("✅ Live rate fetched:", response.data.rate);
      return parseFloat(response.data.rate);
    } else {
      console.warn("⚠️ FedEx API did not return rate. Using fallback 5.00.");
      return 5.00;
    }
  } catch (error) {
    console.error("❌ Error fetching shipping rate:", error.message);
    return 5.00; // fallback
  }
}


function placeOrder(req, res) {
  console.log("Starting placeOrder with body:", req.body);
  const userId = req.session.user.user_id;
  const { shipping_address_id, payment_method } = req.body;

  if (!shipping_address_id) {
    console.error("Missing shipping_address_id");
    return res
      .status(400)
      .json({ success: false, message: "Shipping address is required" });
  }

  if (!payment_method) {
    console.error("Missing payment_method");
    return res
      .status(400)
      .json({ success: false, message: "Payment method is required" });
  }

  console.log("Starting transaction for user:", userId);
  req.db.beginTransaction(async (err) => {
    if (err) {
      console.error("Transaction begin error:", err);
      return res.status(500).json({ success: false, message: "Server Error" });
    }

    try {
      const cartQuery = `
        SELECT ci.product_id, ci.quantity, p.price, p.weight 
        FROM cart_items ci 
        JOIN products p ON ci.product_id = p.product_id 
        WHERE ci.user_id = ?
      `;

      req.db.query(cartQuery, [userId], async (err, cartItems) => {
        if (err) {
          return req.db.rollback(() => {
            console.error("Cart query error:", err);
            res.status(500).json({ success: false, message: "Server Error" });
          });
        }

        if (cartItems.length === 0) {
          return req.db.rollback(() => {
            console.error("Cart is empty for user:", userId);
            res.status(400).json({ success: false, message: "Cart is empty" });
          });
        }

        console.log("Found cart items:", cartItems);

        // Step 1️⃣: Calculate product total and weight
        let total = 0;
        let totalWeight = 0;
        cartItems.forEach((item) => {
          total += item.price * item.quantity;
          totalWeight += (item.weight || 1) * item.quantity; // default 1kg per product
        });

        console.log("Calculated total (without shipping):", total);
        console.log("Total package weight:", totalWeight);

        // Step 2️⃣: Get destination details
        const addressQuery = "SELECT * FROM addresses WHERE address_id = ?";
        req.db.query(addressQuery, [shipping_address_id], async (err, addressResults) => {
          if (err || addressResults.length === 0) {
            return req.db.rollback(() => {
              console.error("Error fetching address:", err);
              res.status(500).json({ success: false, message: "Invalid address" });
            });
          }

          const destination = {
            city: addressResults[0].city,
            postal_code: addressResults[0].postal_code,
            country: "KE",
          };

          // Step 3️⃣: Fetch live shipping rate from your FedEx-like API
          let shippingCost = 5.00; // fallback
          try {
            const response = await axios.post("http://localhost:3001/api/shipping/rates", {
              origin: { city: "Eldoret", postal_code: "30100", country: "KE" },
              destination,
              weight: totalWeight,
            });

            if (response.data && response.data.rate) {
              shippingCost = parseFloat(response.data.rate);
              console.log("✅ Live shipping rate fetched:", shippingCost);
            } else {
              console.warn("⚠️ No rate returned. Using fallback KES 5.00.");
            }
          } catch (error) {
            console.error("❌ Error fetching live rate:", error.message);
          }

          total += shippingCost;
          console.log("Total with shipping included:", total);

          // Step 4️⃣: Proceed to create order
          const orderQuery = `
            INSERT INTO orders (user_id, total_amount, shipping_address_id, shipping_cost, status) 
            VALUES (?, ?, ?, ?, 'processing')
          `;

          req.db.query(orderQuery, [userId, total, shipping_address_id, shippingCost], (err, result) => {
            if (err) {
              return req.db.rollback(() => {
                console.error("Order insert error:", err);
                res.status(500).json({ success: false, message: "Server Error" });
              });
            }

            console.log("Order created with ID:", result.insertId);
            const orderId = result.insertId;

            const orderItemsQuery = `
              INSERT INTO order_items (order_id, product_id, quantity, price_at_time_of_sale) 
              VALUES ?
            `;
            const orderItemsValues = cartItems.map((i) => [
              orderId,
              i.product_id,
              i.quantity,
              i.price,
            ]);

            req.db.query(orderItemsQuery, [orderItemsValues], (err) => {
              if (err) {
                return req.db.rollback(() => {
                  console.error(err);
                  res.status(500).json({ success: false, message: "Server Error" });
                });
              }

              const paymentQuery = `
                INSERT INTO payments (order_id, amount, payment_method, payment_status) 
                VALUES (?, ?, ?, 'pending')
              `;
              req.db.query(paymentQuery, [orderId, total, payment_method], (err) => {
                if (err) {
                  return req.db.rollback(() => {
                    console.error(err);
                    res.status(500).json({ success: false, message: "Server Error" });
                  });
                }

                const clearCartQuery = "DELETE FROM cart_items WHERE user_id = ?";
                req.db.query(clearCartQuery, [userId], (err) => {
                  if (err) {
                    return req.db.rollback(() => {
                      console.error(err);
                      res.status(500).json({ success: false, message: "Server Error" });
                    });
                  }

                  req.db.commit((err) => {
                    if (err) {
                      return req.db.rollback(() => {
                        console.error(err);
                        res.status(500).json({ success: false, message: "Server Error" });
                      });
                    }

                    // Step 5️⃣: Redirect or respond
                    if (payment_method === "mpesa") {
                      console.log("Redirecting to M-Pesa payment page");
                      return res.json({
                        success: true,
                        orderId,
                        redirect: `/api/orders/mpesa-payment?orderId=${orderId}&amount=${total}`,
                      });
                    } else {
                      res.json({
                        success: true,
                        orderId,
                        message: "Order placed successfully",
                      });
                    }
                  });
                });
              });
            });
          });
        });
      });
    } catch (error) {
      req.db.rollback(() => {
        console.error("Unexpected error in placeOrder:", error);
        res.status(500).json({ success: false, message: error.message || "Server Error" });
      });
    }
  });
}


function getShippingRates(req, res) {
  const { destination, weight } = req.body;

  if (!destination || !weight) {
    return res
      .status(400)
      .json({ success: false, message: "Destination and weight are required" });
  }

  // Simple rate logic (you can replace with your real rates later)
  const baseRate = 200; // KES per kg
  const rate = weight * baseRate;

  res.json({
    success: true,
    destination,
    weight,
    rate,
    message: `Shipping rate to ${destination} is KES ${rate}`,
  });
}

function trackOrder(req, res) {
  const { trackingNumber } = req.params;

  if (!trackingNumber) {
    return res
      .status(400)
      .json({ success: false, message: "Tracking number is required" });
  }

  const trackQuery = `
    SELECT o.order_id, o.tracking_number, o.status, o.total_amount, o.updated_at
    FROM orders o
    WHERE o.tracking_number = ?
  `;

  req.db.query(trackQuery, [trackingNumber], (err, results) => {
    if (err) {
      console.error("Tracking query error:", err);
      return res.status(500).json({ success: false, message: "Server Error" });
    }

    if (results.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Tracking number not found" });
    }

   res.json({
  success: true,
  order: {
    ...results[0],
    total_including_shipping: results[0].total_amount + results[0].shipping_cost,
  },
});

  });
}

module.exports = {
  getCheckout,
  placeOrder,
  getMpesaPaymentPage,
  getShippingRates,
  trackOrder,
};

