const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { getDashboard } = require("../controllers/dashboardController");

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);
router.get("/", getDashboard);

module.exports = router;
