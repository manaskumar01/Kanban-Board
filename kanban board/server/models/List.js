const mongoose = require("mongoose");

const listSchema = new mongoose.Schema({
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Board",
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  position: {
    type: Number,
    required: true,
    default: 0,
  },
}, {
  timestamps: true,
});

listSchema.index({ board: 1, position: 1 });

module.exports = mongoose.model("List", listSchema);
