const express = require("express");
const {
  createMomoPayment,
  createMomoPaymentFromCart,
  createPayOSPayment,
  createPayOSPaymentFromCart,
  createPayOSPaymentFromBooking,
  payOSWebhook,
} = require("../controllers/patmentController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/momo/create", createMomoPayment);
router.post(
  "/momo/create-from-cart",
  authMiddleware,
  createMomoPaymentFromCart
);

router.post("/payos/create", createPayOSPayment);
router.post(
  "/payos/create-from-cart",
  authMiddleware,
  createPayOSPaymentFromCart
);
router.post("/payos/create-from-booking", createPayOSPaymentFromBooking);
router.post("/payos/webhook", payOSWebhook);

module.exports = router;
