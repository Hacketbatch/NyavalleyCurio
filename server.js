const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const mysql = require("mysql");
const bcrypt = require("bcrypt");
const utils = require("./utils");
const sqlStatements = require("./sqlStatements");
const adminRoutes = require("./routes/admin");
const mpesaRoutes = require("./routes/mpesa");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(
  session({
    secret: "ecommerce-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
  })
);

// Make user session available to all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Make environment variables available to views
app.use((req, res, next) => {
  // Pass specific environment variables to views
  res.locals.env = {
    STRIPE_PUBLIC_KEY: process.env.STRIPE_PUBLIC_KEY || "",
    BASE_URL: process.env.BASE_URL || "http://localhost:3001",
  };
  next();
});

// Set EJS as templating engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Database connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root", // Change as per your MySQL setup
  password: "Tivax5050##", // Change as per your MySQL setup
  database: "eccomercecurio",
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed: " + err.stack);
    return;
  }
  console.log("Connected to database as id " + db.threadId);

  // Initialize database with required tables
  utils.initializeDatabase(db);
});

// Make db accessible to routes
app.use((req, res, next) => {
  req.db = db;
  next();
});

// Enforce blocked users cannot stay logged in
app.use((req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === "blocked") {
    req.session.destroy(() => {
      return res.redirect("/login?blocked=1");
    });
  } else {
    next();
  }
});

// Middleware to fetch cart item count for logged-in users
app.use((req, res, next) => {
  if (req.session.user) {
    const userId = req.session.user.user_id;
    const cartCountQuery =
      "SELECT SUM(quantity) AS count FROM cart_items WHERE user_id = ?";

    req.db.query(cartCountQuery, [userId], (err, results) => {
      if (err) {
        console.error("Error fetching cart count:", err);
        res.locals.cartCount = 0;
        return next();
      }

      res.locals.cartCount = results[0].count || 0;
      next();
    });
  } else {
    res.locals.cartCount = 0;
    next();
  }
});

// Routes
app.use("/admin", adminRoutes);
app.use("/api/mpesa", utils.requireLogin, mpesaRoutes);
app.use("/api/orders", require("./routes/orders"));
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
      console.error(err);
      return res.status(500).send("Server Error");
    }

    res.render("pages/home", { products: products });
  });
});

app.get("/products", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
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

  if (category) {
    // Check if the selected category has subcategories
    const checkSubcategoriesQuery =
      "SELECT COUNT(*) as count FROM categories WHERE parent_category_id = ?";

    req.db.query(checkSubcategoriesQuery, [category], (err, subcatResults) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Server Error");
      }

      if (subcatResults[0].count > 0) {
        // This is a parent category with subcategories - get all subcategory IDs
        const getSubcategoriesQuery =
          "SELECT category_id FROM categories WHERE parent_category_id = ?";

        req.db.query(getSubcategoriesQuery, [category], (err, subcatIds) => {
          if (err) {
            console.error(err);
            return res.status(500).send("Server Error");
          }

          const subcategoryIds = subcatIds.map((item) => item.category_id);
          subcategoryIds.push(parseInt(category)); // Include the parent category itself

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
        // This is a regular category without subcategories
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
        console.error(err);
        return res.status(500).send("Server Error");
      }

      const totalProducts = countResult[0].total;
      const totalPages = Math.ceil(totalProducts / limit);

      req.db.query(query, queryParams, (err, products) => {
        if (err) {
          console.error(err);
          return res.status(500).send("Server Error");
        }

        // Get categories with hierarchy for filter
        const categoriesQuery = `
                    SELECT c1.*, c2.name as parent_name 
                    FROM categories c1 
                    LEFT JOIN categories c2 ON c1.parent_category_id = c2.category_id 
                    ORDER BY COALESCE(c2.name, c1.name), c1.name
                `;

        req.db.query(categoriesQuery, (err, categories) => {
          if (err) {
            console.error(err);
            return res.status(500).send("Server Error");
          }

          // Organize categories into hierarchy
          const categoryMap = {};
          const topLevelCategories = [];

          categories.forEach((cat) => {
            categoryMap[cat.category_id] = cat;

            if (!cat.parent_category_id) {
              topLevelCategories.push(cat);
            }
          });

          // Add children to parent categories
          categories.forEach((cat) => {
            if (cat.parent_category_id) {
              const parent = categoryMap[cat.parent_category_id];
              if (parent) {
                if (!parent.children) {
                  parent.children = [];
                }
                parent.children.push(cat);
              }
            }
          });

          res.render("pages/products", {
            products: products,
            categories: topLevelCategories,
            allCategories: categories,
            currentPage: page,
            totalPages: totalPages,
            currentCategory: category,
            currentSearch: search,
          });
        });
      });
    });
  }
});

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
      console.error(err);
      return res.status(500).send("Server Error");
    }

    if (results.length === 0) {
      return res.status(404).send("Product not found");
    }

    const product = results[0];
    res.render("pages/product-detail", {
      user: req.session.user,
      product: product,
    });
  });
});

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
      console.error(err);
      return res.status(500).send("Server Error");
    }

    // Calculate total
    let total = 0;
    cartItems.forEach((item) => {
      total += item.price * item.quantity;
    });

    res.render("pages/cart", {
      user: req.session.user,
      cartItems: cartItems,
      total: total,
    });
  });
});

app.post("/add-to-cart", utils.requireLogin, (req, res) => {
  const userId = req.session.user.user_id;
  const productId = req.body.product_id;
  const quantity = req.body.quantity || 1;

  // Check if product already in cart
  const checkQuery =
    "SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?";
  req.db.query(checkQuery, [userId, productId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "Server Error" });
    }

    if (results.length > 0) {
      // Update quantity if product already in cart
      const updateQuery =
        "UPDATE cart_items SET quantity = quantity + ? WHERE user_id = ? AND product_id = ?";
      req.db.query(updateQuery, [quantity, userId, productId], (err) => {
        if (err) {
          console.error(err);
          return res
            .status(500)
            .json({ success: false, message: "Server Error" });
        }

        res.json({ success: true, message: "Product added to cart" });
      });
    } else {
      // Add new item to cart
      const insertQuery =
        "INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)";
      req.db.query(insertQuery, [userId, productId, quantity], (err) => {
        if (err) {
          console.error(err);
          return res
            .status(500)
            .json({ success: false, message: "Server Error" });
        }

        res.json({ success: true, message: "Product added to cart" });
      });
    }
  });
});

app.post("/update-cart", utils.requireLogin, (req, res) => {
  const userId = req.session.user.user_id;
  const productId = req.body.product_id;
  const quantity = req.body.quantity;

  if (quantity <= 0) {
    // Remove item from cart
    const deleteQuery =
      "DELETE FROM cart_items WHERE user_id = ? AND product_id = ?";
    req.db.query(deleteQuery, [userId, productId], (err) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ success: false, message: "Server Error" });
      }

      res.json({ success: true, message: "Product removed from cart" });
    });
  } else {
    // Update quantity
    const updateQuery =
      "UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?";
    req.db.query(updateQuery, [quantity, userId, productId], (err) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ success: false, message: "Server Error" });
      }

      res.json({ success: true, message: "Cart updated" });
    });
  }
});

app.get("/checkout", utils.requireLogin, (req, res) => {
  const userId = req.session.user.user_id;

  // Get user addresses
  const addressQuery = "SELECT * FROM addresses WHERE user_id = ?";
  req.db.query(addressQuery, [userId], (err, addresses) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Server Error");
    }

    // Get cart items
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

      // Calculate total
      let total = 0;
      cartItems.forEach((item) => {
        total += item.price * item.quantity;
      });

      res.render("pages/checkout", {
        user: req.session.user,
        addresses: addresses,
        cartItems: cartItems,
        total: total,
      });
    });
  });
});

app.post("/create-checkout-session", utils.requireLogin, async (req, res) => {
  const userId = req.session.user.user_id;
  const { shipping_address_id, coupon_code } = req.body;

  console.log("=== STRIPE CHECKOUT SESSION REQUEST ===");
  console.log("User ID:", userId);
  console.log("Shipping Address ID:", shipping_address_id);
  console.log("Coupon Code:", coupon_code);
  console.log("Stripe Key Present:", !!process.env.STRIPE_SECRET_KEY);

  try {
    // Validate shipping address
    if (!shipping_address_id) {
      console.log("Error: No shipping address selected");
      return res.status(400).json({ error: "Shipping address is required" });
    }

    const cartQuery = `
      SELECT p.name, p.price, ci.quantity, p.image_url
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.product_id
      WHERE ci.user_id = ?`;

    req.db.query(cartQuery, [userId], async (err, cartItems) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: "Server Error" });
      }

      if (!cartItems || cartItems.length === 0) {
        console.log("Error: Cart is empty");
        return res.status(400).json({ error: "Cart is empty" });
      }

      console.log("Cart items:", cartItems);

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

        console.log("Line items created:", line_items);

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items,
          mode: "payment",
          shipping_address_collection: {
            allowed_countries: ["US", "CA", "GB", "IN"],
          },
          success_url: `${
            process.env.BASE_URL || "http://localhost:3001"
          }/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${
            process.env.BASE_URL || "http://localhost:3001"
          }/checkout`,
          metadata: {
            user_id: String(userId),
            shipping_address_id: String(shipping_address_id),
            coupon_code: coupon_code || "",
          },
          customer_email: req.session.user.email,
        });

        console.log("Stripe session created:", session.id);

        // Return session ID for redirectToCheckout
        res.json({ id: session.id });
      } catch (stripeError) {
        console.error("Stripe error:", stripeError);
        res.status(500).json({ error: "Stripe error: " + stripeError.message });
      }
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/payment-success", utils.requireLogin, async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.redirect("/");

  try {
    const session = await mpesa.checkout.sessions.retrieve(sessionId);
    // Optional: fetch line items or payment intent for more details
    // You can use metadata from the session to create the order here

    // Render a confirmation page (create payment-success.ejs)
    res.render("pages/payment-success", { session });
  } catch (e) {
    console.error(e);
    res.redirect("/checkout");
  }
});

// All order related routes have been moved to routes/orders.js

app.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect("/account");
  }
  const error = req.query.blocked
    ? "Your account has been blocked. Please contact support."
    : null;
  res.render("pages/login", { error });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const query = "SELECT * FROM users WHERE email = ?";
  req.db.query(query, [email], async (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).render("pages/login", { error: "Server error" });
    }

    if (results.length === 0) {
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

      // Set user session
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
      console.error(error);
      res.status(500).render("pages/login", { error: "Server error" });
    }
  });
});

// In server.js, update the /register GET route:
app.get("/register", (req, res) => {
  if (req.session.user) {
    return res.redirect("/account");
  }
  res.render("pages/register", {
    user: req.session.user, // Add this line
    error: null,
  });
});

// Also update the /register POST route:
app.post("/register", async (req, res) => {
  const { name, email, password, confirm_password } = req.body;

  // Validation
  if (password !== confirm_password) {
    return res.render("pages/register", {
      user: req.session.user, // Add this line
      error: "Passwords do not match",
    });
  }

  if (password.length < 6) {
    return res.render("pages/register", {
      user: req.session.user, // Add this line
      error: "Password must be at least 6 characters",
    });
  }

  try {
    // Check if user already exists
    const checkQuery = "SELECT * FROM users WHERE email = ?";
    req.db.query(checkQuery, [email], async (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).render("pages/register", {
          user: req.session.user, // Add this line
          error: "Server error",
        });
      }

      if (results.length > 0) {
        return res.render("pages/register", {
          user: req.session.user, // Add this line
          error: "User with this email already exists",
        });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create user
      const insertQuery =
        "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)";
      req.db.query(
        insertQuery,
        [name, email, hashedPassword],
        (err, result) => {
          if (err) {
            console.error(err);
            return res.status(500).render("pages/register", {
              user: req.session.user, // Add this line
              error: "Server error",
            });
          }

          // Auto-login after registration
          req.session.user = {
            user_id: result.insertId,
            name: name,
            email: email,
          };

          res.redirect("/account");
        }
      );
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("pages/register", {
      user: req.session.user, // Add this line
      error: "Server error",
    });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
    }
    res.redirect("/");
  });
});

app.get("/account", utils.requireLogin, (req, res) => {
  const userId = req.session.user.user_id;

  // Get user orders
  const ordersQuery = `
        SELECT o.*, a.country, a.state, a.city, a.street_address 
        FROM orders o 
        JOIN addresses a ON o.shipping_address_id = a.address_id 
        WHERE o.user_id = ? 
        ORDER BY o.order_date DESC
    `;

  req.db.query(ordersQuery, [userId], (err, orders) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Server Error");
    }

    // Get user addresses
    const addressQuery = "SELECT * FROM addresses WHERE user_id = ?";
    req.db.query(addressQuery, [userId], (err, addresses) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Server Error");
      }

      res.render("pages/account", {
        user: req.session.user,
        orders: orders,
        addresses: addresses,
      });
    });
  });
});

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
        console.error(err);
        return res
          .status(500)
          .json({ success: false, message: "Server Error" });
      }

      res.json({ success: true, message: "Address added successfully" });
    }
  );
});



// Debug endpoint to check environment variables
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

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Server is running on http://localhost:${port}`);
});
