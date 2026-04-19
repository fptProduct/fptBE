const crypto = require("crypto");
const axios = require("axios");
const Cart = require("../models/Cart");
const Booking = require("../models/Booking");
const CartPayment = require("../models/CartPayment");
const Product = require("../models/Product");
const Combo = require("../models/Combo");
const User = require("../models/User");

const PayOSModule = require("@payos/node");
const PayOS = PayOSModule.default || PayOSModule.PayOS || PayOSModule;

const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID || "CLIENT_ID",
  apiKey: process.env.PAYOS_API_KEY || "API_KEY",
  checksumKey: process.env.PAYOS_CHECKSUM_KEY || "CHECKSUM_KEY",
});

const DEPOSIT_RATIO = 0.5;

function normalizeBaseUrl(url) {
  if (!url) return "";
  return String(url).replace(/\/+$/, "");
}

function getClientBaseUrl(req) {
  const origin = normalizeBaseUrl(req.get("origin"));
  if (origin) return origin;

  const referer = req.get("referer");
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      return normalizeBaseUrl(refererUrl.origin);
    } catch (_error) {
      // ignore invalid referer
    }
  }

  return "";
}

function getPayOSRedirectUrls(req) {
  const clientBaseUrl = getClientBaseUrl(req);
  const frontendBaseUrl = normalizeBaseUrl(process.env.FRONTEND_URL);
  const resolvedBaseUrl =
    clientBaseUrl || frontendBaseUrl || normalizeBaseUrl(process.env.PAYOS_BASE_URL);

  const returnUrlFromBase = resolvedBaseUrl
    ? `${resolvedBaseUrl}/payment-success`
    : "";
  const cancelUrlFromBase = resolvedBaseUrl
    ? `${resolvedBaseUrl}/payment-cancel`
    : "";

  const returnUrl = returnUrlFromBase || process.env.PAYOS_RETURN_URL || "";
  const cancelUrl = cancelUrlFromBase || process.env.PAYOS_CANCEL_URL || "";

  if (!returnUrl || !cancelUrl) {
    const err = new Error(
      "PayOS redirect URLs are missing. Send request from FE origin or set FRONTEND_URL/PAYOS_BASE_URL/PAYOS_RETURN_URL/PAYOS_CANCEL_URL."
    );
    err.status = 500;
    throw err;
  }

  return {
    returnUrl,
    cancelUrl,
  };
}

function buildMomoSignature(secretKey, params) {
  const {
    accessKey,
    amount,
    extraData,
    ipnUrl,
    orderId,
    orderInfo,
    partnerCode,
    redirectUrl,
    requestId,
    requestType,
  } = params;

  const rawSignature =
    `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;

  return crypto.createHmac("sha256", secretKey).update(rawSignature).digest("hex");
}

function cartLineTotal(item) {
  return item.quantity * item.unitPrice;
}

function cartTotalPrice(items) {
  return (items || []).reduce((sum, item) => sum + cartLineTotal(item), 0);
}

async function getBookingTotalPrice(booking) {
  if (typeof booking?.totalPrice === "number") {
    return booking.totalPrice;
  }
  const bookingItems = booking?.bookingItems || [];
  if (!bookingItems.length) return 0;

  const comboIds = bookingItems
    .filter((i) => i.type === "combo")
    .map((i) => i.itemId);
  const productIds = bookingItems
    .filter((i) => i.type === "product")
    .map((i) => i.itemId);

  const comboCount = bookingItems.filter((i) => i.type === "combo").length;
  const productCount = bookingItems.filter((i) => i.type === "product").length;

  const [combos, products] = await Promise.all([
    Combo.find({ _id: { $in: comboIds } }).select("price"),
    Product.find({ _id: { $in: productIds }, isActive: true }).select("price"),
  ]);

  if (combos.length !== comboIds.length) return 0;
  if (products.length !== productIds.length) return 0;

  const comboTotal = combos.reduce((sum, c) => sum + Number(c.price || 0), 0);
  const productTotal = products.reduce((sum, p) => sum + Number(p.price || 0), 0);

  const eligibleComboDiscount = comboCount > 2; // 3+ combos
  const eligibleProductDiscount = productCount >= 5; // 5+ products
  const discountMultiplier =
    eligibleComboDiscount || eligibleProductDiscount ? 0.95 : 1;

  return Math.round((comboTotal + productTotal) * discountMultiplier);
}

async function generateUniquePayOSOrderCode() {
  for (let i = 0; i < 5; i++) {
    const base = Math.floor(Date.now() / 1000) % 2147483647;
    const rand = Math.floor(Math.random() * 10000);
    let orderCode = base + rand;
    if (orderCode >= 2147483647) orderCode = orderCode - 10000;

    const exist = await Booking.findOne({ payosOrderCode: orderCode }).select(
      "_id"
    );
    if (!exist) return orderCode;
  }
  // Fallback (should be extremely rare)
  return Math.floor(Date.now() / 1000) % 2147483647;
}

function getMomoConfig() {
  const partnerCode = process.env.MOMO_PARTNER_CODE || "MOMO";
  const accessKey = process.env.MOMO_ACCESS_KEY;
  const secretKey = process.env.MOMO_SECRET_KEY;
  const redirectUrl = process.env.MOMO_REDIRECT_URL;
  const ipnUrl = process.env.MOMO_IPN_URL;
  const apiUrl =
    process.env.MOMO_API_URL ||
    "https://test-payment.momo.vn/v2/gateway/api/create";

  if (!accessKey || !secretKey || !redirectUrl || !ipnUrl) {
    return null;
  }

  return { partnerCode, accessKey, secretKey, redirectUrl, ipnUrl, apiUrl };
}

async function executeMomoCreate({
  amountStr,
  orderId,
  orderInfo,
  extraData = "",
}) {
  const cfg = getMomoConfig();
  if (!cfg) {
    const err = new Error(
      "MoMo is not configured (MOMO_ACCESS_KEY, MOMO_SECRET_KEY, MOMO_REDIRECT_URL, MOMO_IPN_URL)"
    );
    err.status = 500;
    throw err;
  }

  const { partnerCode, accessKey, secretKey, redirectUrl, ipnUrl, apiUrl } = cfg;
  const requestId = `${partnerCode}${Date.now()}${Math.random().toString(36).slice(2, 9)}`;
  const requestType = "captureWallet";

  const signature = buildMomoSignature(secretKey, {
    accessKey,
    amount: amountStr,
    extraData,
    ipnUrl,
    orderId,
    orderInfo,
    partnerCode,
    redirectUrl,
    requestId,
    requestType,
  });

  const requestBody = {
    partnerCode,
    accessKey,
    requestId,
    amount: amountStr,
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    extraData,
    requestType,
    signature,
    lang: "en",
  };

  const { data } = await axios.post(apiUrl, requestBody, {
    headers: { "Content-Type": "application/json" },
    timeout: 30000,
  });

  return { data, requestId, orderId, amountStr };
}

// Create MoMo payment (captureWallet) — returns payUrl for redirect
exports.createMomoPayment = async (req, res) => {
  try {
    const body = req.body || {};
    const {
      amount,
      orderInfo = "pay with MoMo",
      extraData = "",
      orderId: clientOrderId,
    } = body;

    if (!getMomoConfig()) {
      return res.status(500).json({
        message:
          "MoMo is not configured (MOMO_ACCESS_KEY, MOMO_SECRET_KEY, MOMO_REDIRECT_URL, MOMO_IPN_URL)",
      });
    }

    if (amount === undefined || amount === null || amount === "") {
      return res.status(400).json({ message: "amount is required" });
    }

    const amountStr = String(Math.round(Number(amount)));
    if (!Number.isFinite(Number(amountStr)) || Number(amountStr) <= 0) {
      return res.status(400).json({ message: "amount must be a positive number" });
    }

    const partnerCode = process.env.MOMO_PARTNER_CODE || "MOMO";
    const requestIdBase = `${partnerCode}${Date.now()}${Math.random().toString(36).slice(2, 9)}`;
    const orderId = clientOrderId || requestIdBase;

    const { data, requestId } = await executeMomoCreate({
      amountStr,
      orderId,
      orderInfo,
      extraData,
    });

    if (!data || data.resultCode !== 0) {
      return res.status(400).json({
        message: data?.message || "MoMo payment creation failed",
        resultCode: data?.resultCode,
        orderId,
        requestId,
      });
    }

    return res.status(201).json({
      payUrl: data.payUrl,
      deeplink: data.deeplink,
      qrCodeUrl: data.qrCodeUrl,
      orderId,
      requestId,
      amount: amountStr,
    });
  } catch (error) {
    if (error.status === 500) {
      return res.status(500).json({ message: error.message });
    }
    const msg =
      error.response?.data?.message || error.message || "MoMo request failed";
    return res.status(500).json({ message: msg });
  }
};

// Pay 50% of current cart total (requires login)
exports.createMomoPaymentFromCart = async (req, res) => {
  try {
    if (!getMomoConfig()) {
      return res.status(500).json({
        message:
          "MoMo is not configured (MOMO_ACCESS_KEY, MOMO_SECRET_KEY, MOMO_REDIRECT_URL, MOMO_IPN_URL)",
      });
    }

    const userId = req.user.id;
    const body = req.body || {};
    const cart = await Cart.findOne({ userId });
    const items = cart?.items || [];

    if (!items.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const cartTotal = cartTotalPrice(items);
    if (cartTotal <= 0) {
      return res.status(400).json({ message: "Cart total is invalid" });
    }

    const depositAmount = Math.round(cartTotal * DEPOSIT_RATIO);
    const amountStr = String(Math.max(1, depositAmount));

    const orderId = `CART_${userId}_${Date.now()}`;
    const orderInfo =
      body.orderInfo || `Cart deposit 50% (${cartTotal} VND total)`;
    const extraData =
      body.extraData ||
      JSON.stringify({
        cartTotal,
        depositPercent: 50,
        payAmount: Number(amountStr),
        userId: String(userId),
      });

    const { data, requestId } = await executeMomoCreate({
      amountStr,
      orderId,
      orderInfo,
      extraData,
    });

    if (!data || data.resultCode !== 0) {
      return res.status(400).json({
        message: data?.message || "MoMo payment creation failed",
        resultCode: data?.resultCode,
        orderId,
        requestId,
        cartTotal,
        depositAmount: Number(amountStr),
      });
    }

    return res.status(201).json({
      payUrl: data.payUrl,
      deeplink: data.deeplink,
      qrCodeUrl: data.qrCodeUrl,
      orderId,
      requestId,
      cartTotal,
      depositPercent: 50,
      amount: amountStr,
    });
  } catch (error) {
    if (error.status === 500) {
      return res.status(500).json({ message: error.message });
    }
    const msg =
      error.response?.data?.message || error.message || "MoMo request failed";
    return res.status(500).json({ message: msg });
  }
};

// ====== PAYOS INTEGRATION ======

exports.createPayOSPayment = async (req, res) => {
  try {
    const { amount, description, orderId: clientOrderId } = req.body || {};

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "amount is required and must be positive" });
    }

    // PayOS requires orderCode to be a number. We can generate a random one if not provided.
    // Ensure it falls within Max int32 limit (2147483647).
    const randomOrderCode = Number(String(Date.now()).slice(-6) + Math.floor(Math.random() * 1000));
    const orderCode = clientOrderId ? Number(clientOrderId) : randomOrderCode;

    const { returnUrl, cancelUrl } = getPayOSRedirectUrls(req);
    const requestData = {
      orderCode,
      amount: Math.round(Number(amount)),
      description: description || "Thanh toan don hang",
      cancelUrl,
      returnUrl,
    };

    const paymentLinkRes = await payos.paymentRequests.create(requestData);

    return res.status(201).json({
      checkoutUrl: paymentLinkRes.checkoutUrl,
      orderCode: paymentLinkRes.orderCode,
      paymentLinkId: paymentLinkRes.paymentLinkId,
    });
  } catch (error) {
    console.error("PayOS Create Payment Error:", error);
    return res.status(500).json({ message: error.message || "Failed to create PayOS payment link" });
  }
};

exports.createPayOSPaymentFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const body = req.body || {};
    const cart = await Cart.findOne({ userId });
    const items = cart?.items || [];

    if (!items.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const cartTotal = cartTotalPrice(items);
    if (cartTotal <= 0) {
      return res.status(400).json({ message: "Cart total is invalid" });
    }

    const depositAmount = Math.round(cartTotal * DEPOSIT_RATIO);
    const amountStr = Math.max(1, depositAmount);

    const randomOrderCode = Number(String(Date.now()).slice(-6) + Math.floor(Math.random() * 1000));

    const { returnUrl, cancelUrl } = getPayOSRedirectUrls(req);
    const requestData = {
      orderCode: randomOrderCode,
      amount: amountStr,
      description: body.description || "Dat coc gio hang",
      cancelUrl,
      returnUrl,
    };

    const paymentLinkRes = await payos.paymentRequests.create(requestData);

    const cartPayment = await CartPayment.create({
      userId,
      orderCode: paymentLinkRes.orderCode,
      paymentLinkId: paymentLinkRes.paymentLinkId || "",
      cartTotal,
      paidAmount: amountStr,
      items: items.map((i) => ({
        type: i.type,
        itemId: i.itemId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      paymentStatus: "UNPAID",
    });

    return res.status(201).json({
      checkoutUrl: paymentLinkRes.checkoutUrl,
      orderCode: paymentLinkRes.orderCode,
      paymentLinkId: paymentLinkRes.paymentLinkId,
      cartTotal,
      depositAmount: amountStr,
      cartPaymentId: cartPayment._id,
    });
  } catch (error) {
    console.error("PayOS Create Cart Payment Error:", error);
    return res.status(500).json({ message: error.message || "Failed to create PayOS cart payment link" });
  }
};

exports.createPayOSPaymentFromBooking = async (req, res) => {
  try {
    const { bookingId } = req.body || {};
    if (!bookingId) {
      return res.status(400).json({ message: "bookingId is required" });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (booking.status === "CONFIRMED") {
      return res.status(400).json({ message: "Booking is already confirmed" });
    }
    if (booking.paymentStatus === "PAID") {
      return res.status(400).json({ message: "Booking is already paid" });
    }

    const totalPrice = await getBookingTotalPrice(booking);
    const amount = Math.round(Number(totalPrice));
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Booking amount is invalid" });
    }

    const orderCode = await generateUniquePayOSOrderCode();
    const shortBookingRef = String(booking._id).slice(-6);
    const description = `Booking ${shortBookingRef}`; // PayOS limits description length
    const { returnUrl, cancelUrl } = getPayOSRedirectUrls(req);
    const requestData = {
      orderCode,
      amount,
      description,
      cancelUrl,
      returnUrl,
    };

    const paymentLinkRes = await payos.paymentRequests.create(requestData);

    booking.payosOrderCode = orderCode;
    booking.payosPaymentLinkId = paymentLinkRes.paymentLinkId;
    booking.status = booking.status || "PENDING";
    await booking.save();

    return res.status(201).json({
      checkoutUrl: paymentLinkRes.checkoutUrl,
      orderCode: paymentLinkRes.orderCode,
      paymentLinkId: paymentLinkRes.paymentLinkId,
      bookingId: booking._id,
      totalPrice: amount,
    });
  } catch (error) {
    console.error("PayOS Create Booking Payment Error:", error);
    return res.status(500).json({
      message: error.message || "Failed to create PayOS payment link",
    });
  }
};

exports.payOSWebhook = async (req, res) => {
  try {
    const webhookData = await payos.webhooks.verify(req.body);
    console.log("PayOS Webhook Data:", webhookData);

    const payload = webhookData?.data && typeof webhookData.data === "object"
      ? webhookData.data
      : webhookData;
    const orderCodeRaw = payload?.orderCode ?? webhookData?.orderCode;
    const orderCode = Number(orderCodeRaw);
    const isSuccess =
      payload?.success === true ||
      payload?.success === "true" ||
      webhookData?.success === true ||
      webhookData?.success === "true" ||
      payload?.code === "00" ||
      payload?.code === 0 ||
      webhookData?.code === "00" ||
      webhookData?.code === 0;

    let paymentSummary = null;
    if (Number.isFinite(orderCode)) {
      const booking = await Booking.findOne({ payosOrderCode: orderCode });
      if (booking) {
        booking.paymentStatus = isSuccess ? "PAID" : "UNPAID";
        booking.status = isSuccess ? "CONFIRMED" : "REJECTED";
        await booking.save();

        if (isSuccess) {
          const user = booking.userId
            ? await User.findById(booking.userId).select("name image").lean()
            : null;
          paymentSummary = {
            userId: booking.userId || null,
            userName: user?.name || booking.customerName || "",
            userImage: user?.image || "",
            paidAmount: Math.round(
              Number(booking.totalPrice || payload?.amount || webhookData?.amount || 0)
            ),
            paymentStatus: booking.paymentStatus,
            bookingStatus: booking.status,
            bookingId: booking._id,
            source: "booking",
          };
        }
      } else {
        const cartPayment = await CartPayment.findOne({ orderCode });
        if (cartPayment) {
          cartPayment.paymentStatus = isSuccess ? "PAID" : "FAILED";
          cartPayment.paidAt = isSuccess ? new Date() : null;
          await cartPayment.save();

          if (isSuccess) {
            const user = await User.findById(cartPayment.userId)
              .select("name image")
              .lean();
            paymentSummary = {
              userId: cartPayment.userId || null,
              userName: user?.name || "",
              userImage: user?.image || "",
              paidAmount: Math.round(
                Number(cartPayment.paidAmount || payload?.amount || webhookData?.amount || 0)
              ),
              paymentStatus: cartPayment.paymentStatus,
              cartPaymentId: cartPayment._id,
              source: "cart",
            };
          }
        }
      }
    }

    return res.status(200).json({
      error: 0,
      message: "Ok",
      data: webhookData,
      paymentSummary,
    });
  } catch (error) {
    console.error("PayOS Webhook Error:", error);
    return res.status(400).json({
      error: -1,
      message: "Xác thực webhook thất bại",
    });
  }
};
