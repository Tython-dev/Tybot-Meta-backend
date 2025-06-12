const { supabase } = require("../../config/supabase");
const verifyStatus = require("../../middleware/verifyStatus");
const { getBotId, getToken, getChannelID, getUserSession } = require("./controllers");
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
exports.sendMsgTOBotpress = async (payload, messageText, botId, phone, token) => {
  console.log("Sending to Botpress with payload:", JSON.stringify(payload, null, 2));

  const msgToBotpress = {
    type: "text",
    text: messageText,
    payload: payload ? JSON.parse(payload) : null
  };

  console.log('msgToBotpress:', msgToBotpress);

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

exports.metaApi = async(req,res)=>{
  const {v} = req.params;
  res.status(200).send('EVENT_RECEIVED');
try{
      const io = req.app.get("io");
    console.log('body:', JSON.stringify(req.body))
    const token = await getToken();
    let messageText, object, payload, userId, userName, numberId, channel, message, meta_token;
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const contact = value?.contacts?.[0];
    userName = contact?.profile.name || null;
    const timestamp = entry?.messages?.[0].changes?.[0].timestamp || entry?.messaging?.[0].timestamp;
    message = value?.messages?.[0] || req.body.entry[0]?.messaging?.[0].message;
    const msgID = message?.id || null;
    object = req.body.object;
    userId = contact?.wa_id || req.body.entry?.[0].messaging?.[0].sender?.id;//it maybe a phone number or a fb id
    numberId = value?.metadata?.phone_number_id ||entry?.id;

    // 3. Get botId from supabase
    const getId = await getBotId(numberId) 
    const botId = getId.botId // it could be a whatapp id, a fb page id or ig page id
    // 4.get channel id and meta_token
    if(object.includes("whatsapp")){
        channel = 'whatsapp';
        meta_token = getId.wa_token;
         const { messageText: mt, payload: pl } = await handleMsg(message, meta_token, v);
                      messageText = mt;
                      payload = pl;
    }else if(object.includes("page")){
        channel = 'facebook';
        meta_token = getId.fb_token;
        const { messageText: mt, payload: pl } = await handleFacebookMsg(req.body.entry[0]?.messaging[0]?.message, meta_token);
                      messageText = mt;
                      // console.log('messageText',messageText)
                      payload = req.body.entry[0]?.messaging[0]?.postback?.payload;
                      if(!req.body.entry[0]?.messaging[0]?.message){
                        messageText = req.body.entry[0]?.messaging[0]?.postback.title
                      }
                      // console.log('messageText:',messageText)
    }else{
        channel= 'instagram';
        meta_token = getId.ig_token; 
        const { messageText: mt, payload: pl } = await handleIgMsg(req.body.entry[0]?.messaging[0]?.message, meta_token);
                      messageText = mt;
                      // console.log('messageText',messageText)
                      payload = req.body.entry[0]?.messaging[0]?.postback?.payload;
                      if(!req.body.entry[0]?.messaging[0]?.message){
                        messageText = req.body.entry[0]?.messaging[0]?.postback.title
                      }
    }
    // get channel id
    const channelId = await getChannelID(channel)
     // 5. Save conversation info (expire in 2 hours)

 // 1. Upsert user
      const { error: userError } = await supabase
        .from("end_users")
        .upsert({
          phone: userId,
          first_name: userName,
        }, { onConflict: "phone" });

      if (userError) {
        console.error("❌ Failed to upsert user:", userError.message);
        
      }
                await redis.del('end_users');
      // 2. Get or create conversation
      let conversationId;
if(!userId){
  return res.status(404).json('user undefined');
}
      const { data: convoData, error: convoError } = await supabase
        .from("conversations")
        .select("id")
        .eq("bot_id", botId)
        .eq("end_user_id", userId)
        .single();

      if (convoError && convoError.code !== 'PGRST116') {
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

        conversationId = newConvo.id;
        io.emit("new_conversation",{conversation: {
          end_user_id: userId,
          bot_id: botId,
          created_at: new Date(),
          channel_name: channel,
          id: conversationId
        }})
        console.log("🆕 New conversation ID:", conversationId);
      }
const key = `session:${conversationId}`;
const messageKey = `${key}:messages`;

// 1. Store session data with expiration
//check if the conversation is already exist
const existed = await redis.get(key)
if (existed) {
  // ✅ Update only the `time` field while keeping other values (botId, channel, etc.)
  const parsed = JSON.parse(existed);
  parsed.time = timestamp;

  await redis.set(key, JSON.stringify(parsed), 'EX', 2 * 60 * 60);
} else {
  // ✅ Create a new session
  const data = {
    end_user_id: userId,
    userName,
    botId,
    channel: channelId,
    time: timestamp,
  };
  await redis.set(key, JSON.stringify(data), 'EX', 2 * 60 * 60);
}
// 2. Append new message
await redis.rpush(messageKey, JSON.stringify({
  sender_id: userId,
  sender_type: "user",
  content: messageText,
  sent_at: timestamp || new Date(),
  is_read: false
}));
 io.to(conversationId).emit("new-message", {
            user: { from: userId, userMessage: messageText }
        });
// 3. Set expiry on message list


// 4. Retrieve both session

const userSession = await getUserSession(userId,botId)
const botStatus = userSession?.data?.isPaused || false;
if (botStatus){
  return res.json("your message was sent!")
}
// 6. send message to botpress
const botpressResponses = await this.sendMsgTOBotpress(payload,messageText,botId,userId,token)
console.log('botpress:', botpressResponses)
 // 10. Save bot responses and handle WhatsApp sending
let result;
for (const item of botpressResponses) {
   io.to(conversationId).emit("new-message", {
            bot: {conversationId, botId, item }
        });
  try {
    const msgData = {
      sender_id: botId,
      sender_type: "bot",
      content: item,
      sent_at: new Date().toISOString(),
      is_read:false
    };
    await redis.rpush(messageKey, JSON.stringify(msgData));
    await redis.expire(messageKey, 2 * 60 * 60);
  } catch (err) {
    console.error('Failed to store botpress message:', item, err);
  }

  if(object.includes("whatsapp")){
    result = await waApi({item,version:v,token:meta_token,userPhone:userId,waPhone:numberId,msgID})
  } else if(object.includes("page")){
    result = await fbapi({item,version:v,token:meta_token,userPhone:userId,pageId:numberId})
  }
}
const cachedData = await redis.get(key);
const cachedMessages = await redis.lrange(messageKey, 0, -1); // Get all messages
console.log(cachedData)
 if(result){

   return res.status(200).json(result);
 }  
}catch(error){
    console.log('error:', error)
    // return res.status(500).json(error)
}
}
