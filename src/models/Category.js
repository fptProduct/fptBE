const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["CEREMONY", "PACKAGE", "CATEGORY-FOOD"],
      required: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
    },
    // Legacy field kept for backward compatibility with an existing unique index
    // (some environments still have unique index on { type, value } in Mongo).
    value: {
      type: String,
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

categorySchema.index({ type: 1, slug: 1 }, { unique: true });
categorySchema.index({ type: 1, value: 1 }, { unique: true });

module.exports = mongoose.model("Category", categorySchema);
