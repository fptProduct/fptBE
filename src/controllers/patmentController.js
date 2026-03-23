const crypto = require("crypto");
const axios = require("axios");
const Cart = require("../models/Cart");

const DEPOSIT_RATIO = 0.5;

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
