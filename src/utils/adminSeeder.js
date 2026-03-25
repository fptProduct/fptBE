const bcrypt = require("bcrypt");
const User = require("../models/User");

async function seedAdminUser() {
  const email = process.env.ADMIN_EMAIL || "admin@gmail.com";
  const password = process.env.ADMIN_PASSWORD || "admin1234";
  const name = process.env.ADMIN_NAME || "Admin";
  const phone = process.env.ADMIN_PHONE || "0000000000";

  if (!email || !password) {
    console.log("Admin seeding skipped: missing ADMIN_EMAIL/ADMIN_PASSWORD");
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const existing = await User.findOne({ email });

  if (existing) {
    await User.findByIdAndUpdate(existing._id, {
      name,
      phone,
      password: hashedPassword,
      role: "admin",
      image: existing.image || "",
    });
    console.log("Admin user updated password:", { email, password });
    return;
  }

  await User.create({
    name,
    email,
    phone,
    password: hashedPassword,
    role: "admin",
    image: "",
  });

  console.log("Admin user seeded:", { email, password });
}

module.exports = seedAdminUser;

