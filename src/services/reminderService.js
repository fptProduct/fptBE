const Reminder = require("../models/Reminder");

let schedulerRef = null;

async function sendDueReminders() {
  return Reminder.countDocuments({ isSent: false }).catch(() => 0);
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
