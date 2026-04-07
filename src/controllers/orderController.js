const Product = require("../models/Product");
const Order = require("../models/Order");
const sendOrderNotification = require("../utils/orderNotifier");

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

async function buildQuote({ ceremonyType, packageId }) {
  const product = await Product.findById(packageId)
    .select("name price categoryFoodId isActive")
    .populate({ path: "categoryFoodId", select: "slug" });
  if (!product) {
    return { ok: false, status: 404, message: "Package not found" };
  }

  if (!product.isActive) {
    return { ok: false, status: 400, message: "Package is not active" };
  }

  // Order vẫn yêu cầu packageType, nên lấy từ CATEGORY-FOOD slug của product
  const packageType = product.categoryFoodId?.slug;
  if (!packageType) {
    return { ok: false, status: 400, message: "Category-food is missing for this package" };
  }

  const packagePrice = product.price;
  const deliveryFee = 0;
  const totalPrice = packagePrice + deliveryFee;

  return {
    ok: true,
    data: {
      currency: "VND",
      breakdown: {
        packagePrice,
        deliveryFee,
        totalPrice,
      },
      package: {
        productId: product._id,
        productName: product.name,
        packageType,
        price: product.price,
      },
    },
  };
}

function getStatusLabel(status) {
  if (status === "PENDING") return "đợi duyệt";
  if (status === "CONFIRMED") return "đã duyệt";
  if (status === "REJECTED" || status === "CANCELLED") return "từ chối";
  return "unknown";
}

exports.quoteOrder = async (req, res) => {
  try {
    const {
      ceremonyType,
      packageId,
      deliveryDate,
      deliveryTime,
      deliveryAddress,
      specialRequests,
    } = req.body;

    if (!ceremonyType || !packageId) {
      return res.status(400).json({ message: "ceremonyType and packageId are required" });
    }
    if (!isValidDateOnly(deliveryDate)) {
      return res.status(400).json({ message: "deliveryDate must be in YYYY-MM-DD format" });
    }
    if (!isValidTime(deliveryTime)) {
      return res.status(400).json({ message: "deliveryTime must be in HH:mm format" });
    }
    if (!deliveryAddress || typeof deliveryAddress !== "string") {
      return res.status(400).json({ message: "deliveryAddress is required" });
    }

    const quote = await buildQuote({ ceremonyType, packageId });
    if (!quote.ok) return res.status(quote.status).json({ message: quote.message });

    return res.json({
      ...quote.data,
      orderSummary: {
        ceremonyType,
        delivery: {
          deliveryDate,
          deliveryTime,
          deliveryAddress,
        },
        specialRequests: specialRequests || "",
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.confirmOrder = async (req, res) => {
  try {
    const {
      ceremonyType,
      packageId,
      deliveryDate,
      deliveryTime,
      deliveryAddress,
      specialRequests,
      customerName,
      customerPhone,
      customerEmail,
    } = req.body;

    if (!ceremonyType || !packageId) {
      return res.status(400).json({ message: "ceremonyType and packageId are required" });
    }
    if (!isValidDateOnly(deliveryDate)) {
      return res.status(400).json({ message: "deliveryDate must be in YYYY-MM-DD format" });
    }
    if (!isValidTime(deliveryTime)) {
      return res.status(400).json({ message: "deliveryTime must be in HH:mm format" });
    }
    if (!deliveryAddress || typeof deliveryAddress !== "string") {
      return res.status(400).json({ message: "deliveryAddress is required" });
    }

    const quote = await buildQuote({ ceremonyType, packageId });
    if (!quote.ok) return res.status(quote.status).json({ message: quote.message });

    const order = await Order.create({
      ceremonyType,
      package: {
        productId: quote.data.package.productId,
        productName: quote.data.package.productName,
        packageType: quote.data.package.packageType,
        price: quote.data.package.price,
      },
      delivery: {
        deliveryDate,
        deliveryTime,
        deliveryAddress,
      },
      specialRequests: specialRequests || "",
      customer: {
        userId: req.user?.id,
        name: customerName || "",
        phone: customerPhone || "",
        email: customerEmail || "",
      },
      totalPrice: quote.data.breakdown.totalPrice,
      status: "CONFIRMED",
      confirmedAt: new Date(),
    });

    await sendOrderNotification(order);

    return res.status(201).json({
      id: order._id,
      status: order.status,
      totalPrice: order.totalPrice,
      delivery: order.delivery,
      package: order.package,
      createdAt: order.createdAt,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const statusLabel = getStatusLabel(order.status);

    return res.json({
      id: order._id,
      status: order.status,
      statusLabel,
      ceremonyType: order.ceremonyType,
      package: order.package,
      delivery: order.delivery,
      specialRequests: order.specialRequests,
      customer: order.customer,
      totalPrice: order.totalPrice,
      confirmedAt: order.confirmedAt,
      createdAt: order.createdAt,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

