const mongoose = require("mongoose");

const bookingItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["combo", "product"],
      required: true,
    },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingDate: { type: Date, required: true },
    bookingTime: { type: String, required: true, trim: true },
    bookingType: {
      type: String,
      enum: ["combo", "product", "mixed"],
      required: true,
      index: true,
    },
    bookingItems: {
      type: [bookingItemSchema],
      default: [],
    },
    location: { type: String, required: true, trim: true },
    customerName: { type: String, required: true, trim: true },
    tableQuantity: { type: Number, required: true, min: 1 },
    totalPrice: { type: Number, default: 0, min: 0 },
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PAID"],
      default: "UNPAID",
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    payosOrderCode: { type: Number, index: true, default: null },
    payosPaymentLinkId: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);
