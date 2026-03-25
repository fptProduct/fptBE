const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Register
exports.register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res
        .status(400)
        .json({ message: "Name, email, phone and password are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email đã tồn tại" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      phone,
      password: hashedPassword,
    });

    return res.status(201).json({
      message: "Đăng kí thành công",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const ADMIN_EMAIL = "admin@example.com";
    const ADMIN_PASSWORD = "admin1234";

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      const adminUser = await User.findOne({ email: ADMIN_EMAIL });
      const token = jwt.sign(
        { userId: adminUser?._id || null, role: "admin" },
        process.env.JWT_SECRET || "default_secret",
        { expiresIn: "7d" }
      );
      return res.json({
        message: "Login successful",
        token,
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role || "user" },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "7d" }
    );

    return res.json({
      message: "Login successful",
      token,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Get current logged-in user
exports.getMe = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(req.user.id).select("name email phone image");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      image: user.image,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Update current logged-in user profile
exports.updateProfile = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { name, email, phone, image } = req.body;
    const updateData = {};

    if (name !== undefined) {
      if (!name) return res.status(400).json({ message: "Name cannot be empty" });
      updateData.name = name;
    }

    if (email !== undefined) {
      if (!email) return res.status(400).json({ message: "Email cannot be empty" });
      const existingUser = await User.findOne({ email, _id: { $ne: req.user.id } });
      if (existingUser) {
        return res.status(400).json({ message: "Email đã tồn tại" });
      }
      updateData.email = email;
    }

    if (phone !== undefined) {
      if (!phone) return res.status(400).json({ message: "Phone cannot be empty" });
      updateData.phone = phone;
    }

    if (image !== undefined) {
      updateData.image = image;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        message: "At least one field is required: name, email, phone, image",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
      runValidators: true,
    }).select("name email phone image");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      message: "Profile updated successfully",
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        image: updatedUser.image,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

