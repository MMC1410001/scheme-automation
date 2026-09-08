const multer = require("multer");

// Multer setup for memory storage (file buffer)
const multerStorage = multer.memoryStorage();
const upload = multer({ storage: multerStorage });

module.exports = { upload };
