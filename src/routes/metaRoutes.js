const controllers = require("../controllers/meta/controllers");
const { metaApi } = require("../controllers/meta/metaApi");
const { sendStoryapi, motsClee } = require("../controllers/meta/sendStoryapi");
const { authenticateToken } = require("../middleware/authenticateToken");
const verifyStatus = require("../middleware/verifyStatus");


const router = require("express").Router(); 
/**
 * @swagger
 * /webhook:
 *   post:
 *     summary: Gère les messages entrants depuis WhatsApp (ou Web) et répond via Botpress ou WhatsApp.
 *     description: |
 *       Cette route traite les webhooks entrants depuis WhatsApp (ou depuis l'interface web si `fromWeb` est spécifié).
 *       Elle :
 *       - Identifie le bot concerné via `phone_number_id`
 *       - Enregistre l'utilisateur si nécessaire
 *       - Crée ou met à jour une conversation
 *       - Envoie le message utilisateur à Botpress
 *       - Enregistre et renvoie les réponses du bot
 *       - Les renvoie à WhatsApp sauf si `fromWeb` est précisé ou que le bot est en pause
 *     tags:
 *       - Messages
 *     parameters:
 *       - in: query
 *         name: fromWeb
 *         required: false
 *         schema:
 *           type: string
 *         description: Indique si le message vient de l'interface web
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             entry:
 *               - changes:
 *                   - value:
 *                       messaging_product: whatsapp
 *                       messages:
 *                         - type: text
 *                           text:
 *                             body: "Hello"
 *                       metadata:
 *                         phone_number_id: "123456789"
 *                       contacts:
 *                         - wa_id: "987654321"
 *                           profile:
 *                             name: "Aicha"
 *     responses:
 *       200:
 *         description: Succès. Le message a été traité.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 received_from_user:
 *                   type: string
 *                 sent_to_user:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Erreur lors de l'envoi à WhatsApp
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 *       500:
 *         description: Erreur interne
 */

router.post("/webhook/:botId/:v",verifyStatus, metaApi);
router.get("/webhook/:botId/:v", controllers.controllers.webhook);  
/**
 * @swagger
 * /desactiver-bot:
 *   post:
 *     summary: Désactiver un bot spécifique sur Botpress
 *     description: Cette route permet de désactiver (unpause) un bot en envoyant une requête à l’API de Botpress.
 *     tags:
 *       - Botpress
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - botId
 *             properties:
 *               botId:
 *                 type: string
 *                 description: L'identifiant du bot à désactiver
 *                 example: chronopizza
 *     responses:
 *       200:
 *         description: Bot désactivé avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Bot disabled successfully
 *                 data:
 *                   type: object
 *                   description: Données renvoyées par l’API de Botpress
 *       400:
 *         description: Requête invalide (Bot ID manquant)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Bot ID is required
 *       500:
 *         description: Erreur serveur lors de la désactivation du bot
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to disable bot
 */
router.post("/desactiver-bot", controllers.controllers.desactiverBot);
/**
 * @swagger
 * /send-message-by-live-agent:
 *   post:
 *     summary: Send a message from a live agent via WhatsApp
 *     description: Sends a message (text or image) through the WhatsApp Business API as a live agent, if the bot is paused.
 *     tags:
 *       - Messages
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - type
 *               - content
 *               - id_conversation
 *               - botId
 *               - sessionId
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Recipient's phone number in international format
 *                 example: "212612345678"
 *               type:
 *                 type: string
 *                 enum: [text, image]
 *                 description: Type of the message
 *                 example: "text"
 *               content:
 *                 type: string
 *                 description: Message content (text or image URL)
 *                 example: "Hello, how can I help you?"
 *               id_conversation:
 *                 type: string
 *                 description: Conversation ID in the database
 *                 example: "abcd1234"
 *               botId:
 *                 type: string
 *                 description: Unique bot identifier
 *                 example: "bot_123456"
 *               sessionId:
 *                 type: string
 *                 description: User session ID
 *                 example: "session_7890"
 *     responses:
 *       200:
 *         description: Message sent successfully by live agent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       400:
 *         description: Missing or invalid input
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       403:
 *         description: Bot is active; live agent messages not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Phone number ID not found for the given bot
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       500:
 *         description: Server error while saving message or sending WhatsApp message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 */

router.post("/send-message-by-live-agent",authenticateToken, controllers.controllers.sendLiveAgentMessage);
/**
 * @swagger
 * /send-story:
 *   post:
 *     summary: Sends a story message and handles bot interaction
 *     description: |
 *       This endpoint sends a user message to a bot and forwards the bot's response
 *       to the appropriate messaging platform (WhatsApp, Facebook, or Instagram).
 *       It also manages conversation creation and message logging in the database.
 *     tags:
 *       - Messages
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messageText
 *               - userId
 *               - botId
 *               - ch
 *             properties:
 *               messageText:
 *                 type: string
 *                 description: The message content from the user.
 *                 example: "Hello, I need help"
 *               userId:
 *                 type: string
 *                 description: The user's phone number or unique ID.
 *                 example: "212600000000"
 *               botId:
 *                 type: string
 *                 description: The ID of the bot to send the message to.
 *                 example: "bot_12345"
 *               ch:
 *                 type: string
 *                 description: The communication channel (e.g., "wa", "fb", "ig").
 *                 example: "wa"
 *     responses:
 *       200:
 *         description: Message sent successfully and bot responses handled.
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *               example: "The story has been successfully sent✅"
 *       500:
 *         description: Server error or failed processing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 error: "Something went wrong while processing the request"
 */
router.post("/send-story", sendStoryapi);
/**
 * @swagger
 * /mots-clee:
 *   post:
 *     summary: Récupère les mots-clés (questions) liés à un bot spécifique sur Botpress
 *     description: |
 *       Cette route permet d'obtenir la liste des mots-clés (questions en français)
 *       associés à un bot donné via son ID depuis l'API de Botpress.
 *     tags:
 *       - Messages
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *                 description: L'identifiant du bot dans Botpress Studio
 *                 example: "b7b2b9e0-1234-5678-9abc-def123456789"
 *     responses:
 *       200:
 *         description: Liste des mots-clés récupérée avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *               example: ["mot-clé 1", "mot-clé 2"]
 *       400:
 *         description: Requête invalide (ID manquant)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "id is required!"
 *       404:
 *         description: Aucun mot-clé trouvé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "No keywords found"
 *       500:
 *         description: Erreur interne du serveur
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */
router.post("/mots-clee", motsClee)
module.exports = router;
