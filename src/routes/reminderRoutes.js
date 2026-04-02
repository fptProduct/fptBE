const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  createReminder,
  getMyReminders,
} = require("../controllers/reminderController");

const router = express.Router();

router.use(authMiddleware);
router.post("/", createReminder);
router.get("/", getMyReminders);

module.exports = router;
