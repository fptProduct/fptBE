const Product = require("../models/Product");

// Create new product
exports.createProduct = async (req, res) => {
  try {
    const product = await Product.create(req.body);
    return res.status(201).json(product);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Get all products with optional filters
exports.getProducts = async (req, res) => {
  try {
    const { name, packageType, ceremonyType, isActive } = req.query;
    const filter = {};

    // Filter by name (partial match, case-insensitive)
    if (name) {
      filter.name = { $regex: name, $options: "i" };
    }

    // Filter by packageType (STANDARD, PREMIUM, CUSTOM)
    if (ceremonyType) {
      filter.ceremonyTypes = ceremonyType;
    }

    if (packageType) {
      filter.packageType = packageType;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    const products = await Product.find(filter);
    const total = await Product.countDocuments(filter);

    return res.json({
      total,
      data: products,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Get single product by id
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    return res.json(product);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
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

