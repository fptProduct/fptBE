const Category = require("../models/Category");
const { slugifyFromLabel } = require("./slugify");

async function seedDefaultCategories() {
  const existing = await Category.estimatedDocumentCount();
  if (existing > 0) return;

  const rows = [
    { type: "CEREMONY", label: "Cúng khai trương", isActive: true },
    { type: "CEREMONY", label: "Cúng giỗ", isActive: true },
    { type: "CEREMONY", label: "Cúng nhập trạch", isActive: true },
    { type: "CEREMONY", label: "Cúng tất niên", isActive: true },
    { type: "PACKAGE", label: "Standard", isActive: true },
    { type: "PACKAGE", label: "Premium", isActive: true },
    { type: "PACKAGE", label: "Custom tray", isActive: true },
  ].map((r) => {
    const slug = slugifyFromLabel(r.label);
    return { ...r, slug, value: slug };
  });

  await Category.insertMany(rows);
}

module.exports = seedDefaultCategories;

