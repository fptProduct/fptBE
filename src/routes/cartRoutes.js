const express = require("express");
const {
  getCart,
  addToCart,
  removeFromCart,
  updateCartItem,
} = require("../controllers/cartController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getCart);
router.post("/add", addToCart);
router.patch("/update", updateCartItem);
router.post("/remove", removeFromCart);
router.delete("/remove", removeFromCart);

module.exports = router;
