const axios = require("axios");
const { supabase } = require("../config/supabase");
const redis = require("../config/redis");
const { getToken } = require("./controllers");
const { sendMsgTOBotpress } = require("./metaApi");
const { waApi } = require("./whatsappApi");
const { fbapi } = require("./facebookApi");
const check = require("../middleware/redisstatus");

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
    if(!response.data){
       console.log('this bot does not exist!')
    }
    return response.data
  }catch(error){
    console.log('error while geting bot id:',error)
  }
}
// const getBotId = async(numberId)=>{
//   try{
//     const response = await supabase
//     .from('chatbots')
//     .select('*')
//     .or(`phone_number_id.eq.${numberId},page_id.eq.${numberId},ig_page_id.eq.${numberId}`)
//     .single();
//     if(response.error){
//       console.log(response.error)
//     }
//     console.log(response)
//     if(response.data.length === 0){
//        console.log('this bot does not exist!')
//     }
//     return response.data
//   }catch(error){
//     console.log('error while geting bot id:',error)
//   }
// }
const getChannelID = async(channel)=>{
  try{
    const { data: channelData, error: channelError } = await supabase
            .from("channels")
            .select("id")
            .eq("name", channel);
            
console.log('channel:', channelData, channelError)
        if (channelError || !channelData) {
            console.log("No channel found for:", channel);
            return ("Channel not found");
        }
        return channelData[0].id;
}catch(error){
  return (error)
}
}
//  const [channelId, getId] = await Promise.all([
//       getChannelID("whatsapp"),
//       getBotId(numberId, await getChannelID(channel))
//     ]);
exports.sendStoryapi = async (req, res) => {
  const { messageText, userId, botId, ch } = req.body;
  const io = req.app.get("io");

  // Check Redis health
  let redisIsHealthy = false;
  try {
    const pong = await redis.ping();
    redisIsHealthy = pong === "PONG";
  } catch (error) {
    console.error("Redis health check failed:", error.message);
  }

  try {
    // 1. Get meta token (if you have your own getToken function)
    const token = await getToken();

    // 2. Detect channel
    let channel;
    if (ch.includes("wa")) channel = "whatsapp";
    else if (ch.includes("fb")) channel = "facebook";
    else if (ch.includes("tm")) channel = "telegram";
    else if (ch.includes("wb")) channel = "web";
    else channel = "instagram";

    // 3. Get channel id
    const channelId = await getChannelID(channel);

    // --- Helpers ---
    const getChatId = async () => {
      const { data, error } = await supabase
        .from("chatbots")
        .select("id")
        .eq("botId", botId);

      if (error) throw error;
      if (!data?.length) throw new Error("chat not found");
      return data[0].id;
    };

    const chat_id = await getChatId();

    const getNumberID = async () => {
      const { data, error } = await supabase
        .from("channels_config")
        .select("config")
        .eq("channel_id", channelId)
        .eq("chat_id", chat_id);

      if (error) throw error;
      if (!data?.length) throw new Error("this chat has no config");
      return data[0].config;
    };

    const config = await getNumberID();
    const meta_token = config?.token;
    const numberId = config?.phone_number_id || config?.id_page;

    if (!meta_token || !numberId) {
      return res.status(400).json({ error: "Channel config incomplete" });
    }

    // 4. Upsert end user
    const { error: userError } = await supabase
      .from("end_users")
      .upsert({ phone: userId }, { onConflict: "phone" });

    if (userError) console.log("Error upserting user:", userError);

    // 5. Get or create conversation
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
          start_time: new Date().toISOString(),
          updated_at: new Date().toISOString(),
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
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }

    // 6. Redis session handling
    const key = `session:${conversationId}`;
    const messageKey = `${key}:messages`;

    if (redisIsHealthy) {
      const existed = await redis.get(key);
      if (existed) {
        const parsed = JSON.parse(existed);
        await redis.set(key, JSON.stringify(parsed), "EX", 24 * 60 * 60);
      } else {
        const data = {
          end_user_id: userId,
          userName: null,
          botId,
          channel: channelId,
          time: new Date().toISOString(),
        };
        await redis.set(key, JSON.stringify(data), "EX", 24 * 60 * 60);
      }

      // Append new user message
      await redis.rpush(
        messageKey,
        JSON.stringify({
          sender_id: userId,
          sender_type: "live_agent", // unified sender_type
          content: messageText,
          sent_at: new Date().toISOString(),
          is_read: false,
        })
      );
      await redis.expire(messageKey, 24 * 60 * 60);
    } else {
      await check(
        {
          sender_id: userId,
          sender_type: "live_agent",
          content: messageText,
          sent_at: new Date().toISOString(),
          is_read: false,
        },
        conversationId,
        redisIsHealthy
      );
    }

    io.to(conversationId).emit("new-message", {
      live_agent: { conversationId, from: userId, userMessage: messageText },
    });

    // 7. Send message to Botpress
    const payload = { channelId, meta_token, numberId };
    const botpressResponses = await sendMsgTOBotpress(
      payload,
      messageText,
      botId,
      userId,
      ch
    );
    console.log("botpress:", botpressResponses);

    // 8. Process bot responses
    for (const item of botpressResponses) {
      io.to(conversationId).emit("new-message", {
        bot: { conversationId, botId, item },
      });

      const msgData = {
        sender_id: botId,
        sender_type: "bot",
        content: item,
        sent_at: new Date().toISOString(),
        is_read: false,
      };

      if (redisIsHealthy) {
        await redis.rpush(messageKey, JSON.stringify(msgData));
        await redis.expire(messageKey, 24 * 60 * 60);
      } else {
        await check(msgData, conversationId, redisIsHealthy);
      }

      // Send message via external API
      try {
        if (ch.includes("wa")) {
          await waApi({
            item,
            token: meta_token,
            userPhone: userId,
            waPhone: numberId,
          });
        } else if (ch.includes("fb")) {
          await fbapi({
            item,
            token: meta_token,
            userPhone: userId,
            pageId: numberId,
          });
        }
        // add telegram/web/etc as needed
      } catch (err) {
        console.error("External API send error:", err.message);
      }
    }

    return res.status(200).json("The story has been successfully sent ✅");
  } catch (error) {
    console.log("error:", error);
    return res.status(500).json({ error: error.message });
  }
};


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
exports.motsClee = async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: "id is required!" });
  }

  try {
    const botpress = await this.getbotpressInfo(); 

    const response = await axios.get(
      `${botpress.botpress_url}/api/v1/studio/${id}/qna/questions/`,
      {
        headers: { Authorization: `Bearer ${botpress.token}` },
      }
    );

    const items = response.data.items || [];

    if (items.length === 0) {
      return res.status(404).json({ message: "Il n’y a aucun mot-clé." });
    }

  const mots = items
  .map(i => Object.values(i.data?.questions || {}).flat()) 
  .flat()
  .filter(Boolean);

    return res.status(200).json(mots);
  } catch (error) {
    console.error("❌ motsClee error:", error?.response?.data || error.message);
    return res.status(500).json({
      error: "Une erreur est survenue.",
      details: error?.response?.data || error.message,
    });
  }
};
