const { v4: uuidv4 } = require("uuid");

const { default: axios } = require("axios");
// const handleIgMsg = require("./handleInstagramMsg");
// const handleTelegram = require("./handletelegramMsg");
// const { telegramApi } = require("./telegramApi");
const check = require("../middleware/redisstatus");
const redis = require("../config/redis");
const { waApi } = require("./whatsappApi");
const handleFacebookMsg = require("./handleFacebookMessages");
const handleMsg = require("./handleWhatsAppMsg");
const { fbapi } = require("./facebookApi");
const { supabase } = require("../config/supabase");

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
  console.log("Sending to Botpress with payload:", JSON.stringify(payload, null, 2));
const botpressInfo = await this.getbotpressInfo();
const botpress_url = botpressInfo.botpress_url;
const botpress_token = botpressInfo.token;
console.log("here the payload:", { text: messageText, payload });

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

console.log("msgToBotpress:", JSON.stringify(msgToBotpress));

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
        }
      }
    );
console.log('response bot:',botpressRes)
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
  console.log("👉 getUserSession called with:", userId, botId); 

  // const token = await this.getToken();

  try {
const botpress = await this.getbotpressInfo();

    const response = await axios.get(`${botpress.botpress_url}/api/v1/bots/${botId}/mod/hitl/sessions?pausedOnly=false`, {
      headers: {
        Authorization: `Bearer ${botpress.token}`,
      },
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
  res.status(200).send("EVENT_RECEIVED");

  try {
    const io = req.app.get("io");
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
try {
  const pong = await redis.ping();
  redisIsHealthy = pong === "PONG";
} catch (error) {
  console.error("Redis health check failed:", error.message);
}
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
    console.log('bot_id:', getId)
    const botId = getId?.bot?.botId;
    meta_token = getId?.config?.config?.token;
    

    message = value?.messages?.[0] || req.body?.entry?.[0]?.messaging?.[0]?.message || req.body;
    const timestamp = message?.timestamp || req.body?.entry?.[0]?.messaging?.[0]?.timestamp;
    const msgID = message?.id || uuidv4(); // Generate unique msg_id if missing

    // Extract messageText & payload based on channel
    if (channel === "whatsapp") {
      const { messageText: mt, payload: pl } = await handleMsg(message, meta_token, v);
      messageText = mt;
      payload = pl;
    } else if (channel === "facebook") {
      const fbMessage = req.body?.entry?.[0]?.messaging?.[0];
      const { messageText: mt, payload: pl } = await handleFacebookMsg(fbMessage?.message, meta_token);
      messageText = mt || fbMessage?.postback?.title || "";
      payload = fbMessage?.postback?.payload || pl;
    }else if(channel === "telegram"){
      const { messageText: mt, payload: pl } = await handleTelegram(message, meta_token);
      messageText = mt;
      payload = pl;
    }
    else {
      const igMessage = req.body?.entry?.[0]?.messaging?.[0];
      const { messageText: mt, payload: pl } = await handleIgMsg(igMessage?.message, meta_token);
      messageText = mt || igMessage?.postback?.title || "";
      payload = igMessage?.postback?.payload || pl;
    }

    if (!userId) {
      console.log("user undefined");
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
    
if(redisIsHealthy) await redis.del("end_users");

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
      }

      conversationId = newConvo?.id;

      io.emit("new_conversation", {
        conversation: {
          end_user_id: userId,
          bot_id: botId,
          created_at: new Date(),
          channel_name: channel,
          id: conversationId,
        },
      });

      console.log("🆕 New conversation ID:", conversationId);
    }

    const key = `session:${conversationId}`;
    const messageKey = `${key}:messages`;

  
if(redisIsHealthy) {
    // Set session
    const existed = await redis.get(key);
    const sessionData = {
      end_user_id: userId,
      userName,
      botId,
      channel: channelId,
      time: timestamp,
    };

    await redis.set(key, JSON.stringify(sessionData), "EX", 24 * 60 * 60);
} 

    // Push user message with msg_id
    const userMsgData = {
      msg_id: msgID,
      sender_id: userId,
      sender_type: "user",
      content: messageText,
      sent_at: new Date().toISOString(),
      is_read: false,
    };
  await  check({sender_id: userId,
      sender_type: "user",
      content: messageText,
      sent_at: new Date().toISOString(),
      is_read: false,},conversationId, redisIsHealthy)
      if(redisIsHealthy) {
 await redis.rpush(messageKey, JSON.stringify(userMsgData));
} 

    
    io.to(conversationId).emit("new-message", {
      user: { from: userId, userMessage: messageText },
    });

    // Bot paused check
    const userSession = await this.getUserSession(userId, botId, ch);
    const botStatus = userSession?.data?.isPaused || false;
    if (botStatus){  console.log("your message was sent!");
      return;
    }
    console.log('bot id:', botId, userId)
    // Send message to botpress
    const botpressResponses = await this.sendMsgTOBotpress(payload, messageText, botId, userId, ch);
console.log(JSON.stringify(botpressResponses, null, 2));
    console.log("botpress responses:", botpressResponses);

    let result;
    for (const item of botpressResponses) {
      io.to(conversationId).emit("new-message", {
        bot: { conversationId, botId, item },
      });

      const botMsgData = {
        msg_id: uuidv4(),
        sender_id: botId,
        sender_type: "bot",
        content: item,
        sent_at: new Date().toISOString(),
        is_read: false,
      };
   await check({
        sender_id: botId,
        sender_type: "bot",
        content: item,
        sent_at: new Date().toISOString(),
        is_read: false,
      },conversationId, redisIsHealthy)
      if(redisIsHealthy) {
   await redis.rpush(messageKey, JSON.stringify(botMsgData));
      await redis.expire(messageKey, 24 * 60 * 60);
}

     

      if (channel === "whatsapp") {
        result = await waApi({ item, version: v, token: meta_token, userPhone: userId, waPhone: numberId, msgID });
      } else if (channel === "facebook") {
        result = await fbapi({ item, version: v, token: meta_token, userPhone: userId, pageId: numberId });
      }else if(channel === "telegram"){
        result = await telegramApi({item, token:meta_token, phone: userId})
      }
    }

    // Optional logging
    if(redisIsHealthy) {
  const cachedData = await redis.get(key);
    console.log("🔒 Cached session data:", cachedData);
    
    }

    // if (result) res.status(200).json(result);
  } catch (error) {
    console.log("❌ error:", error);
  }
};