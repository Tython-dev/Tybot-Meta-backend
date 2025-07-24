const { supabase } = require("../config/supabase");
const verifyStatus = require("../middleware/verifyStatus");
const {  getToken, getChannelID, getUserSession } = require("./controllers");
const Redis = require("ioredis");
const handleFacebookMsg = require("./handleFacebookMessages");
const handleMsg = require("./handleWhatsAppMsg");
const { waApi } = require("./whatsappApi");
const { fbapi } = require("./facebookApi");
const { default: axios } = require("axios");
const handleIgMsg = require("./handleInstagramMsg");
const redis = new Redis({
 host: "82.112.241.117", // ✅ just the IP
  port: 6379,             // ✅ separate port
  db: 10,                 // ✅ optional: select DB 10
});
redis.on("connect", () => {
  console.log("✅ Connected to Redis");
});

redis.on("error", (err) => {
  console.error("❌ Redis connection error:", err);
});

const getBotId = async (numberId, channel_id) => {
  try {
    const response = await supabase
      .from('channels_config')
      .select(`
        *,
        chatbots ( botId )
      `)
      .eq('channel_id', channel_id);

    if (response.error) {
      console.error('Supabase error:', response.error);
      return null;
    }

    const bot = response.data.find(item =>
      item.config?.phone_number_id === numberId ||
      item.config?.id_page === numberId
    );

    if (!bot || !bot.chatbots) {
      console.warn("Bot config not found or missing botId.");
      return null;
    }

    return { bot: bot.chatbots, config: bot };
  } catch (error) {
    console.error('Error while getting bot ID:', error);
    return null;
  }
};

exports.sendMsgTOBotpress = async (payload, messageText, botId, phone) => {
  console.log("Sending to Botpress with payload:", JSON.stringify(payload, null, 2));

  const msgToBotpress = {
    type: "text",
    text: messageText,
    payload: payload ? JSON.parse(payload) : null
  };

  console.log('msgToBotpress:', msgToBotpress);
const token = getToken();
  try {
    const botpressRes = await axios.post(
      `https://botpress.tython.org/api/v1/bots/${botId}/converse/${phone}/secured`,
      msgToBotpress,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const botResponses = Array.isArray(botpressRes.data.responses)
      ? botpressRes.data.responses
      : [{
          type: "text",
          text: "Server is busy, please try again later!"
        }];

    return botResponses;

  } catch (error) {
    console.error("❌ Error sending to Botpress:", error.message);
    return [{
      type: "text",
      text: "We encountered a problem. Please try again later."
    }];
  }
};

exports.metaApi = async (req, res) => {
  const { v } = req.params;
  res.status(200).send('EVENT_RECEIVED');

  try {
    // const io = req.app.get("io");
    let messageText, payload, userId, userName, numberId, channel, message, meta_token;

    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const contact = value?.contacts?.[0];
    userName = contact?.profile.name || null;
    const timestamp = entry?.messages?.[0]?.changes?.[0]?.timestamp || entry?.messaging?.[0]?.timestamp;
    message = value?.messages?.[0] || req.body.entry[0]?.messaging?.[0]?.message;
    const msgID = message?.id || null;
    const object = req.body.object;
    userId = contact?.wa_id || req.body.entry?.[0].messaging?.[0]?.sender?.id;
    numberId = value?.metadata?.phone_number_id || entry?.id;

    channel = object.includes("whatsapp")
      ? "whatsapp"
      : object.includes("page")
      ? "facebook"
      : "instagram";

    // Get channelId & bot config in parallel
    const [channelId, getId] = await Promise.all([
      getChannelID(channel),
      getBotId(numberId, await getChannelID(channel))
    ]);
    console.log("getBot:", getId)
    const botId = getId.bot?.botId;
    meta_token = getId.config?.config?.token;

    if (!botId || !meta_token) {
      console.warn("Missing botId or token.");
      return;
    }

    // Parse message depending on channel
    if (channel === "whatsapp") {
      const result = await handleMsg(message, meta_token, v);
      messageText = result.messageText;
      payload = result.payload;
    } else if (channel === "facebook") {
      const result = await handleFacebookMsg(req.body.entry[0]?.messaging[0]?.message, meta_token);
      messageText = result.messageText;
      payload = req.body.entry[0]?.messaging[0]?.postback?.payload;
      if (!req.body.entry[0]?.messaging[0]?.message) {
        messageText = req.body.entry[0]?.messaging[0]?.postback?.title;
      }
    } else {
      const result = await handleIgMsg(req.body.entry[0]?.messaging[0]?.message, meta_token);
      messageText = result.messageText;
      payload = req.body.entry[0]?.messaging[0]?.postback?.payload;
      if (!req.body.entry[0]?.messaging[0]?.message) {
        messageText = req.body.entry[0]?.messaging[0]?.postback?.title;
      }
    }

    if (!userId) return res.status(200).json('user undefined');

    // Upsert user and fetch conversation in parallel
    const [userRes, convoRes] = await Promise.all([
      supabase.from("end_users").upsert({ phone: userId, username: userName }, { onConflict: "phone" }),
      supabase
        .from("conversations")
        .select("id")
        .eq("bot_id", botId)
        .eq("end_user_id", userId)
        .single()
    ]);

    if (userRes.error) console.error("❌ Failed to upsert user:", userRes.error);

    let conversationId;

    if (convoRes.data) {
      conversationId = convoRes.data.id;
      await supabase.from("conversations").update({ updated_at: new Date() }).eq("id", conversationId);
    } else {
      const { data: newConvo, error: newConvoError } = await supabase
        .from("conversations")
        .insert({
          bot_id: botId,
          end_user_id: userId,
          channel_id: channelId,
          start_time: new Date(),
          updated_at: new Date(),
        })
        .select("id")
        .single();

      if (newConvoError) {
        console.error("❌ Error creating conversation:", newConvoError.message);
        return;
      }

      conversationId = newConvo.id;
      io.emit("new_conversation", {
        conversation: {
          end_user_id: userId,
          bot_id: botId,
          created_at: new Date(),
          channel_name: channel,
          id: conversationId,
        },
      });
    }

    // Redis store session & message with pipeline
    const key = `session:${conversationId}`;
    const messageKey = `${key}:messages`;
    const existed = await redis.get(key);
    const sessionData = existed
      ? { ...JSON.parse(existed), time: timestamp }
      : {
          end_user_id: userId,
          userName,
          botId,
          channel: channelId,
          time: timestamp,
        };

    const pipeline = redis.pipeline();
    pipeline.set(key, JSON.stringify(sessionData), 'EX', 2 * 60 * 60);
    pipeline.rpush(messageKey, JSON.stringify({
      sender_id: userId,
      sender_type: "user",
      content: messageText,
      sent_at: timestamp || new Date(),
      is_read: false,
    }));
    pipeline.expire(messageKey, 2 * 60 * 60);
    await pipeline.exec();

    // io.to(conversationId).emit("new-message", {
    //   user: { from: userId, userMessage: messageText },
    // });

    // Retrieve user session and bot status
    const userSession = await getUserSession(userId, botId);
    const botStatus = userSession?.data?.isPaused || false;
    if (botStatus) return res.status(200).json("your message was sent!");

    // Send message to Botpress
    const botpressResponses = await this.sendMsgTOBotpress(payload, messageText, botId, userId);
    console.log('botpress responses:', botpressResponses);

    let result;
    const botPipeline = redis.pipeline();

    for (const item of botpressResponses) {
      // io.to(conversationId).emit("new-message", {
      //   bot: { conversationId, botId, item }
      // });

      const msgData = {
        sender_id: botId,
        sender_type: "bot",
        content: item,
        sent_at: new Date().toISOString(),
        is_read: false,
      };

      botPipeline.rpush(messageKey, JSON.stringify(msgData));
      botPipeline.expire(messageKey, 2 * 60 * 60);

      if (channel === "whatsapp") {
        result = await waApi({ item, version: v, token: meta_token, userPhone: userId, waPhone: numberId, msgID });
      } else if (channel === "facebook") {
        result = await fbapi({ item, version: v, token: meta_token, userPhone: userId, pageId: numberId });
      }
    }

    await botPipeline.exec();

     console.log(result || "No response sent.");
  } catch (error) {
    console.log("❌ error in metaApi:", error);
    // return res.status(500).json(error.message || "Server error");
  }
};

