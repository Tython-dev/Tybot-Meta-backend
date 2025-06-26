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




app.get('/', async (req, res) => {
  
    res.json({
        message: 'Hello, welcome to The Tybot-Meta APIs!',
        timestamp: new Date().toISOString()
    });

}
);
app.post('/upload-template-image', upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file.path;
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('type', 'image/jpeg');
    form.append('messaging_product', 'whatsapp');

    const { data } = await axios.post(
      `https://graph.facebook.com/v19.0/<WABA_ID>/media`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${process.env.FB_ACCESS_TOKEN}`
        }
      }
    );

    res.json({ media_id: data.id });
  } catch (err) {
    console.error("Upload failed:", err);
    res.status(500).json({ error: 'Upload failed' });
  }
});
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
    // 1. Update chatbots: swap botIds
    // Step 1: Temporarily rename bot1
const tempId = "TEMP_SWAP_ID_" + Date.now();

const updateBot1 = await supabase
  .from("chatbots")
  .update({ botId: tempId })
  .eq("botId", bot1)
  .select("id");

// Step 2: Update bot2 to bot1
const updateBot2= await supabase
  .from("chatbots")
  .update({ botId: bot1 })
  .eq("botId", bot2)
  .select("id");

// Step 3: Update temp (was bot1) to bot2
await supabase
  .from("chatbots")
  .update({ botId: bot2 })
  .eq("botId", tempId)
  .select("id");

      
      const id_bot1 = updateBot1.data?.[0]?.id;
    const id_bot2 = updateBot2.data?.[0]?.id;

    // 2. Get channel ID by name
    const channelRes = await supabase
      .from("channels")
      .select("id")
      .eq("name", channel);

    const id_channel = channelRes.data?.[0]?.id;
console.log(updateBot1,id_bot1,updateBot2, id_bot2)
    // 3. Get configuration for both bots
    const configRes = await supabase
      .from("channels_config")
      .select("id, config, chat_id")
      .eq("channel_id", id_channel)
      .in("chat_id", [id_bot1, id_bot2]);
console.log('configRes:', configRes)
    const config1 = configRes.data?.find(c => c.chat_id === id_bot1);
    const config2 = configRes.data?.find(c => c.chat_id === id_bot2);

    // 4. Swap the configs
    const updateConfig1 = await supabase
      .from("channels_config")
      .update({ config: config2?.config })
      .eq("id", config1?.id);

    const updateConfig2 = await supabase
      .from("channels_config")
      .update({ config: config1?.config })
      .eq("id", config2?.id);

    return res.status(200).json({
      message: "Bots and configurations switched successfully",
      bots: { bot1, bot2 },
      configs: { config1: config2?.config, config2: config1?.config },
    });

  } catch (error) {
    console.error("Switch error:", error);
    return res.status(500).json({ error: "An error occurred while switching bots and configs." });
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
