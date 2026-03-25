const Booking = require("../models/Booking");
const Product = require("../models/Product");
const Combo = require("../models/Combo");

function isValidDateOnly(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime());
}

function isValidTime(value) {
  if (typeof value !== "string") return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

exports.createBooking = async (req, res) => {
  try {
    const {
      bookingDate,
      bookingTime,
      itemIds,
      location,
      customerName,
      tableQuantity,
    } = req.body || {};

    if (!isValidDateOnly(bookingDate)) {
      return res.status(400).json({ message: "bookingDate must be in YYYY-MM-DD format" });
    }
    if (!isValidTime(bookingTime)) {
      return res.status(400).json({ message: "bookingTime must be in HH:mm format" });
    }
    if (!location || typeof location !== "string") {
      return res.status(400).json({ message: "location is required" });
    }
    if (!customerName || typeof customerName !== "string") {
      return res.status(400).json({ message: "customerName is required" });
    }
    if (!Number.isInteger(Number(tableQuantity)) || Number(tableQuantity) <= 0) {
      return res.status(400).json({ message: "tableQuantity must be a positive integer" });
    }

    let bookingItems = [];
    let bookingType;
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: "itemIds is required and must be a non-empty array" });
    }

    const uniqueItemIds = [...new Set(itemIds.map(String))];
    const [combos, products] = await Promise.all([
      Combo.find({ _id: { $in: uniqueItemIds } }).select("name type price"),
      Product.find({ _id: { $in: uniqueItemIds }, isActive: true }).select("name type price"),
    ]);

    const comboItems = combos
      .filter((c) => c.type === "combo")
      .map((c) => ({ itemId: c._id, name: c.name, type: c.type }));
    const productItems = products
      .filter((p) => p.type === "product")
      .map((p) => ({ itemId: p._id, name: p.name, type: p.type }));

    const resolvedItems = [...comboItems, ...productItems];
    if (resolvedItems.length !== uniqueItemIds.length) {
      return res.status(400).json({ message: "One or more itemIds are invalid" });
    }

    const resolvedTypes = [...new Set(resolvedItems.map((item) => item.type))];
    bookingType = resolvedTypes.length === 1 ? resolvedTypes[0] : "mixed";
    bookingItems = resolvedItems;

    const priceById = new Map();
    combos.forEach((c) => priceById.set(String(c._id), Number(c.price || 0)));
    products.forEach((p) => priceById.set(String(p._id), Number(p.price || 0)));

    const rawTotalPrice = uniqueItemIds.reduce((sum, id) => {
      const val = priceById.get(String(id));
      return sum + (Number.isFinite(Number(val)) ? Number(val) : 0);
    }, 0);

    const comboCount = bookingItems.filter((i) => i.type === "combo").length;
    const productCount = bookingItems.filter((i) => i.type === "product").length;

    const eligibleComboDiscount = comboCount > 2; // 3+ combos
    const eligibleProductDiscount = productCount >= 5; // 5+ products
    const discountMultiplier =
      eligibleComboDiscount || eligibleProductDiscount ? 0.95 : 1;

    const totalPrice = Math.round(rawTotalPrice * discountMultiplier);

    const booking = await Booking.create({
      bookingDate: new Date(`${bookingDate}T00:00:00.000Z`),
      bookingTime: bookingTime.trim(),
      bookingType,
      bookingItems,
      location: location.trim(),
      customerName: customerName.trim(),
      tableQuantity: Number(tableQuantity),
      status: "PENDING",
      totalPrice,
    });

    return res.status(201).json({
      id: booking._id,
      bookingDate: booking.bookingDate,
      bookingTime: booking.bookingTime,
      bookingType: booking.bookingType,
      bookingItems: booking.bookingItems,
      location: booking.location,
      customerName: booking.customerName,
      tableQuantity: booking.tableQuantity,
      totalPrice: booking.totalPrice,
      paymentStatus: booking.paymentStatus,
      status: booking.status,
      createdAt: booking.createdAt,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to create booking" });
  }
};

exports.getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });
    return res.json({
      total: bookings.length,
      data: bookings.map((b) => ({
        id: b._id,
        bookingDate: b.bookingDate,
        bookingTime: b.bookingTime,
        bookingType: b.bookingType,
        bookingItems: b.bookingItems,
        location: b.location,
        customerName: b.customerName,
        tableQuantity: b.tableQuantity,
        totalPrice: b.totalPrice,
        paymentStatus: b.paymentStatus,
        status: b.status,
        createdAt: b.createdAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to fetch bookings" });
  }
};

exports.confirmBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body || {};

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    booking.status = "CONFIRMED";

    if (paymentStatus !== undefined) {
      if (!["UNPAID", "PAID"].includes(paymentStatus)) {
        return res.status(400).json({
          message: "paymentStatus must be UNPAID or PAID",
        });
      }
      booking.paymentStatus = paymentStatus;
    }

    await booking.save();

    return res.json({
      id: booking._id,
      bookingDate: booking.bookingDate,
      bookingTime: booking.bookingTime,
      bookingType: booking.bookingType,
      bookingItems: booking.bookingItems,
      location: booking.location,
      customerName: booking.customerName,
      tableQuantity: booking.tableQuantity,
      totalPrice: booking.totalPrice,
      paymentStatus: booking.paymentStatus,
      status: booking.status,
      createdAt: booking.createdAt,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to confirm booking",
    });
  }
};
