const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    ceremonyType: { type: String, required: true, trim: true, index: true },
    package: {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      productName: { type: String, required: true, trim: true },
      packageType: { type: String, required: true, trim: true },
      price: { type: Number, required: true, min: 0 },
    },
    delivery: {
      deliveryDate: { type: String, required: true, trim: true },
      deliveryTime: { type: String, required: true, trim: true },
      deliveryAddress: { type: String, required: true, trim: true },
    },
    specialRequests: { type: String, trim: true },
    customer: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
    },
    totalPrice: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "REJECTED", "CANCELLED"],
      default: "CONFIRMED",
      index: true,
    },
    confirmedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);

