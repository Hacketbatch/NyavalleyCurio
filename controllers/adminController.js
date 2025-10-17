function getDashboard(req, res) {
  const stats = {};
  const queries = {
    totalSales: "SELECT COALESCE(SUM(total_amount),0) AS total FROM orders WHERE status IN ('processing','shipped','delivered')",
    totalOrders: "SELECT COUNT(*) AS count FROM orders",
    totalUsers: "SELECT COUNT(*) AS count FROM users",
    latestOrders: "SELECT o.*, u.name FROM orders o JOIN users u ON o.user_id = u.user_id ORDER BY o.order_date DESC LIMIT 10",
  };

  req.db.query(queries.totalSales, (e1, r1) => {
    stats.totalSales = e1 ? 0 : r1[0].total;
    req.db.query(queries.totalOrders, (e2, r2) => {
      stats.totalOrders = e2 ? 0 : r2[0].count;
      req.db.query(queries.totalUsers, (e3, r3) => {
        stats.totalUsers = e3 ? 0 : r3[0].count;
        req.db.query(queries.latestOrders, (e4, latestOrders) => {
          if (e4) latestOrders = [];
          res.render("admin/dashboard", { user: req.session.user, stats, latestOrders });
        });
      });
    });
  });
}

function listProducts(req, res) {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  const offset = (page - 1) * limit;
  const search = (req.query.q || '').trim();
  const allowedSort = { created_at: 'created_at', name: 'name', price: 'price', product_id: 'product_id' };
  const sortKey = allowedSort[req.query.sort] || 'created_at';
  const sortDir = (req.query.dir === 'asc' ? 'ASC' : 'DESC');

  let where = '';
  let params = [];
  if (search) {
    where = 'WHERE name LIKE ?';
    params.push(`%${search}%`);
  }

  const countSql = `SELECT COUNT(*) AS total FROM products ${where}`;
  req.db.query(countSql, params, (err, countRows) => {
    if (err) return res.status(500).render('errors/500', { error: 'Server error' });
    const total = countRows[0].total;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const sql = `SELECT * FROM products ${where} ORDER BY ${sortKey} ${sortDir} LIMIT ? OFFSET ?`;
    req.db.query(sql, [...params, limit, offset], (e2, products) => {
      if (e2) return res.status(500).render('errors/500', { error: 'Server error' });
      res.render('admin/products', {
        user: req.session.user,
        products,
        error: null,
        success: null,
        page,
        totalPages,
        q: search,
        sort: sortKey,
        dir: sortDir.toLowerCase(),
      });
    });
  });
}

function getCreateProduct(req, res) {
  res.render("admin/product-form", { user: req.session.user, product: null, error: null, success: null });
}

function postCreateProduct(req, res) {
  const { name, description, price, category_id, image_url, is_active } = req.body;
  const uploadedPath = req.file ? `/uploads/${req.file.filename}` : null;
  const finalImageUrl = uploadedPath || image_url || null;
  const q = "INSERT INTO products (name, description, price, category_id, image_url, is_active) VALUES (?, ?, ?, ?, ?, ?)";
  req.db.query(q, [name, description, price, category_id, finalImageUrl, is_active !== 'false'], (err) => {
    if (err) return res.status(500).render("admin/product-form", { user: req.session.user, product: null, error: "Server error", success: null });
    res.redirect("/admin/products");
  });
}

function getEditProduct(req, res) {
  const id = req.params.id;
  req.db.query("SELECT * FROM products WHERE product_id = ?", [id], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).render("errors/404");
    res.render("admin/product-form", { user: req.session.user, product: rows[0], error: null, success: null });
  });
}

function postEditProduct(req, res) {
  const id = req.params.id;
  const { name, description, price, category_id, image_url, is_active } = req.body;
  const uploadedPath = req.file ? `/uploads/${req.file.filename}` : null;
  const finalImageUrl = uploadedPath || image_url || null;
  const q = "UPDATE products SET name=?, description=?, price=?, category_id=?, image_url=?, is_active=? WHERE product_id=?";
  req.db.query(q, [name, description, price, category_id, finalImageUrl, is_active !== 'false', id], (err) => {
    if (err) return res.status(500).render("admin/product-form", { user: req.session.user, product: { product_id: id, name, description, price, category_id, image_url, is_active }, error: "Server error", success: null });
    res.redirect("/admin/products");
  });
}

function deleteProduct(req, res) {
  const id = req.params.id;
  req.db.query("DELETE FROM products WHERE product_id = ?", [id], (err) => {
    if (err) return res.status(500).render("errors/500", { error: "Server error" });
    res.redirect("/admin/products");
  });
}

function listOrders(req, res) {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  const offset = (page - 1) * limit;
  const search = (req.query.q || '').trim();
  const allowedSort = { order_date: 'o.order_date', total_amount: 'o.total_amount', order_id: 'o.order_id', status: 'o.status' };
  const sortKey = allowedSort[req.query.sort] || 'o.order_date';
  const sortDir = (req.query.dir === 'asc' ? 'ASC' : 'DESC');

  let where = '';
  let params = [];
  if (search) {
    where = 'WHERE (u.name LIKE ? OR o.status LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const countSql = `SELECT COUNT(*) AS total FROM orders o JOIN users u ON o.user_id = u.user_id ${where}`;
  req.db.query(countSql, params, (err, countRows) => {
    if (err) return res.status(500).render('errors/500', { error: 'Server error' });
    const total = countRows[0].total;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const sql = `SELECT o.*, u.name FROM orders o JOIN users u ON o.user_id = u.user_id ${where} ORDER BY ${sortKey} ${sortDir} LIMIT ? OFFSET ?`;
    req.db.query(sql, [...params, limit, offset], (e2, orders) => {
      if (e2) return res.status(500).render('errors/500', { error: 'Server error' });
      res.render('admin/orders', { user: req.session.user, orders, error: null, success: null, page, totalPages, q: search, sort: sortKey, dir: sortDir.toLowerCase() });
    });
  });
}

function updateOrderStatus(req, res) {
  const id = req.params.id;
  const { status } = req.body;
  req.db.query("UPDATE orders SET status = ? WHERE order_id = ?", [status, id], (err) => {
    if (err) return res.status(500).render("errors/500", { error: "Server error" });
    res.redirect("/admin/orders");
  });
}

function listUsers(req, res) {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  const offset = (page - 1) * limit;
  const search = (req.query.q || '').trim();
  const allowedSort = { created_at: 'created_at', name: 'name', email: 'email', user_id: 'user_id', role: 'role' };
  const sortKey = allowedSort[req.query.sort] || 'created_at';
  const sortDir = (req.query.dir === 'asc' ? 'ASC' : 'DESC');

  let where = '';
  let params = [];
  if (search) {
    where = 'WHERE (name LIKE ? OR email LIKE ? OR role LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const countSql = `SELECT COUNT(*) AS total FROM users ${where}`;
  req.db.query(countSql, params, (err, countRows) => {
    if (err) return res.status(500).render('errors/500', { error: 'Server error' });
    const total = countRows[0].total;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const sql = `SELECT user_id, name, email, role, created_at FROM users ${where} ORDER BY ${sortKey} ${sortDir} LIMIT ? OFFSET ?`;
    req.db.query(sql, [...params, limit, offset], (e2, users) => {
      if (e2) return res.status(500).render('errors/500', { error: 'Server error' });
      res.render('admin/users', { user: req.session.user, users, error: null, success: null, page, totalPages, q: search, sort: sortKey, dir: sortDir.toLowerCase() });
    });
  });
}

function toggleBlockUser(req, res) {
  const id = req.params.id;
  const { block } = req.body;
  
  // Get current query parameters to maintain state
  const page = parseInt(req.query.page, 10) || 1;
  const search = (req.query.q || '').trim();
  const sortKey = req.query.sort || 'created_at';
  const sortDir = req.query.dir || 'desc';
  
  req.db.query("SELECT user_id, role FROM users WHERE user_id = ?", [id], (err, rows) => {
    if (err || rows.length === 0) {
      return res.status(404).render("errors/404");
    }
    
    const target = rows[0];
    
    if (target.user_id === req.session.user.user_id) {
      // Get users with pagination and search to render error properly
      const limit = 10;
      const offset = (page - 1) * limit;
      let where = '';
      let params = [];
      
      if (search) {
        where = 'WHERE (name LIKE ? OR email LIKE ? OR role LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      
      const countSql = `SELECT COUNT(*) AS total FROM users ${where}`;
      req.db.query(countSql, params, (countErr, countRows) => {
        if (countErr) return res.status(500).render("errors/500", { error: "Server error" });
        const total = countRows[0].total;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        
        const sql = `SELECT user_id, name, email, role, created_at FROM users ${where} ORDER BY ${sortKey} ${sortDir.toUpperCase()} LIMIT ? OFFSET ?`;
        req.db.query(sql, [...params, limit, offset], (userErr, users) => {
          if (userErr) return res.status(500).render("errors/500", { error: "Server error" });
          return res.status(400).render("admin/users", { 
            user: req.session.user, 
            users, 
            error: "You cannot change your own block status.", 
            success: null,
            page,
            totalPages,
            q: search,
            sort: sortKey,
            dir: sortDir
          });
        });
      });
      return;
    }
    
    if (target.role === 'admin' && block === 'true') {
      // Similar fix for admin blocking error
      const limit = 10;
      const offset = (page - 1) * limit;
      let where = '';
      let params = [];
      
      if (search) {
        where = 'WHERE (name LIKE ? OR email LIKE ? OR role LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      
      const countSql = `SELECT COUNT(*) AS total FROM users ${where}`;
      req.db.query(countSql, params, (countErr, countRows) => {
        if (countErr) return res.status(500).render("errors/500", { error: "Server error" });
        const total = countRows[0].total;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        
        const sql = `SELECT user_id, name, email, role, created_at FROM users ${where} ORDER BY ${sortKey} ${sortDir.toUpperCase()} LIMIT ? OFFSET ?`;
        req.db.query(sql, [...params, limit, offset], (userErr, users) => {
          if (userErr) return res.status(500).render("errors/500", { error: "Server error" });
          return res.status(400).render("admin/users", { 
            user: req.session.user, 
            users, 
            error: "You cannot block an admin account.", 
            success: null,
            page,
            totalPages,
            q: search,
            sort: sortKey,
            dir: sortDir
          });
        });
      });
      return;
    }
    
    const newRole = block === 'true' ? 'blocked' : 'customer';
    req.db.query("UPDATE users SET role = ? WHERE user_id = ?", [newRole, id], (uErr) => {
      if (uErr) return res.status(500).render("errors/500", { error: "Server error" });
      res.redirect("/admin/users");
    });
  });
}

module.exports = {
  getDashboard,
  listProducts,
  getCreateProduct,
  postCreateProduct,
  getEditProduct,
  postEditProduct,
  deleteProduct,
  listOrders,
  updateOrderStatus,
  listUsers,
  toggleBlockUser,
  listCoupons,
  getCreateCoupon,
  postCreateCoupon,
  getEditCoupon,
  postEditCoupon,
  deleteCoupon,
};

function getOrderDetail(req, res) {
  const id = req.params.id;
  const orderSql = `
    SELECT o.*, u.name AS customer_name, u.email,
           a.country, a.state, a.city, a.street_address, a.zip_code
    FROM orders o
    JOIN users u ON o.user_id = u.user_id
    JOIN addresses a ON o.shipping_address_id = a.address_id
    WHERE o.order_id = ?`;
  const itemsSql = `
    SELECT oi.*, p.name AS product_name, p.image_url
    FROM order_items oi
    JOIN products p ON oi.product_id = p.product_id
    WHERE oi.order_id = ?`;
  req.db.query(orderSql, [id], (e1, orderRows) => {
    if (e1 || orderRows.length === 0) return res.status(404).render('errors/404');
    const order = orderRows[0];
    req.db.query(itemsSql, [id], (e2, items) => {
      if (e2) return res.status(500).render('errors/500', { error: 'Server error' });
      res.render('admin/order-detail', { user: req.session.user, order, items });
    });
  });
}

function getOrderInvoice(req, res) {
  const id = req.params.id;
  const orderSql = `
    SELECT o.*, u.name AS customer_name, u.email,
           a.country, a.state, a.city, a.street_address, a.zip_code
    FROM orders o
    JOIN users u ON o.user_id = u.user_id
    JOIN addresses a ON o.shipping_address_id = a.address_id
    WHERE o.order_id = ?`;
  const itemsSql = `
    SELECT oi.*, p.name AS product_name
    FROM order_items oi
    JOIN products p ON oi.product_id = p.product_id
    WHERE oi.order_id = ?`;
  req.db.query(orderSql, [id], (e1, orderRows) => {
    if (e1 || orderRows.length === 0) return res.status(404).render('errors/404');
    const order = orderRows[0];
    req.db.query(itemsSql, [id], (e2, items) => {
      if (e2) return res.status(500).render('errors/500', { error: 'Server error' });
      res.render('admin/invoice', { order, items });
    });
  });
}

module.exports.getOrderDetail = getOrderDetail;
module.exports.getOrderInvoice = getOrderInvoice;

function listCoupons(req, res) {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  const offset = (page - 1) * limit;
  const search = (req.query.q || '').trim();
  let where = '';
  let params = [];
  if (search) {
    where = 'WHERE code LIKE ?';
    params.push(`%${search}%`);
  }
  const countSql = `SELECT COUNT(*) AS total FROM coupons ${where}`;
  req.db.query(countSql, params, (e1, cr) => {
    if (e1) return res.status(500).render('errors/500', { error: 'Server error' });
    const total = cr[0].total;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const sql = `SELECT * FROM coupons ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    req.db.query(sql, [...params, limit, offset], (e2, coupons) => {
      if (e2) return res.status(500).render('errors/500', { error: 'Server error' });
      res.render('admin/coupons', { user: req.session.user, coupons, page, totalPages, q: search });
    });
  });
}

function getCreateCoupon(req, res) {
  res.render('admin/coupon-form', { user: req.session.user, coupon: null, error: null });
}

function postCreateCoupon(req, res) {
  const { code, type, value, min_order, max_uses, active, valid_from, valid_to } = req.body;
  const sql = `INSERT INTO coupons (code, type, value, min_order, max_uses, active, valid_from, valid_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  req.db.query(sql, [code.trim(), type, value, min_order || 0, max_uses || null, active === 'true', valid_from || null, valid_to || null], (err) => {
    if (err) return res.status(500).render('admin/coupon-form', { user: req.session.user, coupon: null, error: 'Server error' });
    res.redirect('/admin/coupons');
  });
}

function getEditCoupon(req, res) {
  const id = req.params.id;
  req.db.query('SELECT * FROM coupons WHERE coupon_id = ?', [id], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).render('errors/404');
    res.render('admin/coupon-form', { user: req.session.user, coupon: rows[0], error: null });
  });
}

function postEditCoupon(req, res) {
  const id = req.params.id;
  const { code, type, value, min_order, max_uses, active, valid_from, valid_to } = req.body;
  const sql = `UPDATE coupons SET code=?, type=?, value=?, min_order=?, max_uses=?, active=?, valid_from=?, valid_to=? WHERE coupon_id=?`;
  req.db.query(sql, [code.trim(), type, value, min_order || 0, max_uses || null, active === 'true', valid_from || null, valid_to || null, id], (err) => {
    if (err) return res.status(500).render('admin/coupon-form', { user: req.session.user, coupon: { coupon_id: id, code, type, value, min_order, max_uses, active: active === 'true', valid_from, valid_to }, error: 'Server error' });
    res.redirect('/admin/coupons');
  });
}

function deleteCoupon(req, res) {
  const id = req.params.id;
  req.db.query('DELETE FROM coupons WHERE coupon_id = ?', [id], (err) => {
    if (err) return res.status(500).render('errors/500', { error: 'Server error' });
    res.redirect('/admin/coupons');
  });
}



