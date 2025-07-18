const { uploadFiles } = require("../meta/uploadFiles");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const router = require("express").Router(); 
/**
 * @swagger
 * /meta-upload/{domainName}:
 *   post:
 *     summary: Upload a file to Meta and store its information.
 *     description: >
 *       This endpoint uploads a file to the Meta (Facebook) API through an upload session and stores its metadata in Supabase.
 *       It also uses a domain-based routing to forward the file to an internal file handler.
 *     tags:
 *       - Upload
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: path
 *         name: domainName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the domain to route the uploaded file.
 *       - in: formData
 *         name: file
 *         required: true
 *         type: file
 *         description: File to upload.
 *       - in: formData
 *         name: chatId
 *         required: true
 *         type: string
 *         description: Chat ID to associate with the upload.
 *     responses:
 *       200:
 *         description: File uploaded and stored successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   chat_id:
 *                     type: string
 *                   meta_handle:
 *                     type: string
 *                   session_id:
 *                     type: string
 *                   is_uploaded:
 *                     type: boolean
 *                   url:
 *                     type: string
 *       400:
 *         description: Missing file,
 */  
router.post('/:domainName', upload.single('file'), uploadFiles)
module.exports = router;