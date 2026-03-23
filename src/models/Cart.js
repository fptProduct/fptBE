const mongoose = require("mongoose");

const CART_ITEM_TYPES = ["combo", "product"];

const cartItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: CART_ITEM_TYPES,
      required: true,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cart", cartSchema);
module.exports.CART_ITEM_TYPES = CART_ITEM_TYPES;
