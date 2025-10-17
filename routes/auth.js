const express = require("express");
const router = express.Router();
const { getLogin, postLogin, getRegister, postRegister, logout } = require("../controllers/authController");

router.get("/login", getLogin);
router.post("/login", postLogin);
router.get("/register", getRegister);
router.post("/register", postRegister);
router.get("/logout", logout);

module.exports = router;


