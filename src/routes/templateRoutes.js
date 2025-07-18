const express = require('express')
const { createTemplate, deleteTemplate, getTemplates, getTemplatesByBot } = require('../meta/templateControllers')
const { getElements, updatestatus } = require('../meta/broadcast')
// const { authenticateToken } = require('../middleware/authenticateToken')
const router = express.Router()
/**
 * @swagger
 * /template:
 *   post:
 *     summary: Create WhatsApp Message Template
 *     description: >
 *       Creates a new WhatsApp message template for a chatbot.  
 *       🔹 The request must contain a `botId` and a `payload` matching Meta's message template structure.  
 *       🔹 Choose one of the examples below based on your HEADER format (TEXT, IMAGE, DOCUMENT, or VIDEO).
 *     tags:
 *       - Template
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               botId:
 *                 type: string
 *                 example: izar-logistic
 *               payload:
 *                 type: object
 *           examples:
 *             TEXT_Header:
 *               summary: Template with TEXT header
 *               value:
 *                 botId: izar-logistic
 *                 payload:
 *                   name: order_confirmation
 *                   language: en_US
 *                   category: MARKETING
 *                   components:
 *                     - type: HEADER
 *                       format: TEXT
 *                       text: Order {{1}} Confirmed
 *                       example:
 *                         header_text: ["#123456"]
 *                     - type: BODY
 *                       text: Hi {{1}}, your order {{2}} has been confirmed and will be delivered by {{3}}.
 *                       example:
 *                         body_text: [["Aicha", "#123456", "Monday, June 17"]]
 *                     - type: FOOTER
 *                       text: Thanks for shopping with us!
 *                     - type: BUTTONS
 *                       buttons:
 *                         - type: QUICK_REPLY
 *                           text: Track Order
 *                         - type: QUICK_REPLY
 *                           text: Cancel Order

 *             IMAGE_Header:
 *               summary: Template with IMAGE header
 *               value:
 *                 botId: izar-logistic
 *                 payload:
 *                   name: promo_banner
 *                   language: en_US
 *                   category: MARKETING
 *                   components:
 *                     - type: HEADER
 *                       format: IMAGE
 *                       example:
 *                         header_handle: ["media_id_123"]
 *                     - type: BODY
 *                       text: Don't miss our summer sale, {{1}}! Up to 50% off.
 *                       example:
 *                         body_text: [["Aicha"]]

 *             DOCUMENT_Header:
 *               summary: Template with DOCUMENT header
 *               value:
 *                 botId: izar-logistic
 *                 payload:
 *                   name: invoice_template
 *                   language: en_US
 *                   category: TRANSACTIONAL
 *                   components:
 *                     - type: HEADER
 *                       format: DOCUMENT
 *                       example:
 *                         header_handle: ["invoice_pdf_456"]
 *                     - type: BODY
 *                       text: Hi {{1}}, your invoice {{2}} is ready.
 *                       example:
 *                         body_text: [["Aicha", "#INV-456"]]

 *             VIDEO_Header:
 *               summary: Template with VIDEO header
 *               value:
 *                 botId: izar-logistic
 *                 payload:
 *                   name: welcome_video
 *                   language: en_US
 *                   category: UTILITY
 *                   components:
 *                     - type: HEADER
 *                       format: VIDEO
 *                       example:
 *                         header_handle: ["video_media_id_789"]
 *                     - type: BODY
 *                       text: Welcome {{1}}! Here’s a quick intro to our service.
 *                       example:
 *                         body_text: [["Aicha"]]
 *     responses:
 *       200:
 *         description: Template created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: The template has been created successfully.
 *       400:
 *         description: Validation error or request issue.
 *       404:
 *         description: Bot not found.
 *       500:
 *         description: Internal server error.
 */
router.post('/',createTemplate)
/**
 * @swagger
 * /template/{id}:
 *   delete:
 *     summary: Delete a template both from Supabase and Meta API
 *     description: |
 *       Deletes a template from Supabase and also removes it from the Meta (WhatsApp) Business API using the chatbot's configuration.
 *       Requires the template to be linked to a WhatsApp-configured chatbot.
 *     tags:
 *       - Template
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID of the template to delete
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Template deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 message: The template has been deleted successfully.
 *       400:
 *         description: Bad Request – Missing ID or Supabase/Meta API error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 message: id is required!
 *       404:
 *         description: Template or WhatsApp configuration not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 message: template not found!
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 message: Unexpected server error
 */
router.delete('/:id',deleteTemplate)
/**
 * @swagger
 * /template/broadcast:
 *   post:
 *     summary: Sends a WhatsApp template message using Meta API
 *     description: |
 *       Sends a WhatsApp message using a pre-approved template. The template can include a header
 *       (text, image, video, or document) and body parameters. The correct structure must match the 
 *       template created on Meta's WhatsApp Manager.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - botId
 *               - userId
 *               - template_name
 *               - language
 *             properties:
 *               botId:
 *                 type: string
 *                 description: The unique identifier of the chatbot.
 *               userId:
 *                 type: string
 *                 description: WhatsApp phone number of the recipient in international format.
 *               template_name:
 *                 type: string
 *                 description: Name of the template created in Meta WhatsApp Manager.
 *               language:
 *                 type: string
 *                 description: Language code of the template (e.g., "en_US").
 *               header_parms:
 *                 type: object
 *                 description: Header component of the template (optional).
 *               body_parms:
 *                 type: array
 *                 description: Parameters for the body component of the template.
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                     text:
 *                       type: string
 *           examples:
 *             Template with TEXT header:
 *               summary: Header with text
 *               value:
 *                 botId: "arts-clinique"
 *                 userId: "212631759536"
 *                 template_name: "order_confirmation"
 *                 language: "en_US"
 *                 header_parms:
 *                   type: text
 *                   text: "#123456"
 *                 body_parms:
 *                   - type: text
 *                     text: "Aicha"
 *                   - type: text
 *                     text: "#123456"
 *                   - type: text
 *                     text: "Monday, June 17"
 *             Template with IMAGE header:
 *               summary: Header with image
 *               value:
 *                 botId: "arts-clinique"
 *                 userId: "212631759536"
 *                 template_name: "order_confirmation"
 *                 language: "en_US"
 *                 header_parms:
 *                   type: image
 *                   image: "MEDIA_URL"
 *                 body_parms:
 *                   - type: text
 *                     text: "Aicha"
 *                   - type: text
 *                     text: "#123456"
 *                   - type: text
 *                     text: "Monday, June 17"
 *             Template with DOCUMENT header:
 *               summary: Header with document
 *               value:
 *                 botId: "arts-clinique"
 *                 userId: "212631759536"
 *                 template_name: "order_confirmation"
 *                 language: "en_US"
 *                 header_parms:
 *                   type: document
 *                   document: "MEDIA_URL"
 *                 body_parms:
 *                   - type: text
 *                     text: "Aicha"
 *                   - type: text
 *                     text: "#123456"
 *                   - type: text
 *                     text: "Monday, June 17"
 *             Template with VIDEO header:
 *               summary: Header with video
 *               value:
 *                 botId: "arts-clinique"
 *                 userId: "212631759536"
 *                 template_name: "order_confirmation"
 *                 language: "en_US"
 *                 header_parms:
 *                   type: video
 *                   video: "MEDIA_URL"
 *                 body_parms:
 *                   - type: text
 *                     text: "Aicha"
 *                   - type: text
 *                     text: "#123456"
 *                   - type: text
 *                     text: "Monday, June 17"
 *     responses:
 *       200:
 *         description: Template message sent successfully
 *       400:
 *         description: Bad request due to invalid parameters or template
 *       404:
 *         description: Template not found
 *       500:
 *         description: Internal server error
 */
router.post('/broadcast', getElements)
router.get("/:botId", getTemplatesByBot)
router.get("/", getTemplates)
module.exports = router;