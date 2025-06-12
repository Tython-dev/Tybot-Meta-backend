const { default: axios } = require("axios");
const { supabase } = require("../../config/supabase");
const { getToken, getBotId, getChannelID } = require("./controllers");
const { fbapi } = require("./facebookApi");
const handleFacebookMsg = require("./handleFacebookMessages");
const handleMsg = require("./handleWhatsAppMsg");
const { sendMsgTOBotpress } = require("./metaApi");
const { waApi } = require("./whatsappApi");
const redis = require("../../config/redis");
exports.getnumberId = async(botId)=>{
  try{
    const response = await supabase
    .from('chatbots')
    .select('*')
    .eq('botId', botId)
    .single();
    if(response.error){
      console.log(response.error)
    }
    console.log(response)
    if(response.data.length === 0){
       console.log('this bot does not exist!')
    }
    return response.data
  }catch(error){
    console.log('error while geting bot id:',error)
  }
}
exports.sendStoryapi = async(req,res)=>{
const {messageText, userId, botId, ch} =req.body;
      const io = req.app.get("io");
try{
    // 2. extract element from webhook
    const token = await getToken();
    let  payload, channel, meta_token,numberId;
   

    // 3. Get botId from supabase
    const getId = await this.getnumberId(botId) 
     // it could be a whatapp id, a fb page id or ig page id
    // 4.get channel id and meta_token
    if(ch.includes("wa")){
        channel = 'whatsapp';
        meta_token = getId.wa_token;
        numberId = getId.phone_number_id
    }else if(ch.includes("fb")){
        channel = 'facebook';
        meta_token = getId.fb_token;
        numberId = getId.page_id
    }else{
        channel= 'instagram';
        meta_token = getId.ig_token; 
        numberId = getId.ig_page_id
    }
    // get channel id
    const channelId = await getChannelID(channel)
    // 6. Ensure user exists
        const { error: userError } = await supabase
            .from("end_users")
            .upsert({ phone:userId}, { onConflict: "phone" });

        if (userError) console.log("Error upserting user:", userError);

        // 7. Get or create conversation
        const { data: convoData, error: convoError } = await supabase
            .from("conversations")
            .select("id")
            .eq("bot_id", botId)
            .eq("end_user_id", userId)
            .single();

        let conversationId = convoData?.id;

        if (!conversationId) {
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

            if (newConvoError || !newConvo) {
                console.log("Error creating conversation:", newConvoError);
                return res.status(500).send("Error creating conversation");
            }
            conversationId = newConvo.id;
        } else {
            await supabase
                .from("conversations")
                .update({ updated_at: new Date() })
                .eq("id", conversationId);
        }
          // . Save user message
          const key = `session:${conversationId}`;
const messageKey = `${key}:messages`;

// 1. Store session data with expiration
//check if the conversation is already exist
const existed = await redis.get(key)
if (existed) {
  // ✅ Update only the `time` field while keeping other values (botId, channel, etc.)
  const parsed = JSON.parse(existed);
 

  await redis.set(key, JSON.stringify(parsed), 'EX', 2 * 60 * 60);
} else {
  // ✅ Create a new session
  const data = {
    end_user_id: userId,
    userName: null,
    botId,
    channel: channelId,
    time: new Date(),
  };
  await redis.set(key, JSON.stringify(data), 'EX', 2 * 60 * 60);
}
// 2. Append new message
await redis.rpush(messageKey, JSON.stringify({
  sender_id: req.id,
  sender_type: "live_agent",
  content: messageText,
  sent_at: new Date(),
  is_read: false
}));
 io.to(conversationId).emit("new-message", {
            live_agent: {conversationId, from: req.id, userMessage: messageText }
        });
        // const messageInsert = {
        //     conversation_id: conversationId,
        //     sender_id: userId,
        //     content: messageText,
        //     sender_type: "bot",
        //     sent_at: new Date(),
        // };
        // await supabase.from("messages").insert(messageInsert);

// 5. Send both in response

// 6. send message to botpress
const botpressResponses = await sendMsgTOBotpress(payload,messageText,botId,userId,token)
console.log('botpress:', botpressResponses)
 // 10. Save bot responses and handle WhatsApp sending
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
           
  if(ch.includes("wa")){
  result = await waApi({item,token:meta_token,userPhone:userId,waPhone:numberId})
  }else if(ch.includes("fb")){
    result = await fbapi({item,token:meta_token,userPhone:userId,pageId:numberId})
  }
}  

    return res.status(200).json("The story has been successfully sent✅")


}catch(error){
    console.log('error:', error)
    return res.status(500).json(error)
}
}
exports.motsClee = async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: "id is required!" });
  }

  try {
    const token = await getToken(); // assuming getToken returns a Promise

    const response = await axios.get(
      `https://botpress.tython.org/api/v1/studio/${id}/qna/questions/`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const items = response.data.items || [];

    if (items.length === 0) {
      return res.status(404).json({ message: "Il n’y a aucun mot-clé." });
    }

    const mots = items.map((i) => i.data?.questions?.fr).flat().filter(Boolean);

    return res.status(200).json(mots);
  } catch (error) {
    console.error("❌ motsClee error:", error?.response?.data || error.message);
    return res.status(500).json({
      error: "Une erreur est survenue.",
      details: error?.response?.data || error.message,
    });
  }
};
