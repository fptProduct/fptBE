const express = require("express");
const {
  quoteOrder,
  confirmOrder,
  getOrderById,
} = require("../controllers/orderController");

const router = express.Router();

router.post("/quote", quoteOrder);
router.post("/confirm", confirmOrder);
router.get("/:id", getOrderById);

module.exports = router;

