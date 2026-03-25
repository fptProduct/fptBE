module.exports = (req, res, next) => {
  const role = req.user?.role;
  if (role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
};

