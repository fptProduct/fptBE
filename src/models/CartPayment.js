const mongoose = require("mongoose");

const cartPaymentItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["product", "combo"],
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
  { _id: false }
);

const cartPaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orderCode: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    paymentLinkId: {
      type: String,
      default: "",
      index: true,
    },
    cartTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    paidAmount: {
      type: Number,
      required: true,
      min: 1,
    },
    items: {
      type: [cartPaymentItemSchema],
      default: [],
    },
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PAID", "FAILED"],
      default: "UNPAID",
      index: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CartPayment", cartPaymentSchema);
