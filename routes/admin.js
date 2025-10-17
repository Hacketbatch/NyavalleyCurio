const express = require('express');
const router = express.Router();
const admin = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configure multer storage to public/uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(process.cwd(), 'public', 'uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]/gi, '_');
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});
const upload = multer({ storage });

router.use(requireAdmin);

router.get('/', admin.getDashboard);

// Products
router.get('/products', admin.listProducts);
router.get('/products/new', admin.getCreateProduct);
router.post('/products/new', upload.single('image'), admin.postCreateProduct);
router.get('/products/:id/edit', admin.getEditProduct);
router.post('/products/:id/edit', upload.single('image'), admin.postEditProduct);
router.post('/products/:id/delete', admin.deleteProduct);

// Orders
router.get('/orders', admin.listOrders);
router.get('/orders/:id', admin.getOrderDetail);
router.get('/orders/:id/invoice', admin.getOrderInvoice);
router.post('/orders/:id/status', admin.updateOrderStatus);

// Users
router.get('/users', admin.listUsers);
router.post('/users/:id/block', admin.toggleBlockUser);

// Coupons
router.get('/coupons', admin.listCoupons);
router.get('/coupons/new', admin.getCreateCoupon);
router.post('/coupons/new', admin.postCreateCoupon);
router.get('/coupons/:id/edit', admin.getEditCoupon);
router.post('/coupons/:id/edit', admin.postEditCoupon);
router.post('/coupons/:id/delete', admin.deleteCoupon);

module.exports = router;



