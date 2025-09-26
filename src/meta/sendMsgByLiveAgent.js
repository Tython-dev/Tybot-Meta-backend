const redis = require("../config/redis");
const { supabase } = require("../config/supabase");
const { fbapi } = require("./facebookApi");
const  {getUserSession} = require("./metaApi");
const { waApi } = require("./whatsappApi");

exports.lvMsg= async(req,res)=>{
    const {conversation_id, message, type} = req.body;
    if(!conversation_id || !message || !type){
        return res.status(400).json('conversation_id, message and type are required!')
    }
try{
    const io = req.app.get("io");
    const response = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversation_id)
    if(response.error){
        return res.status(400).json(response.error)
    }
    const conversation = response.data[0];
    const userId = conversation.end_user;
    const botId = conversation.botId;
    const channelId = conversation.channel_id;
    const configuration = await supabase
    .from('channels_config')
    .select('*')
    .eq('channel_id', channelId)
    .eq('chat_id',botId)
    if(configuration.error){
        return res.status(400).json(configuration.error)
    }
    const numberId = configuration.data[0].id_page || configuration.data[0].phone_number_id
    const token = configuration.data[0].token
        const botInfo = await getUserSession(userId, botId);
      const botStatus = botInfo?.data?.isPaused || false;
    console.log('botStatus:', botStatus)
      if (!botStatus) {
        return res.status(403).json({
          message: "Bot is active. Live agent messages are not allowed.",
        });
      }
      const key = `session:${conversation_id}`;
const messageKey = `${key}:messages`;

// 1. Store session data with expiration
//check if the conversation is already exist
const existed = await redis.get(key)
if (existed) {
  // ✅ Update only the `time` field while keeping other values (botId, channel, etc.)
  const parsed = JSON.parse(existed);
  parsed.time = new Date();

  await redis.set(key, JSON.stringify(parsed), 'EX', 24 * 60 * 60);
} else {
  // ✅ Create a new session
  const data = {
    end_user_id: userId,
    userName: null,
    botId,
    channel: channelId,
    time: new Date(),
  };
  await redis.set(key, JSON.stringify(data), 'EX', 24 * 60 * 60);
}
// 2. Append new message
await redis.rpush(messageKey, JSON.stringify({
  sender_id: req.body,
  sender_type: "live_agent",
  content: text,
  sent_at: new Date(),
  is_read: false
}));
 io.to(conversation_id).emit("new-message", {
            live_agent: {conversation_id, from: req.body, userMessage: text }
        });
        const item = {type, text};
  if(ch.includes("wa")){
    result = await waApi({item,token:meta_token,userPhone:userId,waPhone:numberId})
    }else if(ch.includes("fb")){
      result = await fbapi({item,token:meta_token,userPhone:userId,pageId:numberId})
    }      
}catch(error){
    return res.status(500).json(error)
}
}