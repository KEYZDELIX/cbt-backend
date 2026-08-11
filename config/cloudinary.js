const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary using environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDY_NAME,
  api_key: process.env.CLOUDY_KEY,
  api_secret: process.env.CLOUDY_SECRET
});

if (process.env.CLOUDY_NAME) {
  console.log("☁️  Cloudinary Configured: YES");
} else {
  console.log("⚠️  Cloudinary Configured: NO (Check CLOUDY_NAME in .env)");
}

// Storage engine configuration for image uploads
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'cbt_quiz_images',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [{ width: 1000, crop: 'limit' }]
  }
});

const upload = multer({ storage: storage });

module.exports = { cloudinary, upload };