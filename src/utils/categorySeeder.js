const Category = require("../models/Category");

async function seedDefaultCategories() {
  const existing = await Category.estimatedDocumentCount();
  if (existing > 0) return;

  await Category.insertMany([
    // CEREMONY
    { type: "CEREMONY", value: "OPENINGCEREMONY", label: "Cúng khai trương", isActive: true },
    { type: "CEREMONY", value: "DEATHANNIVERSARY", label: "Cúng giỗ", isActive: true },
    { type: "CEREMONY", value: "HOUSEWARMING", label: "Cúng nhập trạch", isActive: true },
    { type: "CEREMONY", value: "YEAREND", label: "Cúng tất niên", isActive: true },

    // PACKAGE
    { type: "PACKAGE", value: "STANDARD", label: "Standard", isActive: true },
    { type: "PACKAGE", value: "PREMIUM", label: "Premium", isActive: true },
    { type: "PACKAGE", value: "CUSTOM", label: "Custom tray", isActive: true },
  ]);
}

module.exports = seedDefaultCategories;

