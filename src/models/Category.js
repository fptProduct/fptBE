const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    // CEREMONY or PACKAGE
    type: {
      type: String,
      enum: ["CEREMONY", "PACKAGE"],
      required: true,
      index: true,
    },
    // value machine-readable for FE/BE (must be 1 word uppercase style)
    value: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

categorySchema.index({ type: 1, value: 1 }, { unique: true });

module.exports = mongoose.model("Category", categorySchema);

