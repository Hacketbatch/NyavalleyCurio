const express = require("express");
const router = express.Router();
const { getHome } = require("../controllers/productController");

router.get("/", getHome);

module.exports = router;


