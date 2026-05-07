const mongoose = require("mongoose");

const boardMemberSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  role: {
    type: String,
    enum: ["admin", "member"],
    default: "member",
  },
}, {
  _id: false,
});

const boardSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  members: [boardMemberSchema],
}, {
  timestamps: true,
});

boardSchema.index({ owner: 1, name: 1 });

module.exports = mongoose.model("Board", boardSchema);
