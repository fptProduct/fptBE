const express = require("express");
const {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getCategoriesOverview,
} = require("../controllers/categoryController");

const router = express.Router();

// FE overview
router.get("/overview", getCategoriesOverview);

// CRUD
router.post("/", createCategory);
router.get("/", getCategories);
router.get("/:id", getCategoryById);
router.put("/:id", updateCategory);
router.delete("/:id", deleteCategory);

module.exports = router;

