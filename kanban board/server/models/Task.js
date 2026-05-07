const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Board",
    required: true,
    index: true,
  },
  list: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "List",
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: "",
    trim: true,
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  dueDate: {
    type: Date,
    default: null,
  },
  position: {
    type: Number,
    required: true,
    default: 0,
  },
}, {
  timestamps: true,
});

taskSchema.index({ board: 1, list: 1, position: 1 });

module.exports = mongoose.model("Task", taskSchema);
