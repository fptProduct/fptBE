const Reminder = require("../models/Reminder");

function parseDateOnlyToUtc(value) {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

exports.createReminder = async (req, res) => {
  try {
    const { date, fcmToken, title, body } = req.body || {};
    const targetDate = parseDateOnlyToUtc(date);
    if (!targetDate) {
      return res.status(400).json({ message: "date must be in YYYY-MM-DD format" });
    }
    let tokenToUse = "";
    if (typeof fcmToken === "string" && fcmToken.trim()) {
      tokenToUse = fcmToken.trim();
    } else {
      const latestReminderWithToken = await Reminder.findOne({
        userId: req.user.id,
        fcmToken: { $exists: true, $ne: "" },
      }).sort({ createdAt: -1 });
      tokenToUse = latestReminderWithToken?.fcmToken || "";
    }
    if (!tokenToUse) {
      return res.status(400).json({
        message: "fcmToken is required for the first reminder. Next times you can send only date.",
      });
    }

    const triggerAt = new Date(targetDate);
    triggerAt.setUTCDate(triggerAt.getUTCDate() - 1);
    const now = new Date();
    const diffDays = Math.ceil((targetDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    const reminder = await Reminder.create({
      userId: req.user.id,
      targetDate,
      triggerAt,
      fcmToken: tokenToUse,
      title: title && typeof title === "string" ? title.trim() : "Reminder",
      body: body && typeof body === "string" ? body.trim() : "Your date is tomorrow.",
    });

    return res.status(201).json({
      id: reminder._id,
      date: reminder.targetDate,
      triggerAt: reminder.triggerAt,
      notifyBeforeDays: 1,
      title: reminder.title,
      body: reminder.body,
      daysLeft: diffDays,
      isSent: reminder.isSent,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to create reminder" });
  }
};

exports.getMyReminders = async (req, res) => {
  try {
    const reminders = await Reminder.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json({
      total: reminders.length,
      data: reminders.map((r) => ({
        notifyBeforeDays: 1,
        daysLeft: Math.ceil((r.targetDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
        id: r._id,
        date: r.targetDate,
        triggerAt: r.triggerAt,
        title: r.title,
        body: r.body,
        isSent: r.isSent,
        sentAt: r.sentAt,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to get reminders" });
  }
};
