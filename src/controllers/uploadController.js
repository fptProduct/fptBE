const fs = require("fs/promises");

exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "Missing required fields",
        missingFields: ["image"],
      });
    }

    const cloudinary = req.app.locals.cloudinary;
    if (!cloudinary) {
      return res.status(500).json({ message: "Cloudinary is not configured" });
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "be-uploads",
    });

    await fs.unlink(req.file.path).catch(() => {});

    return res.json({
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    return res.status(500).json({ message: error.message });
  }
};

