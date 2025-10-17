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
                SELECT ci.product_id, ci.quantity, p.price 
                FROM cart_items ci 
                JOIN products p ON ci.product_id = p.product_id 
                WHERE ci.user_id = ?
            `;
      req.db.query(cartQuery, [userId], (err, cartItems) => {
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
        let total = 0;
        cartItems.forEach((item) => {
          total += item.price * item.quantity;
        });
        console.log("Calculated total:", total);
        const orderQuery = `
                    INSERT INTO orders (user_id, total_amount, shipping_address_id, status) 
                    VALUES (?, ?, ?, 'processing')
                `;
        req.db.query(
          orderQuery,
          [userId, total, shipping_address_id],
          (err, result) => {
            if (err) {
              return req.db.rollback(() => {
                console.error("Order insert error:", err);
                res
                  .status(500)
                  .json({ success: false, message: "Server Error" });
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
                  res
                    .status(500)
                    .json({ success: false, message: "Server Error" });
                });
              }
              const paymentQuery = `
                            INSERT INTO payments (order_id, amount, payment_method, payment_status) 
                            VALUES (?, ?, ?, 'pending')
                        `;
              req.db.query(
                paymentQuery,
                [orderId, total, payment_method],
                (err) => {
                  if (err) {
                    return req.db.rollback(() => {
                      console.error(err);
                      res
                        .status(500)
                        .json({ success: false, message: "Server Error" });
                    });
                  }
                  const clearCartQuery =
                    "DELETE FROM cart_items WHERE user_id = ?";
                  req.db.query(clearCartQuery, [userId], (err) => {
                    if (err) {
                      return req.db.rollback(() => {
                        console.error(err);
                        res
                          .status(500)
                          .json({ success: false, message: "Server Error" });
                      });
                    }
                    req.db.commit((err) => {
                      if (err) {
                        return req.db.rollback(() => {
                          console.error(err);
                          res
                            .status(500)
                            .json({ success: false, message: "Server Error" });
                        });
                      }

                      // If payment method is M-Pesa, redirect to M-Pesa payment page
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
                }
              );
            });
          }
        );
      });
    } catch (error) {
      req.db.rollback(() => {
        console.error("Unexpected error in placeOrder:", error);
        res
          .status(500)
          .json({ success: false, message: error.message || "Server Error" });
      });
    }
  });
}

module.exports = { getCheckout, placeOrder, getMpesaPaymentPage };
