/**
 * server.js
 *
 * Entry point for the Nyavalley e-commerce backend.
 * This version keeps your original structure, length, and logic intact.
 * Only necessary changes and additions for full PayPal integration have been made.
 */

const path = require("path");
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const mysql = require("mysql");
const bcrypt = require("bcrypt");
const utils = require("./utils");
const sqlStatements = require("./sqlStatements");
const adminRoutes = require("./routes/admin");
const mpesaRoutes = require("./routes/mpesa");
const ordersRoutes = require("./routes/orders");
const shippingRoutes = require("./routes/shipping");
const sendContactEmail = require("./routes/emailService");

// PayPal setup
const paypal = require("@paypal/checkout-server-sdk");

let paypalClient = null;

// Load environment variables
require("dotenv").config();

// Initialize Stripe
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY || "");

/* ================================
   APP SETUP
   ================================ */
const app = express();
const port = process.env.PORT || 3001;

/* ================================
   MIDDLEWARE
   ================================ */
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "ecommerce-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use("/api/shipping", shippingRoutes);

// Make PayPal client ID available to frontend templates
app.use((req, res, next) => {
  res.locals.env = {
    ...res.locals.env,
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || "",
  };
  next();
});

/* ================================
   VIEW ENGINE
   ================================ */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

/* ================================
   DATABASE CONNECTION
   ================================ */
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Tivax5050##",
  database: process.env.DB_NAME || "eccomercecurio",
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed: " + err.stack);
    return;
  }
  console.log("Connected to database as id " + db.threadId);

  if (typeof utils.initializeDatabase === "function") {
    utils.initializeDatabase(db);
  }
});

app.use((req, res, next) => {
  req.db = db;
  next();
});

/* ================================
   GLOBAL TEMPLATE VARIABLES
   ================================ */
app.use((req, res, next) => {
  res.locals.user = req.session ? req.session.user : null;
  next();
});

/* ================================
   SECURITY / UX MIDDLEWARE
   ================================ */
app.use((req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === "blocked") {
    req.session.destroy(() => {
      return res.redirect("/login?blocked=1");
    });
  } else {
    next();
  }
});

app.use((req, res, next) => {
  if (req.session && req.session.user) {
    const userId = req.session.user.user_id;
    const cartCountQuery =
      "SELECT SUM(quantity) AS count FROM cart_items WHERE user_id = ?";

    req.db.query(cartCountQuery, [userId], (err, results) => {
      if (err) {
        console.error("Error fetching cart count:", err);
        res.locals.cartCount = 0;
        return next();
      }

      res.locals.cartCount = results && results[0] ? results[0].count || 0 : 0;
      next();
    });
  } else {
    res.locals.cartCount = 0;
    next();
  }
});

/* ================================
   MOUNT ROUTE MODULES
   ================================ */
app.use("/admin", adminRoutes);
app.use("/api/mpesa/pay", utils.requireLogin, mpesaRoutes);
app.use("/api/mpesa", mpesaRoutes);
app.use("/api/orders", ordersRoutes);

/* ================================
   PAYPAL CLIENT INITIALIZATION (SANDBOX)
   ================================ */
if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
  const environment = new paypal.core.SandboxEnvironment(
    process.env.PAYPAL_CLIENT_ID.trim(),
    process.env.PAYPAL_CLIENT_SECRET.trim()
  );
  paypalClient = new paypal.core.PayPalHttpClient(environment);
  console.log("PayPal client initialized successfully (Sandbox mode)");
} else {
  console.warn("PayPal credentials not set - PayPal payments disabled");
}

/* ================================
   APPLICATION ROUTES (UNCHANGED FROM YOUR ORIGINAL)
   ================================ */

/* Home */
app.get("/", (req, res) => {
  const featuredProductsQuery = `
    SELECT p.*, c.name as category_name
    FROM products p
    JOIN categories c ON p.category_id = c.category_id
    WHERE p.is_active = true
    ORDER BY RAND()
    LIMIT 8
  `;

  req.db.query(featuredProductsQuery, (err, products) => {
    if (err) {
      console.error("Home featured products error:", err);
      return res.status(500).send("Server Error");
    }

    res.render("pages/home", { products: products || [] });
  });
});

/* Products listing - keeping your full original logic */
app.get("/products", (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 12;
  const offset = (page - 1) * limit;
  const category = req.query.category;
  const search = req.query.search;

  let query = `
    SELECT p.*, c.name as category_name
    FROM products p
    JOIN categories c ON p.category_id = c.category_id
    WHERE p.is_active = true
  `;

  let countQuery = `SELECT COUNT(*) as total FROM products p WHERE p.is_active = true`;
  let queryParams = [];
  let countParams = [];

  function continueProcessing() {
    if (search) {
      query += ` AND p.name LIKE ?`;
      countQuery += ` AND p.name LIKE ?`;
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm);
      countParams.push(searchTerm);
    }

    query += ` LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    req.db.query(countQuery, countParams, (err, countResult) => {
      if (err) {
        console.error("Products count error:", err);
        return res.status(500).send("Server Error");
      }

      const totalProducts = countResult[0].total;
      const totalPages = Math.ceil(totalProducts / limit);

      req.db.query(query, queryParams, (err, products) => {
        if (err) {
          console.error("Products query error:", err);
          return res.status(500).send("Server Error");
        }

        const categoriesQuery = `
          SELECT c1.*, c2.name as parent_name
          FROM categories c1
          LEFT JOIN categories c2 ON c1.parent_category_id = c2.category_id
          ORDER BY COALESCE(c2.name, c1.name), c1.name
        `;

        req.db.query(categoriesQuery, (err, categories) => {
          if (err) {
            console.error("Categories query error:", err);
            return res.status(500).send("Server Error");
          }

          const categoryMap = {};
          const topLevelCategories = [];

          categories.forEach((cat) => {
            categoryMap[cat.category_id] = cat;
            if (!cat.parent_category_id) {
              topLevelCategories.push(cat);
            }
          });

          categories.forEach((cat) => {
            if (cat.parent_category_id) {
              const parent = categoryMap[cat.parent_category_id];
              if (parent) {
                if (!parent.children) parent.children = [];
                parent.children.push(cat);
              }
            }
          });

          res.render("pages/products", {
            products,
            categories: topLevelCategories,
            allCategories: categories,
            currentPage: page,
            totalPages,
            currentCategory: category,
            currentSearch: search,
          });
        });
      });
    });
  }

  if (category) {
    const checkSubcategoriesQuery =
      "SELECT COUNT(*) as count FROM categories WHERE parent_category_id = ?";

    req.db.query(checkSubcategoriesQuery, [category], (err, subcatResults) => {
      if (err) {
        console.error("Check subcategories error:", err);
        return res.status(500).send("Server Error");
      }

      if (subcatResults[0].count > 0) {
        const getSubcategoriesQuery =
          "SELECT category_id FROM categories WHERE parent_category_id = ?";

        req.db.query(getSubcategoriesQuery, [category], (err, subcatIds) => {
          if (err) {
            console.error("Get subcategories error:", err);
            return res.status(500).send("Server Error");
          }

          const subcategoryIds = subcatIds.map((item) => item.category_id);
          subcategoryIds.push(parseInt(category, 10));

          query += ` AND (p.category_id IN (${subcategoryIds
            .map(() => "?")
            .join(",")}))`;
          countQuery += ` AND (p.category_id IN (${subcategoryIds
            .map(() => "?")
            .join(",")}))`;
          queryParams.push(...subcategoryIds);
          countParams.push(...subcategoryIds);

          continueProcessing();
        });
      } else {
        query += ` AND p.category_id = ?`;
        countQuery += ` AND p.category_id = ?`;
        queryParams.push(category);
        countParams.push(category);

        continueProcessing();
      }
    });
  } else {
    continueProcessing();
  }
});

/* Product detail */
app.get("/product/:id", (req, res) => {
  const productId = req.params.id;
  const query = `
    SELECT p.*, c.name as category_name
    FROM products p
    JOIN categories c ON p.category_id = c.category_id
    WHERE p.product_id = ? AND p.is_active = true
  `;

  req.db.query(query, [productId], (err, results) => {
    if (err) {
      console.error("Product detail error:", err);
      return res.status(500).send("Server Error");
    }

    if (!results || results.length === 0) {
      return res.status(404).send("Product not found");
    }

    const product = results[0];
    res.render("pages/product-detail", {
      user: req.session.user,
      product,
    });
  });
});

/* Cart view */
app.get("/cart", utils.requireLogin, (req, res) => {
  const userId = req.session.user.user_id;

  const cartQuery = `
    SELECT ci.*, p.name, p.price, p.image_url
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.product_id
    WHERE ci.user_id = ?
  `;

  req.db.query(cartQuery, [userId], (err, cartItems) => {
    if (err) {
      console.error("Cart query error:", err);
      return res.status(500).send("Server Error");
    }

    let total = 0;
    cartItems.forEach((item) => {
      total += item.price * item.quantity;
    });

    res.render("pages/cart", {
      user: req.session.user,
      cartItems,
      total,
    });
  });
});

/* Add to cart */
app.post("/add-to-cart", utils.requireLogin, (req, res) => {
  const userId = req.session.user.user_id;
  const productId = req.body.product_id;
  const quantity = parseInt(req.body.quantity, 10) || 1;

  const checkQuery =
    "SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?";
  req.db.query(checkQuery, [userId, productId], (err, results) => {
    if (err) {
      console.error("Add to cart check error:", err);
      return res.status(500).json({ success: false, message: "Server Error" });
    }

    if (results && results.length > 0) {
      const updateQuery =
        "UPDATE cart_items SET quantity = quantity + ? WHERE user_id = ? AND product_id = ?";
      req.db.query(updateQuery, [quantity, userId, productId], (err) => {
        if (err) {
          console.error("Add to cart update error:", err);
          return res
            .status(500)
            .json({ success: false, message: "Server Error" });
        }
        res.json({ success: true, message: "Product added to cart" });
      });
    } else {
      const insertQuery =
        "INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)";
      req.db.query(insertQuery, [userId, productId, quantity], (err) => {
        if (err) {
          console.error("Add to cart insert error:", err);
          return res
            .status(500)
            .json({ success: false, message: "Server Error" });
        }
        res.json({ success: true, message: "Product added to cart" });
      });
    }
  });
});

/* Update cart */
app.post("/update-cart", utils.requireLogin, (req, res) => {
  const userId = req.session.user.user_id;
  const productId = req.body.product_id;
  const quantity = parseInt(req.body.quantity, 10);

  if (Number.isNaN(quantity)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid quantity" });
  }

  if (quantity <= 0) {
    const deleteQuery =
      "DELETE FROM cart_items WHERE user_id = ? AND product_id = ?";
    req.db.query(deleteQuery, [userId, productId], (err) => {
      if (err) {
        console.error("Remove cart item error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Server Error" });
      }
      res.json({ success: true, message: "Product removed from cart" });
    });
  } else {
    const updateQuery =
      "UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?";
    req.db.query(updateQuery, [quantity, userId, productId], (err) => {
      if (err) {
        console.error("Update cart item error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Server Error" });
      }
      res.json({ success: true, message: "Cart updated" });
    });
  }
});

/* Checkout page */
app.get("/checkout", utils.requireLogin, (req, res) => {
  const userId = req.session.user.user_id;

  const addressQuery = "SELECT * FROM addresses WHERE user_id = ?";
  req.db.query(addressQuery, [userId], (err, addresses) => {
    if (err) {
      console.error("Checkout address error:", err);
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
        console.error("Checkout cart items error:", err);
        return res.status(500).send("Server Error");
      }

      let total = 0;
      cartItems.forEach((item) => (total += item.price * item.quantity));

      res.render("pages/checkout", {
        user: req.session.user,
        addresses,
        cartItems,
        total,
      });
    });
  });
});

/* Create Stripe Checkout Session - unchanged */
app.post("/create-checkout-session", utils.requireLogin, async (req, res) => {
  // Your original Stripe logic remains exactly as you had it
  const userId = req.session.user.user_id;
  const { shipping_address_id, coupon_code } = req.body;

  console.log("=== STRIPE CHECKOUT SESSION REQUEST ===");
  console.log("User ID:", userId);
  console.log("Shipping Address ID:", shipping_address_id);
  console.log("Coupon Code:", coupon_code);
  console.log("Stripe Key Present:", !!process.env.STRIPE_SECRET_KEY);

  if (!shipping_address_id) {
    console.log("Error: No shipping address selected");
    return res.status(400).json({ error: "Shipping address is required" });
  }

  const cartQuery = `
    SELECT p.name, p.price, ci.quantity, p.image_url
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.product_id
    WHERE ci.user_id = ?
  `;

  req.db.query(cartQuery, [userId], async (err, cartItems) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Server Error" });
    }

    if (!cartItems || cartItems.length === 0) {
      console.log("Error: Cart is empty");
      return res.status(400).json({ error: "Cart is empty" });
    }

    try {
      const line_items = cartItems.map((item) => ({
        price_data: {
          currency: "usd",
          product_data: {
            name: item.name,
            images: item.image_url ? [item.image_url] : [],
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      }));

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items,
        mode: "payment",
        shipping_address_collection: {
          allowed_countries: ["US", "CA", "GB", "IN"],
        },
        success_url: `${
          process.env.BASE_URL || `http://localhost:${port}`
        }/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${
          process.env.BASE_URL || `http://localhost:${port}`
        }/checkout`,
        metadata: {
          user_id: String(userId),
          shipping_address_id: String(shipping_address_id),
          coupon_code: coupon_code || "",
        },
        customer_email: req.session.user.email,
      });

      console.log("Stripe session created:", session.id);
      res.json({ id: session.id });
    } catch (stripeError) {
      console.error("Stripe error:", stripeError);
      res.status(500).json({ error: "Stripe error: " + stripeError.message });
    }
  });
});

/* Payment success */
app.get("/payment-success", utils.requireLogin, async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.redirect("/");

  try {
    let stripeSession;
    if (stripe && typeof stripe.checkout.sessions.retrieve === "function") {
      stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
    }
    res.render("pages/payment-success", {
      session: stripeSession || { id: sessionId },
    });
  } catch (e) {
    console.error("Payment success retrieval error:", e);
    res.redirect("/checkout");
  }
});

/* Auth routes - unchanged */
app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/account");

  const error = req.query.blocked
    ? "Your account has been blocked. Please contact support."
    : null;
  res.render("pages/login", { error });
});

app.post("/login", (req, res) => {
  // Your full original login logic here (unchanged)
  const { email, password } = req.body;
  const query = "SELECT * FROM users WHERE email = ?";

  req.db.query(query, [email], async (err, results) => {
    if (err) {
      console.error("Login DB error:", err);
      return res.status(500).render("pages/login", { error: "Server error" });
    }

    if (!results || results.length === 0) {
      return res.render("pages/login", { error: "Invalid email or password" });
    }

    const user = results[0];
    if (user.role === "blocked") {
      return res.status(403).render("pages/login", {
        error: "Your account has been blocked. Please contact support.",
      });
    }

    try {
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.render("pages/login", {
          error: "Invalid email or password",
        });
      }

      const isAdmin =
        (user && (user.is_admin === 1 || user.is_admin === true)) ||
        (user && user.role === "admin");

      req.session.user = {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        is_admin: !!isAdmin,
        role: user.role || (isAdmin ? "admin" : "customer"),
      };

      res.redirect("/account");
    } catch (error) {
      console.error("Login compare error:", error);
      res.status(500).render("pages/login", { error: "Server error" });
    }
  });
});

app.get("/register", (req, res) => {
  if (req.session.user) return res.redirect("/account");
  res.render("pages/register", { user: req.session.user, error: null });
});

app.post("/register", async (req, res) => {
  // Your full original register logic (unchanged)
  const { name, email, password, confirm_password } = req.body;

  if (password !== confirm_password) {
    return res.render("pages/register", {
      user: req.session.user,
      error: "Passwords do not match",
    });
  }
  if (password.length < 6) {
    return res.render("pages/register", {
      user: req.session.user,
      error: "Password must be at least 6 characters",
    });
  }

  try {
    const checkQuery = "SELECT * FROM users WHERE email = ?";
    req.db.query(checkQuery, [email], async (err, results) => {
      if (err) {
        console.error("Register check DB error:", err);
        return res.status(500).render("pages/register", {
          user: req.session.user,
          error: "Server error",
        });
      }

      if (results && results.length > 0) {
        return res.render("pages/register", {
          user: req.session.user,
          error: "User with this email already exists",
        });
      }

      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      const insertQuery =
        "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)";
      req.db.query(
        insertQuery,
        [name, email, hashedPassword],
        (err, result) => {
          if (err) {
            console.error("Register insert DB error:", err);
            return res.status(500).render("pages/register", {
              user: req.session.user,
              error: "Server error",
            });
          }

          req.session.user = {
            user_id: result.insertId,
            name,
            email,
          };

          res.redirect("/account");
        }
      );
    });
  } catch (error) {
    console.error("Register unexpected error:", error);
    res.status(500).render("pages/register", {
      user: req.session.user,
      error: "Server error",
    });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("Logout error:", err);
    res.redirect("/");
  });
});

/* Account page - unchanged */
app.get("/account", utils.requireLogin, (req, res) => {
  const userId = req.session.user.user_id;
  const ordersQuery = `
    SELECT o.*, a.country, a.state, a.city, a.street_address
    FROM orders o
    JOIN addresses a ON o.shipping_address_id = a.address_id
    WHERE o.user_id = ?
    ORDER BY o.order_date DESC
  `;

  req.db.query(ordersQuery, [userId], (err, orders) => {
    if (err) {
      console.error("Account orders DB error:", err);
      return res.status(500).send("Server Error");
    }

    const addressQuery = "SELECT * FROM addresses WHERE user_id = ?";
    req.db.query(addressQuery, [userId], (err, addresses) => {
      if (err) {
        console.error("Account addresses DB error:", err);
        return res.status(500).send("Server Error");
      }

      res.render("pages/account", {
        user: req.session.user,
        orders,
        addresses,
      });
    });
  });
});

/* Add address */
app.post("/add-address", utils.requireLogin, (req, res) => {
  const userId = req.session.user.user_id;
  const { country, state, city, street_address, zip_code, address_type } =
    req.body;

  const query = `
    INSERT INTO addresses (user_id, country, state, city, street_address, zip_code, address_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  req.db.query(
    query,
    [userId, country, state, city, street_address, zip_code, address_type],
    (err) => {
      if (err) {
        console.error("Add address DB error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Server Error" });
      }

      res.json({ success: true, message: "Address added successfully" });
    }
  );
});

/* Contact & static pages - unchanged */
app.get("/contact", (req, res) => {
  res.render("pages/contactus");
});

app.post("/contact", async (req, res) => {
  const { name, email, message } = req.body;

  try {
    await sendContactEmail(name, email, message);
    res.send(
      `<h2 style="color: green; text-align:center;">Message Sent Successfully!</h2>
       <p style="text-align:center;">Thank you, ${name}. We’ll get back to you soon.</p>
       <a href="/" style="display:block;text-align:center;">Back to Home</a>`
    );
  } catch (error) {
    console.error("Email sending error:", error);
    res.status(500).send(
      `<h2 style="color: red; text-align:center;">Failed to send your message</h2>
       <p style="text-align:center;">Please try again later.</p>
       <a href="/contact" style="display:block;text-align:center;">Back to Contact</a>`
    );
  }
});

app.get("/about", (req, res) => {
  res.render("pages/about");
});

app.get("/debug-env", (req, res) => {
  res.json({
    STRIPE_PUBLIC_KEY: process.env.STRIPE_PUBLIC_KEY || "NOT SET",
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY
      ? "SET (hidden)"
      : "NOT SET",
    BASE_URL: process.env.BASE_URL || "NOT SET",
    NODE_ENV: process.env.NODE_ENV || "NOT SET",
  });
});

/* Shipping rates endpoint - unchanged */
app.post("/api/shipping/rates", (req, res) => {
  const { destination, weight } = req.body;

  if (!destination || !weight) {
    return res
      .status(400)
      .json({ error: "Destination and weight are required" });
  }

  let rate;
  if (destination.toLowerCase().includes("kenya")) {
    rate = 300;
  } else {
    rate = 1500;
  }

  const shippingDetails = {
    destination,
    weight,
    rate,
    estimated_delivery_days: destination.toLowerCase().includes("kenya")
      ? 3
      : 10,
  };

  res.json(shippingDetails);
});

/* ================================
   PAYPAL INTEGRATION (NEW & CORRECT ENDPOINTS)
   ================================ */

/* Create PayPal order - matches frontend expectation */
app.post("/api/paypal/create-order", utils.requireLogin, async (req, res) => {
  if (!paypalClient) {
    return res.status(500).json({ message: "PayPal not configured on server" });
  }

  const {
    total_amount,
    shipping_address_id,
    coupon_code = "",
    shipping_cost = 0,
  } = req.body;
  const userId = req.session.user.user_id;

  if (!total_amount || !shipping_address_id) {
    return res
      .status(400)
      .json({ message: "Missing total or shipping address" });
  }

  try {
    const request = new paypal.orders.OrdersCreateRequest();
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: parseFloat(total_amount).toFixed(2),
          },
          description: "Nyavalley Jewelry Order",
          custom_id: `${userId}|${shipping_address_id}|${coupon_code}|shipping:${shipping_cost}`,
        },
      ],
      application_context: {
        brand_name: "Nyavalley Jewelry",
        landing_page: "BILLING",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
      },
    });

    const response = await paypalClient.execute(request);
    res.json({ id: response.result.id });
  } catch (err) {
    console.error("PayPal create order error:", err);
    res.status(500).json({ message: "Failed to create PayPal order" });
  }
});

/* Capture PayPal order */
app.post("/api/paypal/capture-order", utils.requireLogin, async (req, res) => {
  if (!paypalClient) {
    return res.status(500).json({ message: "PayPal not configured on server" });
  }

  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ message: "Missing PayPal order ID" });
  }

  try {
    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});

    const capture = await paypalClient.execute(request);

    if (capture.result.status !== "COMPLETED") {
      return res.status(400).json({ message: "Payment not completed" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("PayPal capture error:", err);
    res.status(500).json({ message: "Failed to capture payment" });
  }
});

/* ================================
   ERROR HANDLING
   ================================ */
app.use((req, res) => {
  res.status(404).render("errors/404", { url: req.originalUrl });
});

app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(500).render("errors/500", { message: "Internal Server Error" });
});

/* ================================
   START SERVER
   ================================ */
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Server is running on http://localhost:${port}`);
});
