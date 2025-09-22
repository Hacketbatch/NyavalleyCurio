// This file contains all the SQL queries used in the application

const sqlStatements = {
  // User queries
  getUserByEmail: "SELECT * FROM users WHERE email = ?",
  createUser: "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",

  // Product queries
  getFeaturedProducts: `
        SELECT p.*, c.name as category_name 
        FROM products p 
        JOIN categories c ON p.category_id = c.category_id 
        WHERE p.is_active = true 
        LIMIT 8
    `,
  getProducts: `
        SELECT p.*, c.name as category_name 
        FROM products p 
        JOIN categories c ON p.category_id = c.category_id 
        WHERE p.is_active = true 
        LIMIT ? OFFSET ?
    `,
  getProductsByCategory: `
        SELECT p.*, c.name as category_name 
        FROM products p 
        JOIN categories c ON p.category_id = c.category_id 
        WHERE p.is_active = true AND c.category_id = ? 
        LIMIT ? OFFSET ?
    `,
  getProductById: `
        SELECT p.*, c.name as category_name 
        FROM products p 
        JOIN categories c ON p.category_id = c.category_id 
        WHERE p.product_id = ? AND p.is_active = true
    `,
  countProducts:
    "SELECT COUNT(*) as total FROM products WHERE is_active = true",
  countProductsByCategory:
    "SELECT COUNT(*) as total FROM products WHERE is_active = true AND category_id = ?",

  // Category queries
  getAllCategories: "SELECT * FROM categories",

  // Cart queries
  getCartItems: `
        SELECT ci.*, p.name, p.price, p.image_url 
        FROM cart_items ci 
        JOIN products p ON ci.product_id = p.product_id 
        WHERE ci.user_id = ?
    `,
  checkCartItem:
    "SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?",
  updateCartItem:
    "UPDATE cart_items SET quantity = quantity + ? WHERE user_id = ? AND product_id = ?",
  addCartItem:
    "INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)",
  removeCartItem: "DELETE FROM cart_items WHERE user_id = ? AND product_id = ?",
  updateCartItemQuantity:
    "UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?",
  clearCart: "DELETE FROM cart_items WHERE user_id = ?",

  // Address queries
  getUserAddresses: "SELECT * FROM addresses WHERE user_id = ?",
  addAddress: `
        INSERT INTO addresses (user_id, country, state, city, street_address, zip_code, address_type) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `,

  // Order queries
  createOrder:
    'INSERT INTO orders (user_id, total_amount, shipping_address_id, status) VALUES (?, ?, ?, "processing")',
  addOrderItems:
    "INSERT INTO order_items (order_id, product_id, quantity, price_at_time_of_sale) VALUES ?",
  createPayment:
    'INSERT INTO payments (order_id, amount, payment_method, payment_status) VALUES (?, ?, ?, "pending")',
  getUserOrders: `
        SELECT o.*, a.country, a.state, a.city, a.street_address 
        FROM orders o 
        JOIN addresses a ON o.shipping_address_id = a.address_id 
        WHERE o.user_id = ? 
        ORDER BY o.order_date DESC
    `,
};

module.exports = sqlStatements;
