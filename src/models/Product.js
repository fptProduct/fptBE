const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    descriptionItems: [
      {
        type: String,
        trim: true,
      },
    ],
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    images: [
      {
        type: String,
        trim: true,
      },
    ],
    ceremonyTypes: [
      {
        type: String,
        enum: [
          "OPENINGCEREMONY",   // Cúng khai trương
          "DEATHANNIVERSARY",  // Cúng giỗ
          "HOUSEWARMING",      // Cúng nhập trạch
          "YEAREND",           // Cúng tất niên
        ],
      },
    ],
    packageType: {
      type: String,
      enum: ["STANDARD", "PREMIUM", "CUSTOM"],
      required: true,
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

module.exports = mongoose.model("Product", productSchema);

