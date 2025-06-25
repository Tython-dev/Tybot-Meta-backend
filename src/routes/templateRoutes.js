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
 *       Validates a template by name and bot ID, checks for required parameters
 *       based on the template's component type (HEADER, BODY), formats the message 
 *       accordingly, and sends it via WhatsApp Cloud API using stored bot credentials.
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
 *                 description: The recipient's WhatsApp phone number in international format.
 *               template_name:
 *                 type: string
 *                 description: The name of the WhatsApp template to send.
 *               language:
 *                 type: string
 *                 description: Language code of the template (e.g., 'en_US').
 *               header_parms:
 *                 type: object
 *                 description: Optional parameter for the template's header component.
 *                 example:
 *                   type: text
 *                   text: "Header Text"
 *               body_parms:
 *                 type: array
 *                 description: Optional array of parameters for the template's body component.
 *                 items:
 *                   type: object
 *                   example:
 *                     type: text
 *                     text: "Body parameter"
 *     responses:
 *       200:
 *         description: Template message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Response from WhatsApp Cloud API
 *       400:
 *         description: Bad request - missing or invalid parameters, rejected or pending template, or Supabase error
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *       404:
 *         description: Template not found
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *       500:
 *         description: Internal server error or failed to send message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.post('/broadcast', getElements)
router.get("/:botId", getTemplatesByBot)
router.get("/", getTemplates)
module.exports = router;