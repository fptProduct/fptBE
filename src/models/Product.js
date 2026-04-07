const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["product"],
      default: "product",
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    descriptionItems: {
      type: String,
      trim: true,
    },
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
    // Store only the id of CATEGORY-FOOD
    categoryFoodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
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

productSchema.set("toJSON", {
  transform(_doc, ret) {
    if (ret.type == null) ret.type = "product";
    return ret;
  },
});

module.exports = mongoose.model("Product", productSchema);

