const Cart = require("../models/Cart");
const Combo = require("../models/Combo");
const Product = require("../models/Product");

function lineTotal(item) {
  return item.quantity * item.unitPrice;
}

function cartTotals(items) {
  const totalPrice = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  return { totalPrice, totalQuantity };
}

function formatCartResponse(cart) {
  if (!cart) return null;
  const items = (cart.items || []).map((item) => ({
    id: item._id,
    type: item.type,
    itemId: item.itemId,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: lineTotal(item),
  }));
  const { totalPrice, totalQuantity } = cartTotals(cart.items || []);
  return {
    id: cart._id,
    userId: cart.userId,
    items,
    totalPrice,
    totalQuantity,
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
    return res.json(formatCartResponse(cart));
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
    return res.status(201).json(formatCartResponse(cart));
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
    return res.json(formatCartResponse(cart));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
