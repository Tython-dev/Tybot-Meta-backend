const express = require('express');
const dotenv = require('dotenv').config();
if (dotenv.error) {
  throw dotenv.error;
}
const fs = require('fs');
const FormData = require('form-data');
const http = require("http");
const bodyParser = require('body-parser');
const cors = require('cors');
const swaggerSpec = require("./src/config/swaggerConfig");
const swaggerUi = require("swagger-ui-express");
const app = express();
const port = process.env.PORT || 3009;
const templateroutes = require("./src/routes/templateRoutes");
const meta = require("./src/routes/metaRoutes")
const uploadFiles = require("./src/routes/metaUpload")
const { default: axios } = require('axios');
const multer = require('multer');
const { supabase } = require('./src/config/supabase');
const { Server } = require('socket.io');
const upload = multer({ dest: 'uploads/' });
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// CORS Configuration
const allowedOrigins = [
	"http://meta-api.tybot.ma",
  "http://localhost:5173",
  "https://app.tybotflow.com"
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

// Socket.IO setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://chatflow.tybot.ma",
      "https://api.tybotflow.com",
      "https://api-dev.tybotflow.com",
      "https://app.tybotflow.com",
      "http://localhost:5500",
      "https://www.arts-casablanca.com",
      "https://artsclinic.com",
      "https://arts-clinic.com",
      "https://evmobility.tybotflow.com",
    ],
    methods: ["GET", "POST"],
  },
});

app.set("io", io); 
io.on("connection", (socket) => {
  console.log("Un utilisateur est connecté : " + socket.id);
  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    console.log(`🔗 User ${socket.id} joined room: ${roomId}`);
  });
});
// Swagger setup
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/template',templateroutes)
app.use("/meta-upload", uploadFiles)
app.use("/", meta)


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


// auth.routes.js

const APP_ID = "729458686305583";
const APP_SECRET = "ee9c08dd93701434f5800379220d3612";
const REDIRECT_URI = "https://app.tybotflow.com/login";

app.get("/facebook/login", (req, res) => {
  const redirectUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=pages_show_list,pages_manage_metadata,pages_messaging,pages_read_engagement`;
  res.redirect(redirectUrl);
});

app.get("/auth/facebook/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code from Facebook");

  try {
    // Step 1: Get user access token
    const tokenRes = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
      params: {
        client_id: process.env.FB_APP_ID,
        redirect_uri: REDIRECT_URI,
        client_secret: process.env.FB_APP_SECRET,
        code,
      },
    });

    const userAccessToken = tokenRes.data.access_token;

    // Step 2: Get pages managed by the user
    const pagesRes = await axios.get("https://graph.facebook.com/me/accounts", {
      params: { access_token: userAccessToken },
    });

    const pages = pagesRes.data.data;

    // ➕ (Optionnel) Sauvegarder en base ou rediriger vers frontend
    res.json({
      message: "Pages retrieved successfully",
      pages,
    });

  } catch (error) {
    console.error("OAuth callback error:", error.response?.data || error.message);
    res.status(500).send("OAuth callback failed");
  }
});




server.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
