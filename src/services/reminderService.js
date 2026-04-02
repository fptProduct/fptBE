const Reminder = require("../models/Reminder");
const admin = require("../utils/firebaseAdmin");

let schedulerRef = null;

function buildMessage(reminder) {
  return {
    token: reminder.fcmToken,
    notification: {
      title: reminder.title || "Reminder",
      body: reminder.body || "Your date is tomorrow.",
    },
    data: {
      reminderId: String(reminder._id),
      targetDate: reminder.targetDate.toISOString(),
      triggerAt: reminder.triggerAt.toISOString(),
    },
  };
}

async function sendDueReminders() {
  const now = new Date();
  const dueReminders = await Reminder.find({
    isSent: false,
    triggerAt: { $lte: now },
  })
    .sort({ triggerAt: 1 })
    .limit(100);

  for (const reminder of dueReminders) {
    try {
      await admin.messaging().send(buildMessage(reminder));
      reminder.isSent = true;
      reminder.sentAt = new Date();
      await reminder.save();
    } catch (error) {
      console.error("Failed to send reminder:", reminder._id, error.message);
    }
  }
}

function startReminderScheduler(intervalMs = 60 * 1000) {
  if (schedulerRef) return;
  schedulerRef = setInterval(() => {
    sendDueReminders().catch((error) => {
      console.error("Reminder scheduler error:", error.message);
    });
  }, intervalMs);

  sendDueReminders().catch((error) => {
    console.error("Reminder initial run error:", error.message);
  });
}

module.exports = {
  sendDueReminders,
  startReminderScheduler,
};
