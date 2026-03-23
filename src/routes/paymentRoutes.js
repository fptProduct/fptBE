const express = require("express");
const {
  createMomoPayment,
  createMomoPaymentFromCart,
} = require("../controllers/patmentController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/momo/create", createMomoPayment);
router.post(
  "/momo/create-from-cart",
  authMiddleware,
  createMomoPaymentFromCart
);

module.exports = router;
