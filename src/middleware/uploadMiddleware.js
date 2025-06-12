const multer = require('multer');
const path = require('path');

const validTables = [
  'workspaces',
  'system_users',
  'packages',
  'end_users',
  'domains',
  'customers',
  'chatbots',
  'channels',
];

const storage = multer.diskStorage({
  destination: (req, res, cb) => {
    const { table_name } = req.params;
    if (!validTables.includes(table_name)) {
      return cb(new Error('Invalid table name'), null);
    }
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    require('fs').mkdirSync(uploadDir, { recursive: true }); // Ensure directory exists
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    if (!file || !file.originalname) {
      return cb(new Error('No file provided or invalid file'), null);
    }
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${extension}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!file) {
    return cb(new Error('No file provided'), false);
  }
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/webp',
    'image/svg+xml',
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, GIF, BMP, TIFF, WEBP, and SVG files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

module.exports = upload;