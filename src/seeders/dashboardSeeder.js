require("dotenv").config();
const mongoose = require("mongoose");

const Category = require("../models/Category");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Booking = require("../models/Booking");
const CartPayment = require("../models/CartPayment");
const { slugifyFromLabel } = require("../utils/slugify");

const SEED_TAG = "dashboard-seed";

function monthDate(year, monthIndex, day = 15, hour = 10) {
  return new Date(Date.UTC(year, monthIndex, day, hour, 0, 0, 0));
}

async function ensureFoodCategory() {
  const label = "Dashboard Seed Food";
  const slug = slugifyFromLabel(label);

  let category = await Category.findOne({ type: "CATEGORY-FOOD", slug });
  if (!category) {
    category = await Category.create({
      type: "CATEGORY-FOOD",
      label,
      slug,
      value: slug,
      isActive: true,
    });
  }

  return category;
}

async function clearOldSeedData() {
  const seededUsers = await User.find({
    email: { $regex: `@${SEED_TAG}\\.local$`, $options: "i" },
  }).select("_id");
  const userIds = seededUsers.map((u) => u._id);

  await Promise.all([
    Order.deleteMany({ "customer.email": { $regex: `@${SEED_TAG}\\.local$`, $options: "i" } }),
    Booking.deleteMany({ userId: { $in: userIds } }),
    CartPayment.deleteMany({ userId: { $in: userIds } }),
    Product.deleteMany({ name: { $regex: `^${SEED_TAG}:`, $options: "i" } }),
    User.deleteMany({ _id: { $in: userIds } }),
  ]);
}

async function seedUsers() {
  const rows = [
    { name: "Liam Nguyen", email: `liam@${SEED_TAG}.local`, phone: "0900000001" },
    { name: "Emma Tran", email: `emma@${SEED_TAG}.local`, phone: "0900000002" },
    { name: "Noah Le", email: `noah@${SEED_TAG}.local`, phone: "0900000003" },
    { name: "Sophia Pham", email: `sophia@${SEED_TAG}.local`, phone: "0900000004" },
    { name: "Lucas Vo", email: `lucas@${SEED_TAG}.local`, phone: "0900000005" },
  ];

  const users = await User.insertMany(
    rows.map((u, index) => ({
      ...u,
      password: "12345678",
      image: "",
      role: index === 0 ? "admin" : "user",
    }))
  );

  return users;
}

async function seedProducts(categoryFoodId) {
  const rows = [
    { name: `${SEED_TAG}: Premium Wedding Tray`, price: 1200 },
    { name: `${SEED_TAG}: Family Buffet Set`, price: 1500 },
    { name: `${SEED_TAG}: Vegetarian Ceremony Set`, price: 1800 },
    { name: `${SEED_TAG}: VIP Temple Combo`, price: 2000 },
  ];

  return Product.insertMany(
    rows.map((p) => ({
      ...p,
      description: "Seeded for dashboard visualization",
      descriptionItems: "Demo package",
      images: [],
      categoryFoodId,
      isActive: true,
    }))
  );
}

async function seedOrders(users, products) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const rows = [];

  for (let month = 0; month < 4; month++) {
    const baseCount = 2 + (month % 3);
    for (let i = 0; i < baseCount; i++) {
      const user = users[(month + i) % users.length];
      const product = products[(month + i) % products.length];
      const createdAt = monthDate(year, month, 8 + i, 9 + i);
      const totalPrice = Number(product.price) + (i + 1) * 200;

      rows.push({
        ceremonyType: "Cung khai truong",
        package: {
          productId: product._id,
          productName: product.name,
          packageType: "Standard",
          price: product.price,
        },
        delivery: {
          deliveryDate: createdAt.toISOString().slice(0, 10),
          deliveryTime: "09:00",
          deliveryAddress: "Seed address",
        },
        customer: {
          userId: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
        },
        totalPrice,
        status: "CONFIRMED",
        confirmedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      });
    }
  }

  await Order.insertMany(rows);
}

async function seedBookings(users, products) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const rows = [];

  for (let month = 0; month < 4; month++) {
    const user = users[month % users.length];
    const product = products[month % products.length];
    const createdAt = monthDate(year, month, 12, 11);
    const updatedAt = monthDate(year, month, 12, 12);

    rows.push({
      userId: user._id,
      bookingDate: createdAt,
      bookingTime: "11:00",
      bookingType: "product",
      bookingItems: [
        {
          itemId: product._id,
          name: product.name,
          type: "product",
        },
      ],
      location: "Seed location",
      customerName: user.name,
      tableQuantity: 3,
      totalPrice: Number(product.price) + 300,
      paymentStatus: "PAID",
      status: "CONFIRMED",
      payosOrderCode: 700000 + month,
      payosPaymentLinkId: `seed-booking-${month}`,
      createdAt,
      updatedAt,
    });
  }

  await Booking.insertMany(rows);
}

async function seedCartPayments(users, products) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const rows = [];

  for (let month = 0; month < 4; month++) {
    const user = users[(month + 1) % users.length];
    const product = products[(month + 2) % products.length];
    const createdAt = monthDate(year, month, 20, 15);
    const paidAt = monthDate(year, month, 20, 16);
    const paidAmount = Math.round(Number(product.price) * 0.5);

    rows.push({
      userId: user._id,
      orderCode: 900000 + month,
      paymentLinkId: `seed-cart-${month}`,
      cartTotal: Number(product.price),
      paidAmount,
      items: [
        {
          type: "product",
          itemId: product._id,
          quantity: 1,
          unitPrice: Number(product.price),
        },
      ],
      paymentStatus: "PAID",
      paidAt,
      createdAt,
      updatedAt: paidAt,
    });
  }

  await CartPayment.insertMany(rows);
}

async function run() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing in environment");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected MongoDB");

    await clearOldSeedData();
    const category = await ensureFoodCategory();
    const users = await seedUsers();
    const products = await seedProducts(category._id);
    await seedOrders(users, products);
    await seedBookings(users, products);
    await seedCartPayments(users, products);

    console.log("Dashboard seed completed successfully");
  } catch (error) {
    console.error("Dashboard seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

run();
