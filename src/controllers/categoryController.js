const Category = require("../models/Category");

exports.createCategory = async (req, res) => {
  try {
    const { type, slug, label, isActive, value } = req.body;

    if (!type || !label || slug == null || String(slug).trim() === "") {
      return res.status(400).json({ message: "type, slug, label are required" });
    }

    const category = await Category.create({
      type,
      slug,
      value: value ?? slug,
      label,
      isActive,
    });

    return res.status(201).json(category);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const { type, isActive } = req.query;

    const filter = {};
    if (type) filter.type = type;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const categories = await Category.find(filter).sort({ slug: 1 });

    return res.json({ total: categories.length, items: categories });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    return res.json(category);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const payload = { ...req.body };
    // Keep legacy `value` in sync when updating slug.
    if (payload.slug != null && payload.value == null) {
      payload.value = payload.slug;
    }

    const category = await Category.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    return res.json(category);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    return res.json({ message: "Category deleted successfully" });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Delete all categories
exports.deleteAllCategories = async (_req, res) => {
  try {
    const result = await Category.deleteMany({});
    return res.json({
      message: "All categories deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Overview for FE
exports.getCategoriesOverview = async (req, res) => {
  try {
    const [ceremonies, packages, foodCategories] = await Promise.all([
      Category.find({ type: "CEREMONY", isActive: true }).sort({ slug: 1 }),
      Category.find({ type: "PACKAGE", isActive: true }).sort({ slug: 1 }),
      Category.find({ type: "CATEGORY-FOOD", isActive: true }).sort({ slug: 1 }),
    ]);

    const mapItem = (c) => ({
      id: c._id,
      slug: c.slug,
      label: c.label,
    });

    return res.json({
      ceremonyCategory: ceremonies.map(mapItem),
      packageCategory: packages.map(mapItem),
      foodCategory: foodCategories.map(mapItem),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

