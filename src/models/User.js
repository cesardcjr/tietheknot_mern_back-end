const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const SECRET_QUESTIONS = [
  "What was the name of your first pet?",
  "What was the name of the street you grew up on?",
  "What was your childhood nickname?",
  "What was the first name of your favorite teacher?",
  "In which city were you born?",
  "What is your favorite food?",
];

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    maxlength: 128,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  contactNumber: {
    type: String,
    required: true,
    trim: true,
    maxlength: 40,
  },
  secretQuestion: {
    type: String,
    enum: SECRET_QUESTIONS,
  },
  secretAnswerHash: {
    type: String,
    select: false,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  createdDate: {
    type: Date,
    default: Date.now,
  },
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.matchSecretAnswer = async function (enteredAnswer) {
  return await bcrypt.compare(
    String(enteredAnswer || "").trim().toLowerCase(),
    this.secretAnswerHash,
  );
};

userSchema.methods.toSafeObject = function () {
  return {
    _id: this._id,
    username: this.username,
    fullName: this.fullName,
    contactNumber: this.contactNumber,
    isAdmin: this.isAdmin,
    isActive: this.isActive,
    createdDate: this.createdDate,
  };
};

module.exports = mongoose.model("User", userSchema);
module.exports.SECRET_QUESTIONS = SECRET_QUESTIONS;
