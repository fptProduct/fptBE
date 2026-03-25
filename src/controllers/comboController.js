const Combo = require("../models/Combo");
const Product = require("../models/Product");

// Names in DB are a snapshot; always resolve current names from Product on read
async function toBatchComboResponse(combos) {
  const allIds = [
    ...new Set(
      combos.flatMap((c) => (c.product || []).map((p) => String(p.id)))
    ),
  ];
  let nameById = new Map();
  if (allIds.length > 0) {
    const products = await Product.find({ _id: { $in: allIds } }).select(
      "_id name"
    );
    nameById = new Map(products.map((p) => [String(p._id), p.name]));
  }
  return combos.map((combo) => ({
    id: combo._id,
    type: combo.type ?? "combo",
    name: combo.name,
    image: combo.images ?? combo.image,
    price: combo.price,
    product: (combo.product || []).map((p) => ({
      id: p.id,
      name: nameById.get(String(p.id)) ?? p.name,
    })),
  }));
}

async function toComboResponse(combo) {
  const [one] = await toBatchComboResponse([combo]);
  return one;
}

const normalizeProductIds = (productInput = []) => {
  if (!Array.isArray(productInput)) return [];
  return productInput
    .map((item) => {
      if (typeof item === "string") return item;
      return item?.id;
    })
    .filter(Boolean);
};

const buildComboProductsFromIds = async (productInput = []) => {
  const productIds = normalizeProductIds(productInput);
  const uniqueProductIds = [...new Set(productIds.map(String))];

  const products = await Product.find({ _id: { $in: uniqueProductIds } }).select(
    "_id name"
  );

  if (products.length !== uniqueProductIds.length) {
    throw new Error("One or more products not found");
  }

  const productById = new Map(products.map((item) => [String(item._id), item]));
  return uniqueProductIds.map((id) => {
    const product = productById.get(id);
    return {
      id: product._id,
      name: product.name,
    };
  });
};

// Create combo
exports.createCombo = async (req, res) => {
  try {
    const payload = { ...req.body };
    delete payload.type;

    if (payload.image !== undefined && payload.images === undefined) {
      payload.images = payload.image;
    }
    if (typeof payload.images === "string") {
      payload.images = [payload.images];
    }
    delete payload.image;

    if (payload.product !== undefined) {
      payload.product = await buildComboProductsFromIds(payload.product);
    }

    const combo = await Combo.create({ ...payload, type: "combo" });
    return res.status(201).json(await toComboResponse(combo));
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Get all combos
exports.getCombos = async (req, res) => {
  try {
    const { name } = req.query;
    const filter = {};

    if (name) {
      filter.name = { $regex: name, $options: "i" };
    }

    const combos = await Combo.find(filter);
    const total = await Combo.countDocuments(filter);

    return res.json({
      total,
      data: await toBatchComboResponse(combos),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Get combo by id
exports.getComboById = async (req, res) => {
  try {
    const combo = await Combo.findById(req.params.id);
    if (!combo) {
      return res.status(404).json({ message: "Combo not found" });
    }
    return res.json(await toComboResponse(combo));
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Update combo
exports.updateCombo = async (req, res) => {
  try {
    const payload = { ...req.body };
    delete payload.type;

    if (payload.image !== undefined && payload.images === undefined) {
      payload.images = payload.image;
    }
    if (typeof payload.images === "string") {
      payload.images = [payload.images];
    }
    delete payload.image;

    if (payload.product !== undefined) {
      payload.product = await buildComboProductsFromIds(payload.product);
    }

    const combo = await Combo.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!combo) {
      return res.status(404).json({ message: "Combo not found" });
    }

    return res.json(await toComboResponse(combo));
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// Delete combo
exports.deleteCombo = async (req, res) => {
  try {
    const combo = await Combo.findByIdAndDelete(req.params.id);
    if (!combo) {
      return res.status(404).json({ message: "Combo not found" });
    }
    return res.json({ message: "Combo deleted successfully" });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
