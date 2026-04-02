const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetDate: {
      type: Date,
      required: true,
      index: true,
    },
    triggerAt: {
      type: Date,
      required: true,
      index: true,
    },
    fcmToken: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
      default: "Reminder",
    },
    body: {
      type: String,
      trim: true,
      default: "Your date is tomorrow.",
    },
    isSent: {
      type: Boolean,
      default: false,
      index: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Reminder", reminderSchema);
