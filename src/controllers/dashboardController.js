const Order = require("../models/Order");
const Booking = require("../models/Booking");
const Product = require("../models/Product");

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfUtcMonth(year, monthIndex0) {
  return new Date(Date.UTC(year, monthIndex0, 1, 0, 0, 0, 0));
}

function utcNowParts() {
  const now = new Date();
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth(),
    now,
  };
}

function pctChange(current, previous) {
  if (previous == null || previous === 0) {
    if (current > 0) return 100;
    return 0;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function initialsFromName(name) {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

async function sumRevenueInRange(start, end) {
  const [row] = await Order.aggregate([
    {
      $match: {
        status: "CONFIRMED",
        createdAt: { $gte: start, $lt: end },
      },
    },
    { $group: { _id: null, total: { $sum: "$totalPrice" } } },
  ]);
  return row?.total || 0;
}

async function countOrdersInRange(start, end) {
  return Order.countDocuments({
    status: { $nin: ["CANCELLED", "REJECTED"] },
    createdAt: { $gte: start, $lt: end },
  });
}

async function countDistinctBuyersInRange(start, end) {
  const rows = await Order.aggregate([
    {
      $match: {
        status: { $nin: ["CANCELLED", "REJECTED"] },
        createdAt: { $gte: start, $lt: end },
        "customer.email": { $exists: true, $ne: "" },
      },
    },
    { $group: { _id: { $toLower: "$customer.email" } } },
    { $count: "n" },
  ]);
  return rows[0]?.n || 0;
}

async function countOrdersSince(since) {
  return Order.countDocuments({
    status: { $nin: ["CANCELLED", "REJECTED"] },
    createdAt: { $gte: since },
  });
}

async function monthlyRevenueForYear(year) {
  const start = startOfUtcMonth(year, 0);
  const end = startOfUtcMonth(year + 1, 0);
  const rows = await Order.aggregate([
    {
      $match: {
        status: "CONFIRMED",
        createdAt: { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: { $month: "$createdAt" },
        value: { $sum: "$totalPrice" },
      },
    },
  ]);
  const byMonth = new Map(rows.map((r) => [r._id, r.value]));
  return MONTH_LABELS.map((month, i) => ({
    month,
    value: byMonth.get(i + 1) || 0,
  }));
}

async function monthlyTotalRevenue(year) {
  const start = startOfUtcMonth(year, 0);
  const end = startOfUtcMonth(year + 1, 0);
  const rows = await Order.aggregate([
    {
      $match: {
        status: "CONFIRMED",
        createdAt: { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: { $month: "$createdAt" },
        revenue: { $sum: "$totalPrice" },
      },
    },
  ]);
  const byMonth = new Map(rows.map((r) => [r._id, r.revenue]));
  return MONTH_LABELS.map((month, i) => ({
    month,
    revenue: byMonth.get(i + 1) || 0,
  }));
}

async function getActiveProducts() {
  return Product.find({ isActive: true })
    .sort({ createdAt: -1 })
    .select("_id name price images categoryFoodId isActive")
    .lean();
}

async function getProductRevenueByMonth(year) {
  const start = startOfUtcMonth(year, 0);
  const end = startOfUtcMonth(year + 1, 0);
  const rows = await Order.aggregate([
    {
      $match: {
        status: "CONFIRMED",
        createdAt: { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: {
          productId: "$package.productId",
          productName: "$package.productName",
          month: { $month: "$createdAt" },
        },
        revenue: { $sum: "$totalPrice" },
        orderCount: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: {
          productId: "$_id.productId",
          productName: "$_id.productName",
        },
        months: {
          $push: {
            monthIndex: "$_id.month",
            revenue: "$revenue",
            orderCount: "$orderCount",
          },
        },
        totalRevenue: { $sum: "$revenue" },
        totalOrders: { $sum: "$orderCount" },
      },
    },
    { $sort: { totalRevenue: -1 } },
  ]);

  return rows.map((row) => {
    const monthMap = new Map(row.months.map((m) => [m.monthIndex, m]));
    return {
      productId: row._id.productId,
      productName: row._id.productName || "Unknown product",
      totalRevenue: row.totalRevenue || 0,
      totalOrders: row.totalOrders || 0,
      months: MONTH_LABELS.map((month, i) => {
        const item = monthMap.get(i + 1);
        return {
          month,
          revenue: item?.revenue || 0,
          orderCount: item?.orderCount || 0,
        };
      }),
    };
  });
}

async function getProductBuyers() {
  return Order.aggregate([
    {
      $match: {
        status: "CONFIRMED",
        "customer.email": { $exists: true, $ne: "" },
      },
    },
    {
      $group: {
        _id: { $toLower: "$customer.email" },
        name: { $first: "$customer.name" },
        email: { $first: "$customer.email" },
        userId: { $first: "$customer.userId" },
        totalPaid: { $sum: "$totalPrice" },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $addFields: {
        image: {
          $ifNull: [{ $arrayElemAt: ["$user.image", 0] }, ""],
        },
      },
    },
    {
      $project: {
        _id: 0,
        name: 1,
        email: 1,
        image: 1,
        totalPaid: 1,
      },
    },
    { $sort: { totalPaid: -1 } },
  ]);
}

exports.getDashboard = async (req, res) => {
  try {
    const { year, month } = utcNowParts();
    const startThisMonth = startOfUtcMonth(year, month);
    const startNextMonth = startOfUtcMonth(year, month + 1);
    const startLastMonth = startOfUtcMonth(year, month - 1);

    const revenueThisMonth = await sumRevenueInRange(startThisMonth, startNextMonth);
    const revenueLastMonth = await sumRevenueInRange(startLastMonth, startThisMonth);

    const salesThisMonth = await countOrdersInRange(startThisMonth, startNextMonth);
    const salesLastMonth = await countOrdersInRange(startLastMonth, startThisMonth);

    const buyersThisMonth = await countDistinctBuyersInRange(startThisMonth, startNextMonth);
    const buyersLastMonth = await countDistinctBuyersInRange(startLastMonth, startThisMonth);

    const hourMs = 60 * 60 * 1000;
    const now = new Date();
    const activeSince = new Date(now.getTime() - hourMs);
    const activePrevStart = new Date(now.getTime() - 2 * hourMs);
    const activeNow = await countOrdersSince(activeSince);
    const activePrevHour = await Order.countDocuments({
      status: { $nin: ["CANCELLED", "REJECTED"] },
      createdAt: { $gte: activePrevStart, $lt: activeSince },
    });
    const activeDelta = activeNow - activePrevHour;

    const overviewMonths = await monthlyRevenueForYear(year);
    const revenueByMonth = await monthlyTotalRevenue(year);
    const activeProducts = await getActiveProducts();
    const productRevenueByMonth = await getProductRevenueByMonth(year);
    const buyers = await getProductBuyers();

    const recentOrders = await Order.find({
      status: { $nin: ["CANCELLED", "REJECTED"] },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("customer totalPrice createdAt")
      .lean();

    const recentSales = recentOrders.map((o) => {
      const name = o.customer?.name || "Guest";
      const email = o.customer?.email || "";
      return {
        initials: initialsFromName(name),
        name,
        email,
        amount: o.totalPrice,
      };
    });

    const paidBookings = await Booking.find({ paymentStatus: "PAID" })
      .sort({ updatedAt: -1 })
      .select("userId customerName totalPrice paymentStatus status updatedAt createdAt")
      .populate({ path: "userId", select: "name image email" })
      .lean();

    const paymentList = paidBookings.map((b) => ({
      bookingId: b._id,
      userId: b.userId?._id || b.userId || null,
      userName: b.userId?.name || b.customerName || "Guest",
      userImage: b.userId?.image || "",
      userEmail: b.userId?.email || "",
      paidAmount: Math.round(Number(b.totalPrice || 0)),
      paymentStatus: b.paymentStatus,
      bookingStatus: b.status,
      paidAt: b.updatedAt || b.createdAt,
    }));

    return res.json({
      currency: "VND",
      summary: [
        {
          id: "totalRevenue",
          title: "Total Revenue",
          value: revenueThisMonth,
          changePercent: pctChange(revenueThisMonth, revenueLastMonth),
          changeLabel: "from last month",
        },
        {
          id: "subscriptions",
          title: "Subscriptions",
          value: buyersThisMonth,
          changePercent: pctChange(buyersThisMonth, buyersLastMonth),
          changeLabel: "from last month",
        },
        {
          id: "sales",
          title: "Sales",
          value: salesThisMonth,
          changePercent: pctChange(salesThisMonth, salesLastMonth),
          changeLabel: "from last month",
        },
        {
          id: "activeNow",
          title: "Active Now",
          value: activeNow,
          changeAbsolute: activeDelta,
          changeLabel: "since last hour",
        },
      ],
      overview: {
        title: "Overview",
        months: overviewMonths,
      },
      revenueByMonth,
      activeProducts: {
        total: activeProducts.length,
        items: activeProducts,
      },
      productRevenueByMonth,
      buyers: {
        total: buyers.length,
        items: buyers,
      },
      recentSales: {
        title: "Recent Sales",
        salesThisMonth,
        subtitle: `You made ${salesThisMonth} sales this month.`,
        items: recentSales,
      },
      payments: {
        total: paymentList.length,
        items: paymentList,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to load dashboard" });
  }
};
