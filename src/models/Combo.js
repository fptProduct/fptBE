const mongoose = require("mongoose");

const comboProductSchema = new mongoose.Schema(
  {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const comboSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["combo"],
      default: "combo",
    },
    images: [
      {
        type: String,
        trim: true,
      },
    ],
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    product: {
      type: [comboProductSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

comboSchema.set("toJSON", {
  transform(_doc, ret) {
    if (ret.type == null) ret.type = "combo";
    return ret;
  },
});

module.exports = mongoose.model("Combo", comboSchema);
