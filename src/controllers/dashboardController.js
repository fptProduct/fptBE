const Order = require("../models/Order");
const Booking = require("../models/Booking");
const CartPayment = require("../models/CartPayment");
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

function inRange(dateValue, start, end) {
  const ts = new Date(dateValue || 0).getTime();
  return Number.isFinite(ts) && ts >= start.getTime() && ts < end.getTime();
}

function buildBuyerKey(item) {
  const email = String(item.userEmail || "").trim().toLowerCase();
  if (email) return `email:${email}`;
  if (item.userId) return `user:${String(item.userId)}`;
  return `name:${String(item.userName || "guest").trim().toLowerCase()}`;
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

  const [bookingRows, cartRows] = await Promise.all([
    Booking.aggregate([
      {
        $match: {
          paymentStatus: "PAID",
          updatedAt: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: { $month: "$updatedAt" },
          value: { $sum: "$totalPrice" },
        },
      },
    ]),
    CartPayment.aggregate([
      {
        $match: {
          paymentStatus: "PAID",
          paidAt: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: { $month: "$paidAt" },
          value: { $sum: "$paidAmount" },
        },
      },
    ]),
  ]);

  const byMonth = new Map();
  for (const row of bookingRows) {
    byMonth.set(row._id, (byMonth.get(row._id) || 0) + Number(row.value || 0));
  }
  for (const row of cartRows) {
    byMonth.set(row._id, (byMonth.get(row._id) || 0) + Number(row.value || 0));
  }

  return MONTH_LABELS.map((month, i) => ({
    month,
    value: byMonth.get(i + 1) || 0,
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
  const orderBuyers = await Order.aggregate([
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

  const [paidBookings, paidCartPayments] = await Promise.all([
    Booking.find({ paymentStatus: "PAID" })
      .select("userId customerName totalPrice")
      .populate({ path: "userId", select: "name email image" })
      .lean(),
    CartPayment.find({ paymentStatus: "PAID" })
      .select("userId paidAmount")
      .populate({ path: "userId", select: "name email image" })
      .lean(),
  ]);

  const merged = new Map();
  const upsertBuyer = ({ name, email, image, totalPaid, userId }) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const key =
      normalizedEmail ||
      (userId ? `user:${String(userId)}` : `guest:${String(name || "").trim().toLowerCase()}`);

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        name: name || "Guest",
        email: normalizedEmail,
        image: image || "",
        totalPaid: Number(totalPaid || 0),
      });
      return;
    }

    existing.totalPaid += Number(totalPaid || 0);
    if (!existing.image && image) existing.image = image;
    if (!existing.name && name) existing.name = name;
    if (!existing.email && normalizedEmail) existing.email = normalizedEmail;
  };

  for (const buyer of orderBuyers) {
    upsertBuyer({
      name: buyer.name,
      email: buyer.email,
      image: buyer.image,
      totalPaid: buyer.totalPaid,
      userId: null,
    });
  }

  for (const booking of paidBookings) {
    upsertBuyer({
      name: booking.userId?.name || booking.customerName || "Guest",
      email: booking.userId?.email || "",
      image: booking.userId?.image || "",
      totalPaid: booking.totalPrice || 0,
      userId: booking.userId?._id || booking.userId || null,
    });
  }

  for (const payment of paidCartPayments) {
    upsertBuyer({
      name: payment.userId?.name || "Guest",
      email: payment.userId?.email || "",
      image: payment.userId?.image || "",
      totalPaid: payment.paidAmount || 0,
      userId: payment.userId?._id || payment.userId || null,
    });
  }

  return Array.from(merged.values()).sort((a, b) => b.totalPaid - a.totalPaid);
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

    const [overviewMonths, overviewMonthsLastYear] = await Promise.all([
      monthlyRevenueForYear(year),
      monthlyRevenueForYear(year - 1),
    ]);
    const activeProducts = await getActiveProducts();
    const productRevenueByMonth = await getProductRevenueByMonth(year);
    const buyers = await getProductBuyers();

    const [paidBookings, paidCartPayments] = await Promise.all([
      Booking.find({ paymentStatus: "PAID" })
        .sort({ updatedAt: -1 })
        .select("userId customerName totalPrice paymentStatus status updatedAt createdAt")
        .populate({ path: "userId", select: "name image email" })
        .lean(),
      CartPayment.find({ paymentStatus: "PAID" })
        .sort({ paidAt: -1, updatedAt: -1 })
        .select("userId paidAmount paymentStatus paidAt updatedAt createdAt")
        .populate({ path: "userId", select: "name image email" })
        .lean(),
    ]);

    const bookingPaymentList = paidBookings.map((b) => ({
      bookingId: b._id,
      cartPaymentId: null,
      source: "booking",
      userId: b.userId?._id || b.userId || null,
      userName: b.userId?.name || b.customerName || "Guest",
      userImage: b.userId?.image || "",
      userEmail: b.userId?.email || "",
      paidAmount: Math.round(Number(b.totalPrice || 0)),
      paymentStatus: b.paymentStatus,
      bookingStatus: b.status,
      paidAt: b.updatedAt || b.createdAt,
    }));

    const cartPaymentList = paidCartPayments.map((p) => ({
      bookingId: null,
      cartPaymentId: p._id,
      source: "cart",
      userId: p.userId?._id || p.userId || null,
      userName: p.userId?.name || "Guest",
      userImage: p.userId?.image || "",
      userEmail: p.userId?.email || "",
      paidAmount: Math.round(Number(p.paidAmount || 0)),
      paymentStatus: p.paymentStatus,
      bookingStatus: null,
      paidAt: p.paidAt || p.updatedAt || p.createdAt,
    }));

    const paymentList = [...bookingPaymentList, ...cartPaymentList].sort(
      (a, b) => new Date(b.paidAt || 0) - new Date(a.paidAt || 0)
    );

    const paidThisMonthItems = paymentList.filter((item) =>
      inRange(item.paidAt, startThisMonth, startNextMonth)
    );
    const paidLastMonthItems = paymentList.filter((item) =>
      inRange(item.paidAt, startLastMonth, startThisMonth)
    );
    const revenueThisMonthFromPayments = paidThisMonthItems.reduce(
      (sum, item) => sum + Number(item.paidAmount || 0),
      0
    );
    const revenueLastMonthFromPayments = paidLastMonthItems.reduce(
      (sum, item) => sum + Number(item.paidAmount || 0),
      0
    );
    const buyersThisMonthFromPayments = new Set(
      paidThisMonthItems.map(buildBuyerKey)
    ).size;
    const buyersLastMonthFromPayments = new Set(
      paidLastMonthItems.map(buildBuyerKey)
    ).size;
    const salesThisMonthFromPayments = paidThisMonthItems.length;
    const salesLastMonthFromPayments = paidLastMonthItems.length;
    const revenueThisYear = overviewMonths.reduce(
      (sum, item) => sum + Number(item.value || 0),
      0
    );
    const revenueLastYear = overviewMonthsLastYear.reduce(
      (sum, item) => sum + Number(item.value || 0),
      0
    );

    return res.json({
      currency: "VND",
      summary: [
        {
          id: "totalRevenue",
          title: "Total Revenue",
          value: revenueThisYear,
          changePercent: pctChange(revenueThisYear, revenueLastYear),
          changeLabel: "from last year",
        },
        {
          id: "subscriptions",
          title: "Subscriptions",
          value: buyersThisMonthFromPayments,
          changePercent: pctChange(
            buyersThisMonthFromPayments,
            buyersLastMonthFromPayments
          ),
          changeLabel: "from last month",
        },
        {
          id: "sales",
          title: "Sales",
          value: salesThisMonthFromPayments,
          changePercent: pctChange(
            salesThisMonthFromPayments,
            salesLastMonthFromPayments
          ),
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
        subtitle: `${buyers.length} buyer(s) · top by total paid`,
        items: buyers.slice(0, 5),
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

exports.getDashboardFake = async (req, res) => {
  const overviewMonths = [
    { month: "Jan", value: 12500000 },
    { month: "Feb", value: 14900000 },
    { month: "Mar", value: 17200000 },
    { month: "Apr", value: 19800000 },
    { month: "May", value: 21500000 },
    { month: "Jun", value: 23100000 },
    { month: "Jul", value: 24900000 },
    { month: "Aug", value: 26700000 },
    { month: "Sep", value: 28600000 },
    { month: "Oct", value: 30400000 },
    { month: "Nov", value: 32900000 },
    { month: "Dec", value: 35800000 },
  ];

  return res.json({
    currency: "VND",
    summary: [
      {
        id: "totalRevenue",
        title: "Total Revenue",
        value: 308100000,
        changePercent: 32.4,
        changeLabel: "from last year",
      },
      {
        id: "subscriptions",
        title: "Subscriptions",
        value: 182,
        changePercent: 18.1,
        changeLabel: "from last month",
      },
      {
        id: "sales",
        title: "Sales",
        value: 247,
        changePercent: 21.7,
        changeLabel: "from last month",
      },
      {
        id: "activeNow",
        title: "Active Now",
        value: 14,
        changeAbsolute: 5,
        changeLabel: "since last hour",
      },
    ],
    overview: {
      title: "Overview",
      months: overviewMonths,
    },
    activeProducts: {
      total: 6,
      items: [
        {
          _id: "67f0a11a1111111111111111",
          name: "Wedding Combo Premium",
          price: 6200000,
          images: [],
          categoryFoodId: null,
          isActive: true,
        },
        {
          _id: "67f0a11a2222222222222222",
          name: "Buffet Family Set",
          price: 1890000,
          images: [],
          categoryFoodId: null,
          isActive: true,
        },
      ],
    },
    productRevenueByMonth: [
      {
        productId: "67f0a11a1111111111111111",
        productName: "Wedding Combo Premium",
        totalRevenue: 89200000,
        totalOrders: 61,
        months: MONTH_LABELS.map((month, index) => ({
          month,
          revenue: [6200000, 5200000, 7600000, 8400000, 7200000, 6800000, 7500000, 8000000, 7600000, 7800000, 8200000, 9000000][index],
          orderCount: [4, 3, 5, 6, 5, 4, 5, 6, 5, 6, 6, 6][index],
        })),
      },
      {
        productId: "67f0a11a2222222222222222",
        productName: "Buffet Family Set",
        totalRevenue: 53600000,
        totalOrders: 83,
        months: MONTH_LABELS.map((month, index) => ({
          month,
          revenue: [2600000, 3200000, 3900000, 4200000, 4500000, 4600000, 4700000, 4900000, 5100000, 5300000, 5600000, 6000000][index],
          orderCount: [5, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10][index],
        })),
      },
    ],
    buyers: {
      total: 5,
      items: [
        { name: "Liam Nguyen", email: "liam.nguyen@example.com", image: "", totalPaid: 25400000 },
        { name: "Emma Tran", email: "emma.tran@example.com", image: "", totalPaid: 21900000 },
        { name: "Noah Le", email: "noah.le@example.com", image: "", totalPaid: 18600000 },
        { name: "Sophia Pham", email: "sophia.pham@example.com", image: "", totalPaid: 17300000 },
        { name: "Lucas Vo", email: "lucas.vo@example.com", image: "", totalPaid: 14100000 },
      ],
    },
    recentSales: {
      title: "Recent Sales",
      salesThisMonth: 247,
      subtitle: "5 buyer(s) · top by total paid",
      items: [
        { name: "Liam Nguyen", email: "liam.nguyen@example.com", image: "", totalPaid: 25400000 },
        { name: "Emma Tran", email: "emma.tran@example.com", image: "", totalPaid: 21900000 },
        { name: "Noah Le", email: "noah.le@example.com", image: "", totalPaid: 18600000 },
      ],
    },
    payments: {
      total: 6,
      items: [
        {
          bookingId: "67f0b22b1111111111111111",
          cartPaymentId: null,
          source: "booking",
          userId: "67f0c33c1111111111111111",
          userName: "Liam Nguyen",
          userImage: "",
          userEmail: "liam.nguyen@example.com",
          paidAmount: 6200000,
          paymentStatus: "PAID",
          bookingStatus: "CONFIRMED",
          paidAt: new Date().toISOString(),
        },
        {
          bookingId: null,
          cartPaymentId: "67f0b22b2222222222222222",
          source: "cart",
          userId: "67f0c33c2222222222222222",
          userName: "Emma Tran",
          userImage: "",
          userEmail: "emma.tran@example.com",
          paidAmount: 1890000,
          paymentStatus: "PAID",
          bookingStatus: null,
          paidAt: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
    },
  });
};
