const Product = require("../models/Product");
const Category = require("../models/Category");

// Create new product
exports.createProduct = async (req, res) => {
  try {
    const payload = { ...req.body };
    delete payload.type;
    // Allow both `categoryFoodId` and `categoryFood` (id) from client
    if (payload.categoryFoodId == null && payload.categoryFood != null) {
      payload.categoryFoodId = payload.categoryFood;
      delete payload.categoryFood;
    }
    const product = await Product.create({ ...payload, type: "product" });
    return res.status(201).json(product);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Get all products with optional filters
exports.getProducts = async (req, res) => {
  try {
    const { name, isActive, categoryFoodId, categoryFood, categorySlug, slug } =
      req.query;
    const filter = {};

    if (name) {
      filter.name = { $regex: name, $options: "i" };
    }

    let foodCatId = categoryFoodId ?? categoryFood;
    if (!foodCatId) {
      const slugVal = categorySlug ?? slug;
      if (slugVal) {
        const cat = await Category.findOne({
          type: "CATEGORY-FOOD",
          slug: String(slugVal).trim(),
        });
        if (!cat) {
          return res.json({ total: 0, data: [] });
        }
        foodCatId = cat._id;
      }
    }
    if (foodCatId) {
      filter.categoryFoodId = foodCatId;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    const products = await Product.find(filter).populate({
      path: "categoryFoodId",
      select: "label slug",
    });
    const total = await Product.countDocuments(filter);

    const data = products.map((p) => {
      const obj = p.toObject();
      const cat = obj.categoryFoodId;
      obj.categoryFoodId = cat
        ? { id: cat._id, label: cat.label, slug: cat.slug }
        : { id: null, label: null, slug: null };
      return obj;
    });

    return res.json({
      total,
      data,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Get single product by id
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate({
      path: "categoryFoodId",
      select: "label",
    });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    const obj = product.toObject();
    const cat = obj.categoryFoodId;
    obj.categoryFoodId = cat
      ? { id: cat._id, label: cat.label }
      : { id: null, label: null };
    return res.json(obj);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const payload = { ...req.body };
    delete payload.type;
    if (payload.categoryFoodId == null && payload.categoryFood != null) {
      payload.categoryFoodId = payload.categoryFood;
      delete payload.categoryFood;
    }
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      payload,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.json(product);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Delete product
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    return res.json({ message: "Product deleted successfully" });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Delete all products
exports.deleteAllProducts = async (_req, res) => {
  try {
    const result = await Product.deleteMany({});
    return res.json({
      message: "All products deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

