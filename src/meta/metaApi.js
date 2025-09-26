const { v4: uuidv4 } = require("uuid");
const { default: axios } = require("axios");
const check = require("../middleware/redisstatus");
const redis = require("../config/redis");
const { waApi } = require("./whatsappApi");
const handleFacebookMsg = require("./handleFacebookMessages");
const handleMsg = require("./handleWhatsAppMsg");
const { fbapi } = require("./facebookApi");
const { supabase } = require("../config/supabase");
const { telegramApi } = require("./telegramApi");
const handleTelegram = require("./handletelegramMsg");
const handleIgMsg = require("./handleInstagramMsg");

redis.on("connect", () => {
  console.log("✅ Connected to Redis");
});

redis.on("error", (err) => {
  console.error("❌ Redis connection error:", err);
});
exports.getbotpressInfo =async ()=>{
  try{
  const response =  await supabase
.from("bot_tokens")
.select("*")
.limit(1)
if(response.error){
  console.error(response.error)
  return null;
}
if(response.data.length === 0){
  console.error("no botpress infos found!")
  return null;
}
return response.data[0]
  }catch(error){
    console.log(error)
    return null;
  }
}
exports.getBotId = async (numberId, channel_id) => {
  try {
    console.log(numberId, channel_id);

    const response = await supabase
      .from('channels_config')
      .select('*')
      .eq('channel_id', channel_id);

    if (response.error) {
      console.error('Supabase error:', response.error);
    }

    if (!response.data || response.data.length === 0) {
      console.warn('No bot config found for this channel.');
    }

    const bot = response.data.find(item =>
      item.config?.phone_number_id === numberId ||
      item.config?.id_page === numberId
    );

    if (!bot) {
      console.warn("Bot config not found for this numberId.");
      return null;
    }

    const getBot = await supabase
      .from("chatbots")
      .select("botId")
      .eq("id", bot.chat_id);

    if (getBot.error) {
      console.error("Error fetching bot:", getBot.error);
    }

    if (!getBot.data || getBot.data.length === 0) {
      console.warn("Bot not found in 'chatbots' table.");
    }

    console.log("bot_id:", getBot.data[0], numberId);

    return { bot: getBot.data[0], config: bot };

  } catch (error) {
    console.error('Error while getting bot ID:', error);
  }
};


exports.getChannelID = async(channel)=>{
  try{
    const { data: channelData, error: channelError } = await supabase
            .from("channels")
            .select("id")
            .eq("name", channel);
        if (channelError || !channelData) {
            console.log("No channel found for:", channel);
            return ("Channel not found");
        }
        return channelData[0].id;
}catch(error){
  return (error)
}
}
exports.sendMsgTOBotpress = async (payload, messageText, botId, phone, ch) => {
  const botpressInfo = await this.getbotpressInfo();
  const botpress_url = botpressInfo.botpress_url;
  const botpress_token = botpressInfo.token;

let parsedPayload;
if (typeof payload === "string") {
  try {
    parsedPayload = JSON.parse(payload); // parse only if valid JSON
  } catch (err) {
    parsedPayload = payload; // fallback: plain string
  }
} else {
  parsedPayload = payload; // already an object
}

const msgToBotpress = {
  type: "text",
  text: messageText,
  ...(parsedPayload ? { payload: parsedPayload } : {}),
};



if (messageText === null) {
  return [
    {
      type: "text",
      text: "Message type not supported!",
    },
  ];
}


  try {
    const botpressRes = await axios.post(`${botpress_url}/api/v1/bots/${botId}/converse/${phone}-${ch}/secured`
      ,
      msgToBotpress,
      {
        headers: {
          Authorization: `Bearer ${botpress_token}`
        },
        timeout: 10000
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
    console.error("❌ Error sending to Botpress:", error);
    return [{
      type: "text",
      text: "Lots of requests,let's start again 😊."
    }];
  }
};
exports.getUserSession = async(userId, botId, ch) => {
  try {
    const botpress = await this.getbotpressInfo();

    const response = await axios.get(`${botpress.botpress_url}/api/v1/bots/${botId}/mod/hitl/sessions?pausedOnly=false`, {
      headers: {
        Authorization: `Bearer ${botpress.token}`,
      },
      timeout: 5000
    });

    const allSessions = response.data;

    // Log all users in sessions for debug
    console.log("📦 All session users:", allSessions.map(s => s.user));
    let sessionInfo;
     sessionInfo = allSessions.find((session) => session.user.id === `${userId}-${ch}`);

    if (!sessionInfo) {
       sessionInfo = allSessions.find((session) => session.user.id === `${userId}`);

      if (!sessionInfo) console.warn("⚠️ No session found for user:", userId);
    }

    return {
      message: sessionInfo ? "Session retrieved successfully" : "Session not found",
      data: sessionInfo || null
    };

  } catch (err) {
    console.error("❌ Error getting sessions:", err);
    return { error: err.message || err };
  }
};


exports.metaApi = async (req, res) => {
  const { v } = req.params;
  
  // Acknowledge webhook immediately
  res.status(200).send("EVENT_RECEIVED");

  try {
    const io = req.app.get("io");
    if (!io) {
      console.warn("Socket.io not available - continuing without real-time updates");
    }
    console.log("body:", JSON.stringify(req.body));

    let messageText, payload, userId, userName, numberId, channel, message, meta_token, ch;

    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const contact = value?.contacts?.[0];
    userName = contact?.profile?.name || req.body.callback_query?.from?.first_name || req.body.message?.from?.first_name || req.body.from?.first_name || null;
    userId = contact?.wa_id || req.body?.entry?.[0]?.messaging?.[0]?.sender?.id ||req.body.callback_query?.from?.id || req.body.message?.from?.id|| req.body.from?.id;
    numberId = value?.metadata?.phone_number_id || entry?.id;
    const object = req.body.object;
let redisIsHealthy = false;
// Non-blocking Redis health check
redis.ping().then(pong => {
  redisIsHealthy = pong === "PONG";
}).catch(error => {
  console.error("Redis health check failed:", error.message);
  redisIsHealthy = false;
});
console.log("entry here:", JSON.stringify(value?.messages?.[0], null, 2))
    // Detect channel
    if(object){
    if (object.includes("whatsapp")) {
      channel = "whatsapp";
      ch= "wa";
    } else if (object.includes("page")) {
      channel = "facebook";
      ch = "fb";
    } else if(object.includes("instagram")){
      ch = "ig";
      channel = "instagram";
    }}
     else{
      channel = "telegram";
      ch = "tm";
    }
    if(channel === "telegram"){
      numberId = v
    }
    const channelId = await this.getChannelID(channel);
    const getId = await this.getBotId(numberId, channelId);
    
    if (!getId?.bot?.botId) {
      console.error("Bot ID not found for numberId:", numberId);
      return;
    }
    
    console.log('bot_id:', getId)
    const botId = getId.bot.botId;
    meta_token = getId?.config?.config?.token;
    

    message = value?.messages?.[0] || req.body?.entry?.[0]?.messaging?.[0]?.message || req.body;
    const timestamp = message?.timestamp || req.body?.entry?.[0]?.messaging?.[0]?.timestamp;
    const msgID = message?.id || uuidv4(); // Generate unique msg_id if missing

    // Extract messageText & payload based on channel with timeout
    try {
      if (channel === "whatsapp") {
        const result = await Promise.race([
          handleMsg(message, meta_token, v),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Handler timeout')), 20000))
        ]);
        messageText = result.messageText;
        payload = result.payload;
      } else if (channel === "facebook") {
        const fbMessage = req.body?.entry?.[0]?.messaging?.[0];
        const result = await Promise.race([
          handleFacebookMsg(fbMessage?.message, meta_token),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Handler timeout')), 20000))
        ]);
        messageText = result.messageText || fbMessage?.postback?.title || "";
        payload = fbMessage?.postback?.payload || result.payload;
      }else if(channel === "telegram"){
        const result = await Promise.race([
          handleTelegram(message, meta_token),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Handler timeout')), 20000))
        ]);
        messageText = result.messageText;
        payload = result.payload;
      }
      else {
        const igMessage = req.body?.entry?.[0]?.messaging?.[0];
        const result = await Promise.race([
          handleIgMsg(igMessage?.message, meta_token),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Handler timeout')), 20000))
        ]);
        messageText = result.messageText || igMessage?.postback?.title || "";
        payload = igMessage?.postback?.payload || result.payload;
      }
    } catch (error) {
      console.error("Message handler timeout or error:", error.message);
      messageText = "Processing timeout - please try again";
      payload = null;
    }

    if (!userId) {
      console.warn("User ID not found in request");
      return;
    }

    // Upsert user
    const { error: userError } = await supabase.from("end_users").upsert(
      {
        phone: userId,
        username: userName,
      },
      { onConflict: "phone" }
    );

    if (userError) console.error("❌ Failed to upsert user:", userError);
    
// Non-blocking Redis operations
redis.del("end_users").catch(error => {
  console.error("Redis del failed:", error.message);
});

    // Get or create conversation
    let conversationId;
    const { data: convoData, error: convoError } = await supabase
      .from("conversations")
      .select("id")
      .eq("bot_id", botId)
      .eq("end_user_id", userId)
      .single();

    if (convoError && convoError.code !== "PGRST116") {
      console.error("❌ Error fetching conversation:", convoError.message);
    }

    if (convoData) {
      conversationId = convoData.id;
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

      conversationId = newConvo?.id;

      if (!conversationId) {
        console.error("Failed to create conversation");
        return;
      }

      if (io) {
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

      console.log("🆕 New conversation ID:", conversationId);
    }

    if (!conversationId) {
      console.error("No valid conversation ID");
      return;
    }

    const key = `session:${conversationId}`;
    const messageKey = `${key}:messages`;

    // Non-blocking Redis session set
    const sessionData = {
      end_user_id: userId,
      userName,
      botId,
      channel: channelId,
      time: timestamp,
    };
    redis.set(key, JSON.stringify(sessionData), "EX", 24 * 60 * 60).catch(error => {
      console.error("Redis set session failed:", error.message);
    }); 

    // Push user message with msg_id
    const userMsgData = {
      msg_id: msgID,
      sender_id: userId,
      sender_type: "user",
      content: messageText,
      sent_at: new Date().toISOString(),
      is_read: false,
    };
    
    // Non-blocking check function
    check({sender_id: userId,
      sender_type: "user",
      content: messageText,
      sent_at: new Date().toISOString(),
      is_read: false,},conversationId, redisIsHealthy).catch(error => {
        console.error("Check function failed:", error.message);
      });
      
    // Non-blocking Redis user message push
    redis.rpush(messageKey, JSON.stringify(userMsgData)).catch(error => {
      console.error("Redis rpush user message failed:", error.message);
    });
    
    if (io) {
      io.to(conversationId).emit("new-message", {
        user: { from: userId, userMessage: messageText },
      });
    }

    // Bot paused check
    const userSession = await this.getUserSession(userId, botId, ch);
    const botStatus = userSession?.data?.isPaused || false;
    if (botStatus) {
      console.info("Bot is paused for user:", userId);
      return;
    }

    // Send message to botpress after session setup
    const botpressResponses = await this.sendMsgTOBotpress(payload, messageText, botId, userId, ch);

    let result;
    for (const item of botpressResponses) {
      if (io) {
        io.to(conversationId).emit("new-message", {
          bot: { conversationId, botId, item },
        });
      }

      const botMsgData = {
        msg_id: uuidv4(),
        sender_id: botId,
        sender_type: "bot",
        content: item,
        sent_at: new Date().toISOString(),
        is_read: false,
      };
      // Non-blocking check function
      check({
        sender_id: botId,
        sender_type: "bot",
        content: item,
        sent_at: new Date().toISOString(),
        is_read: false,
      },conversationId, redisIsHealthy).catch(error => {
        console.error("Check function failed:", error.message);
      });
      // Non-blocking Redis bot message operations
      redis.rpush(messageKey, JSON.stringify(botMsgData)).catch(error => {
        console.error("Redis rpush bot message failed:", error.message);
      });
      redis.expire(messageKey, 24 * 60 * 60).catch(error => {
        console.error("Redis expire failed:", error.message);
      });

     

      if (channel === "whatsapp") {
        result = await waApi({ item, version: v, token: meta_token, userPhone: userId, waPhone: numberId, msgID });
      } else if (channel === "facebook") {
        result = await fbapi({ item, version: v, token: meta_token, userPhone: userId, pageId: numberId });
      }else if(channel === "telegram"){
        result = await telegramApi({item, token:meta_token, phone: userId})
      }
    }

    // Optional non-blocking Redis logging
    redis.get(key).then(cachedData => {
      console.log("🔒 Cached session data:", cachedData);
    }).catch(error => {
      console.error("Redis get cached data failed:", error.message);
    });

  } catch (error) {
    console.error("❌ Error processing webhook:", error);
  }
};