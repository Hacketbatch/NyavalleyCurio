const express = require("express");
const router = express.Router();
const { requireLogin } = require("../middleware/auth");
const { getAccount, addAddress } = require("../controllers/userController");

router.get("/account", requireLogin, getAccount);
router.post("/address", requireLogin, addAddress);

module.exports = router;


