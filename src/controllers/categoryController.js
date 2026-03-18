const Category = require("../models/Category");

exports.createCategory = async (req, res) => {
  try {
    const { type, value, label, isActive } = req.body;

    if (!type || !value || !label) {
      return res.status(400).json({ message: "type, value, label are required" });
    }

    const category = await Category.create({ type, value, label, isActive });

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

    const categories = await Category.find(filter).sort({ value: 1 });

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
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, {
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

// Overview for FE
exports.getCategoriesOverview = async (req, res) => {
  try {
    const [ceremonies, packages] = await Promise.all([
      Category.find({ type: "CEREMONY", isActive: true }).sort({ value: 1 }),
      Category.find({ type: "PACKAGE", isActive: true }).sort({ value: 1 }),
    ]);

    return res.json({
      ceremonyCategory: ceremonies.map((c) => ({
        id: c._id,
        value: c.value,
        label: c.label,
      })),
      packageCategory: packages.map((c) => ({
        id: c._id,
        value: c.value,
        label: c.label,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

