const { uploadFiles } = require("../meta/uploadFiles");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const router = require("express").Router(); 
router.post('/:domainName', upload.single('file'), uploadFiles)
module.exports = router;