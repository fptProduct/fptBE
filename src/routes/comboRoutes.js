const express = require("express");
const {
  createCombo,
  getCombos,
  getComboById,
  updateCombo,
  deleteCombo,
} = require("../controllers/comboController");

const router = express.Router();

router.post("/", createCombo);
router.get("/", getCombos);
router.get("/:id", getComboById);
router.put("/:id", updateCombo);
router.delete("/:id", deleteCombo);

module.exports = router;
