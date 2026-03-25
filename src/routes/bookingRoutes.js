const express = require("express");
const {
  createBooking,
  getAllBookings,
  confirmBooking,
} = require("../controllers/bookingController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.post("/", createBooking);
router.get("/", adminMiddleware, getAllBookings);
router.put("/:id/confirm", adminMiddleware, confirmBooking);

module.exports = router;
