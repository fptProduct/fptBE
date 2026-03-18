async function sendOrderNotification(order) {
  const webhookUrl = process.env.ORDER_NOTIFICATION_WEBHOOK_URL;
  const payload = {
    orderId: order._id,
    status: order.status,
    ceremonyType: order.ceremonyType,
    package: {
      productId: order.package.productId,
      productName: order.package.productName,
      packageType: order.package.packageType,
      price: order.package.price,
    },
    delivery: order.delivery,
    totalPrice: order.totalPrice,
    customer: order.customer,
    createdAt: order.createdAt,
  };

  if (!webhookUrl) {
    console.log("Order notification (no webhook configured):", payload);
    return;
  }

  if (typeof fetch !== "function") {
    console.log("Order notification (fetch unavailable):", payload);
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("Order notification failed:", err?.message || err);
  }
}

module.exports = sendOrderNotification;

