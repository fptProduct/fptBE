/**
 * @param {string} label
 * @returns {string}
 */
function slugifyFromLabel(label) {
  if (!label || typeof label !== "string") return "";
  const withoutMarks = label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d");
  return withoutMarks
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

module.exports = { slugifyFromLabel };
