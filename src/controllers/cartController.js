const Cart = require("../models/Cart");
const Combo = require("../models/Combo");
const Product = require("../models/Product");

function lineTotal(item) {
  return item.quantity * item.unitPrice;
}

function cartTotals(items) {
  const totalPrice = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalItems = items.length;
  return { totalPrice, totalQuantity, totalItems };
}

function pickPrimaryImage(doc) {
  if (!doc) return null;
  if (Array.isArray(doc.images) && doc.images.length > 0) {
    return doc.images[0] || null;
  }
  if (typeof doc.image === "string" && doc.image.trim() !== "") {
    return doc.image;
  }
  return null;
}

async function getItemMetaMaps(items) {
  const productIds = [];
  const comboIds = [];

  for (const item of items) {
    if (item.type === "product") productIds.push(item.itemId);
    if (item.type === "combo") comboIds.push(item.itemId);
  }

  const [products, combos] = await Promise.all([
    productIds.length
      ? Product.find({ _id: { $in: productIds } }).select("_id name images")
      : [],
    comboIds.length
      ? Combo.find({ _id: { $in: comboIds } }).select("_id name images")
      : [],
  ]);

  return {
    productNameMap: new Map(products.map((p) => [String(p._id), p.name])),
    comboNameMap: new Map(combos.map((c) => [String(c._id), c.name])),
    productImageMap: new Map(
      products.map((p) => [String(p._id), pickPrimaryImage(p)])
    ),
    comboImageMap: new Map(combos.map((c) => [String(c._id), pickPrimaryImage(c)])),
  };
}

async function formatCartResponse(cart) {
  if (!cart) return null;
  const sourceItems = cart.items || [];
  const { productNameMap, comboNameMap, productImageMap, comboImageMap } =
    await getItemMetaMaps(sourceItems);

  const items = (cart.items || []).map((item) => ({
    id: item._id,
    type: item.type,
    itemId: item.itemId,
    name:
      item.type === "product"
        ? productNameMap.get(String(item.itemId)) || null
        : comboNameMap.get(String(item.itemId)) || null,
    image:
      item.type === "product"
        ? productImageMap.get(String(item.itemId)) || null
        : comboImageMap.get(String(item.itemId)) || null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: lineTotal(item),
  }));
  const { totalPrice, totalQuantity, totalItems } = cartTotals(cart.items || []);
  return {
    id: cart._id,
    userId: cart.userId,
    items,
    totalPrice,
    totalQuantity,
    totalItems,
    updatedAt: cart.updatedAt,
  };
}

async function resolveItemById(itemId) {
  const [product, combo] = await Promise.all([
    Product.findById(itemId).select("price"),
    Combo.findById(itemId).select("price"),
  ]);

  if (product && combo) {
    const err = new Error("itemId is ambiguous (exists as both product and combo)");
    err.status = 400;
    throw err;
  }
  if (product) {
    return { type: "product", unitPrice: product.price };
  }
  if (combo) {
    return { type: "combo", unitPrice: combo.price };
  }
  const err = new Error("Item not found");
  err.status = 404;
  throw err;
}

// GET current cart
exports.getCart = async (req, res) => {
  try {
    const userId = req.user.id;
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = await Cart.create({ userId, items: [] });
    }
    return res.json(await formatCartResponse(cart));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// POST add item (merge same itemId; type resolved from DB)
exports.addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId, quantity = 1 } = req.body;

    if (!itemId) {
      return res.status(400).json({ message: "itemId is required" });
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      return res.status(400).json({ message: "quantity must be at least 1" });
    }

    let resolved;
    try {
      resolved = await resolveItemById(itemId);
    } catch (e) {
      return res.status(e.status || 400).json({ message: e.message });
    }
    const { type, unitPrice } = resolved;

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = await Cart.create({ userId, items: [] });
    }

    const idx = cart.items.findIndex((i) => String(i.itemId) === String(itemId));

    if (idx >= 0) {
      cart.items[idx].quantity += qty;
      cart.items[idx].unitPrice = unitPrice;
      cart.items[idx].type = type;
    } else {
      cart.items.push({
        type,
        itemId,
        quantity: qty,
        unitPrice,
      });
    }

    await cart.save();
    return res.status(201).json(await formatCartResponse(cart));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// DELETE remove item (optional quantity: omit = remove line; number = decrease)
exports.removeFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId, quantity } = req.body;

    if (!itemId) {
      return res.status(400).json({ message: "itemId is required" });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const idx = cart.items.findIndex((i) => String(i.itemId) === String(itemId));
    if (idx < 0) {
      return res.status(404).json({ message: "Item not in cart" });
    }

    if (quantity === undefined || quantity === null) {
      cart.items.splice(idx, 1);
    } else {
      const dec = Number(quantity);
      if (!Number.isFinite(dec) || dec < 1) {
        return res.status(400).json({ message: "quantity must be at least 1" });
      }
      if (cart.items[idx].quantity <= dec) {
        cart.items.splice(idx, 1);
      } else {
        cart.items[idx].quantity -= dec;
      }
    }

    await cart.save();
    return res.json(await formatCartResponse(cart));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// PATCH set item quantity (absolute value)
exports.updateCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        message:
          "JSON body required; set Content-Type: application/json and send itemId, quantity",
      });
    }
    const { itemId, quantity } = req.body;

    if (!itemId) {
      return res.status(400).json({ message: "itemId is required" });
    }

    const nextQuantity = Number(quantity);
    if (!Number.isFinite(nextQuantity)) {
      return res.status(400).json({ message: "quantity must be a number" });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const idx = cart.items.findIndex((i) => String(i.itemId) === String(itemId));
    if (idx < 0) {
      return res.status(404).json({ message: "Item not in cart" });
    }

    if (nextQuantity <= 0) {
      cart.items.splice(idx, 1);
    } else {
      cart.items[idx].quantity = nextQuantity;
    }

    await cart.save();
    return res.json(await formatCartResponse(cart));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
