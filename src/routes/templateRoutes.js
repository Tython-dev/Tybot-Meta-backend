const express = require('express')
const { createTemplate } = require('../meta/templateControllers')
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
 *       🔹 The request must contain a botId and a payload matching Meta's message template structure.  
 *       🔹 The body **must** look like this:
 *
 *       ```json
 *       {
 *         "botId": "izar-logistic",
 *         "payload": {
 *           "name": "order_confirmation",
 *           "language": "en_US",
 *           "category": "MARKETING",
 *           "components": [
 *             {
 *               "type": "HEADER",
 *               "format": "TEXT",
 *               "text": "Order {{1}} Confirmed",
 *               "example": {
 *                 "header_text": ["#123456"]
 *               }
 *             },
 *             {
 *               "type": "BODY",
 *               "text": "Hi {{1}}, your order {{2}} has been confirmed and will be delivered by {{3}}.",
 *               "example": {
 *                 "body_text": [
 *                   ["Aicha", "#123456", "Monday, June 17"]
 *                 ]
 *               }
 *             },
 *             {
 *               "type": "FOOTER",
 *               "text": "Thanks for shopping with us!"
 *             },
 *             {
 *               "type": "BUTTONS",
 *               "buttons": [
 *                 {
 *                   "type": "QUICK_REPLY",
 *                   "text": "Track Order"
 *                 },
 *                 {
 *                   "type": "QUICK_REPLY",
 *                   "text": "Cancel Order"
 *                 }
 *               ]
 *             }
 *           ]
 *         }
 *       }
 *       ```
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
 *                   example: The message has been created successfully.
 *       400:
 *         description: Validation error or request issue.
 *       404:
 *         description: Bot not found.
 *       500:
 *         description: Internal server error.
 */
router.post('/template',createTemplate)
router.post('/brodcast', getElements)
router.get('/config', updatestatus)
module.exports = router;