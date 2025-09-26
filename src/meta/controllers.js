const { default: axios} = require("axios");

const check = require("../middleware/redisstatus");
const { getUserSession } = require("./metaApi");
const redis = require("../config/redis");
const { supabase } = require("../config/supabase");

require("dotenv")


exports.getbotpressInfo = async () => {
  try {
    const response = await supabase
      .from("bot_tokens")
      .select("*")
      .limit(1)
    if (response.error) {
      console.error(response.error)
      return null;
    }
    if (response.data.length === 0) {
      console.error("no botpress infos found!")
      return null;
    }
    return response.data[0]
  } catch (error) {
    console.log(error)
    return null;
  }
}
const getBotStatus = async (token, botId) => {
  try {
    const response = await axios.get(`https://botpress.tython.org/api/v1/studio/${botId}/config`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    console.log("Response from Botpress:", response.data);
    return response.data.disabled;
  } catch (err) {
    console.error("Error getting bot status:", err);
    // return res.status(500).json({ error: err });
  }
}
exports.getToken = async () => {
  try {
    // const response = await axios.post("https://botpress.tython.org/api/v1/auth/login/basic/default",{
    //     "email":"chatbot@tython.org",
    //     "password": "Tython12345(@#)"
    // })
    // console.log("Response from Botpress:", response.data);
    // return response.data.payload.jwt;
    const response = await supabase
      .from('bot_tokens')
      .select('token')
    if (response.error) {
      console.log(response.error)
    }
    console.log(response)
    return response.data[0].token
  } catch (err) {
    console.error("Error getting token:", err);
  }
}
exports.getSessions = async (req, res) => {
  const { botId } = req.body;
  const { pausedOnly } = req.query || false;
  if (!botId) {
    return res.status(400).json({ error: "BotId is required!" });
  }
  try {
    const botpress = await this.getbotpressInfo();

    const response = await axios.get(`${botpress.botpress_url}/api/v1/bots/${botId}/mod/hitl/sessions?pausedOnly=${pausedOnly}`, {
      headers: {
        Authorization: `Bearer ${botpress.token}`,
      },
    })
    // console.log("Response from Botpress:", response.data);
    return res.status(200).json({ message: "Sessions retrieved successfully", data: response.data });
  } catch (err) {
    console.error("Error getting sessions:", err);
    return res.status(500).json({ error: err });
  }
}



exports.controllers = {
  webhook: async (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    // const { botId } = req.params; 

    if (!mode || !token) return res.sendStatus(400);

    try {
      // const VERIFY_TOKEN = botId; 
      // const isValidToken = token === VERIFY_TOKEN;

      if (mode === "subscribe") {
        console.log("WEBHOOK_VERIFIED");
        return res.status(200).send(challenge);
      } else {
        return res.sendStatus(403);
      }
    } catch (err) {
      console.error("Unexpected error in webhook:", err.message);
      return res.sendStatus(500);
    }
  }
  ,
  desactiverBot: async (req, res) => {
    const { botId, disabled } = req.body;
    if (!botId) {
      return res.status(400).json({ error: "BotId and disabled are required!" });
    }
    // const token = await getToken(req, res);
    try {
      const botpress = await this.getbotpressInfo();
      const response = await axios.post(
        `${botpress.botpress_url}/api/v1/studio/${botId}/config`,
        { disabled },
        {
          headers: {
            Authorization: `Bearer ${botpress.token}`,
          },
        }
      );
      if (response.status === 200) {
        await supabase
          .from("chatbots")
          .update({ is_active: !disabled })
          .eq("botId", botId);
      }
      return res.status(200).json({ message: "Bot updated successfully", data: response.data });
    } catch (error) {
      console.error("Error disabling bot:", error);
      return res.status(500).json({ error: "Failed to disable bot" });
    }
  },
  desactiverSession: async (req, res) => {
    const { botId, user_phone, is_paused } = req.body;

    if (!botId || !user_phone) {
      return res.status(400).json({ error: "botId and user_phone are required!" });
    }

    try {
      // 1. Get conversation with channel
      const { data: convoData, error: convoError } = await supabase
        .from("conversations")
        .select("*, channels(name)")
        .eq("end_user_id", user_phone)
        .eq("bot_id", botId);
      console.log('here:', convoData, convoError)
      if (convoError) return res.status(400).json(convoError);
      if (!convoData || convoData.length === 0) {
        return res.status(404).json("conversation not found!");
      }

      const channel_name = convoData[0].channels?.name || "";
      let channel, ch;

      if (channel_name.includes("whatsapp")) {
        channel = "whatsapp"; ch = "wa";
      } else if (channel_name.includes("page")) {
        channel = "facebook"; ch = "fb";
      } else if (channel_name.includes("instagram")) {
        channel = "instagram"; ch = "ig";
      } else {
        channel = "telegram"; ch = "tm";
      }

      // 2. Get session
      const sessionId = await getUserSession(user_phone, botId, ch);
      if (!sessionId || !sessionId.data?.id) {
        return res.status(404).json({ error: "Session not found!" });
      }

      // 3. Pause/unpause logic
      const action = is_paused ? "unpause" : "pause";

      const botpress = await this.getbotpressInfo();
      const url = `${botpress.botpress_url}/api/v1/bots/${botId}/mod/hitl/sessions/${sessionId.data.id}/${action}`;

      const response = await axios.post(url, {}, {
        headers: { Authorization: `Bearer ${botpress.token}` }
      });

      if (response.status === 200) {
        const { error: updateError } = await supabase
          .from("conversations")
          .update({ is_active: !is_paused })
          .eq("bot_id", botId)
          .eq("end_user_id", user_phone);

        if (updateError) {
          console.error("Supabase update error:", updateError);
          return res.status(500).json({ error: "Failed to update conversation state" });
        }
      }

      return res.status(200).json({
        message: "Conversation updated successfully",
        data: response.data
      });
    } catch (err) {
      console.error("Error disabling session:", err);
      return res.status(500).json({ error: "Failed to update session" });
    }
  },

  sendLiveAgentMessage: async (req, res) => {
    const io = req.app.get("io");
    const { phone, type, content, id_conversation, botId } = req.body;

    if (!phone || !type || !content || !id_conversation || !botId) {
      return res.status(400).json({
        error: "Missing required fields: phone, type, content, id_conversation, botId",
      });
    }
    let redisIsHealthy = false;
    try {
      const pong = await redis.ping();
      redisIsHealthy = pong === "PONG";
    } catch (error) {
      console.error("Redis health check failed:", error.message);
    }
    try {
      // 1. Get conversation details
      const { data: convData, error: convError } = await supabase
        .from("conversations")
        .select("id, channel_id, channels(name), chatbots(id)")
        .eq("bot_id", botId)
        .eq("id", id_conversation);

      if (convError) return res.status(400).json(convError);
      if (!convData?.length) {
        return res.status(404).json({ error: "Conversation not found!" });
      }

      const conversation = convData[0];
      const channel = conversation.channel_id;
      const chName = conversation.channels?.name || "unknown";
      const chat_id = conversation.chatbots?.id;


      // 3. Handle web channel (Botpress HITL)
      if (chName === "web") {
        const { botpress_url, token } = await this.getbotpressInfo();
        const session = await getUserSession(phone, botId, "wb");
        const sessionId = session?.data?.id;

        if (!sessionId) return res.status(404).json({ error: "Botpress session not found!" });
        console.log('sesions:', session)
        const response = await axios.post(
          `${botpress_url}/api/v1/bots/${botId}/mod/hitl/sessions/${sessionId}/message`,
          { message: content },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        await saveMessageToRedis(id_conversation, phone, botId, channel, content, req.user, redis);

        io.to(id_conversation).emit("new-message", {
          live_agent: { conversation_id: id_conversation, from: req.user, userMessage: content },
        });

        return res.status(200).json({
          message: "Web live agent message sent successfully",
          data: response.data,
        });
      }

      // 4. Handle external channels (WhatsApp/Facebook)
      const { data: configData, error: configError } = await supabase
        .from("channels_config")
        .select("config")
        .eq("chat_id", chat_id)
        .eq("channel_id", channel)
        .eq("is_deleted", false);

      if (configError) return res.status(400).json(configError);
      if (!configData?.length) {
        return res.status(404).json({ error: "No config found for this bot & channel" });
      }

      const { token, phone_number_id, id_page } = configData[0].config;

      // build WhatsApp/Facebook body
      let messageBody;
      if (type === "text") {
        messageBody = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone,
          type,
          text: { preview_url: false, body: content },
        };
      } else if (type === "image") {
        messageBody = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone,
          type,
          image: { link: content },
        };
      } else {
        return res.status(400).json({ error: `Unsupported message type: ${type}` });
      }

      const response = await axios.post(
        `https://graph.facebook.com/${id_page || phone_number_id}/messages`,
        messageBody,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );

      if (redisIsHealthy) {
        await saveMessageToRedis(id_conversation, phone, botId, channel, content, req.user, redis);
      } else {
        await check({
          sender_id: req.user,
          sender_type: "live_agent",
          content: content,
          sent_at: new Date().toISOString(),
          is_read: false,
        }, id_conversation, redisIsHealthy)
      }

      io.to(id_conversation).emit("new-message", {
        live_agent: { conversation_id: id_conversation, from: req.user, userMessage: content },
      });

      return res.status(200).json({
        message: "External live agent message sent successfully",
        data: response.data,
      });
    } catch (err) {
      console.error("❌ Error sending live agent message:", err);
      return res.status(500).json({ error: err.response?.data || err.message });
    }
  },
}
// helper (same as lvMsg)
async function saveMessageToRedis(conversation_id, userId, botId, channelId, message, sender, redis) {
  const key = `session:${conversation_id}`;
  const messageKey = `${key}:messages`;

  const existed = await redis.get(key);
  if (existed) {
    const parsed = JSON.parse(existed);
    parsed.time = new Date();
    await redis.set(key, JSON.stringify(parsed), "EX", 24 * 60 * 60);
  } else {
    const data = { end_user_id: userId, userName: null, botId, channel: channelId, time: new Date() };
    await redis.set(key, JSON.stringify(data), "EX", 24 * 60 * 60);
  }

  await redis.rpush(
    messageKey,
    JSON.stringify({
      sender_id: sender?.sub || "unknown",
      sender_type: "live_agent",
      content: message,
      sent_at: new Date(),
      is_read: true,
    })
  );
}




