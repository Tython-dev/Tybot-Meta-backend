const express = require('express');
const dotenv = require('dotenv').config();
if (dotenv.error) {
  throw dotenv.error;
}
const fs = require('fs');
const FormData = require('form-data');
const bodyParser = require('body-parser');
const cors = require('cors');
const swaggerSpec = require("./src/config/swaggerConfig");
const swaggerUi = require("swagger-ui-express");
const app = express();
const port = process.env.PORT || 3009;
const templateroutes = require("./src/routes/templateRoutes");
const uploadFiles = require("./src/routes/metaUpload")
const { default: axios } = require('axios');
const multer = require('multer');
const { supabase } = require('./src/config/supabase');
const upload = multer({ dest: 'uploads/' });
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// CORS Configuration
const allowedOrigins = [
	"http://meta-api.tybot.ma",
  "http://localhost:5173"
];
const corsOptions = {
  origin: (origin, callback) => {
    console.log("Request Origin:", origin); 
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error("Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
};

app.use(cors(corsOptions));
// app.use(cors());


// Swagger setup
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/template',templateroutes)
app.use("/meta-upload", uploadFiles)



app.get('/', async (req, res) => {
  
    res.json({
        message: 'Hello, welcome to The Tybot-Meta APIs!',
        timestamp: new Date().toISOString()
    });

}
);
/**
 * @swagger
 * /chatbots/switch-bots:
 *   put:
 *     summary: Switch two chatbot botIds and their configurations
 *     description: >
 *       This endpoint swaps the `botId` between two chatbots and updates their corresponding configurations.
 *       Note that `botId` must be unique.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - botId1
 *               - botId2
 *             properties:
 *               botId1:
 *                 type: string
 *                 example: "arts-clinique"
 *               botId2:
 *                 type: string
 *                 example: "chronopizza"
 *     responses:
 *       200:
 *         description: BotIds and configurations switched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Bot IDs and configurations successfully swapped
 *       400:
 *         description: Bad Request - Missing or invalid input
 *       409:
 *         description: Conflict - Duplicate botId or integrity constraint violated
 *       500:
 *         description: Internal Server Error
 */

app.put('/chatbots/switch-bots', async (req, res) => {
  const { bot1, bot2, channel } = req.body;

  try {
    const tempId = "TEMP_" + Date.now();

    // Get both bots
    const [bot1Res, bot2Res] = await Promise.all([
      supabase.from("chatbots").select("id, name").eq("botId", bot1),
      supabase.from("chatbots").select("id, name").eq("botId", bot2)
    ]);

    const bot1Data = bot1Res.data?.[0];
    const bot2Data = bot2Res.data?.[0];

    if (!bot1Data || !bot2Data) {
      return res.status(404).json({ error: "One or both bots not found" });
    }

    //  Rename bot1 to temporary
    await supabase
      .from("chatbots")
      .update({ botId: tempId })
      .eq("botId", bot1);

    //Update bot2 to bot1's botId and name
    await supabase
      .from("chatbots")
      .update({ botId: bot1, name: bot1Data.name })
      .eq("botId", bot2);

    // Update temp (bot1) to bot2's botId and name
    await supabase
      .from("chatbots")
      .update({ botId: bot2, name: bot2Data.name })
      .eq("botId", tempId);

    // Get channel ID
    const channelRes = await supabase
      .from("channels")
      .select("id")
      .eq("name", channel);
    const id_channel = channelRes.data?.[0]?.id;

    // Get both config rows
    const configRes = await supabase
      .from("channels_config")
      .select("id, config, chat_id")
      .eq("channel_id", id_channel)
      .in("chat_id", [bot1Data.id, bot2Data.id]);

    const config1 = configRes.data?.find(c => c.chat_id === bot1Data.id);
    const config2 = configRes.data?.find(c => c.chat_id === bot2Data.id);

    // Swap configs
    await Promise.all([
      supabase.from("channels_config").update({ config: config2?.config }).eq("id", config1?.id),
      supabase.from("channels_config").update({ config: config1?.config }).eq("id", config2?.id)
    ]);

    return res.status(200).json({
      message: "Bots and configurations switched successfully",
      bots: { old_bot1: bot1, old_bot2: bot2 },
    });

  } catch (error) {
    console.error("Switch error:", error);
    return res.status(500).json({ error: "An error occurred while switching bots and configs." });
  }
});


app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
