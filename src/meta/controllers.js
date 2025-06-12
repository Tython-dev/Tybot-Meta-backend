const { default: axios, all } = require("axios");
const { supabase } = require("../../config/supabase");
const handleMsg = require("./handleWhatsAppMsg");
const buildMsg = require("./buildwhatsappMessages");
const buildFacebookMsg = require("./bulidFacebookMsgs");
const handleFacebookMsg = require("./handleFacebookMessages");
// const what_token = "EAATNpYoHZCUABOxIUwqFfZAZAnJ4YsxY4JxwnuVX9jC9kH72ZCAPlK00GgQZB3QIa3mQqyJUEJe1y2hE8fCqcyNoqDy8RxSUfjn7IZCVWN35apfp9HSvz4WwE3TIuA0rD7415hZCHNE13DZCgRs93XLo7kHOeilpoHHEkIej9sG9I7iMSjsIFckQs334NuAOudgusaMIeEZBh"
const what_token= "EAAahgmCBfkQBO5k8Js37dEKQVS1OZBZCgdgDRHwQtrbEUuDN5HR3hkpFLEoZCTxiZBK5tVFFeTh4qUZC1VTzWcnaIdIPXjMGZCRHIQMA4xaTufTbvV0KG4OCYHFY8I79BZByw7wxP1dIFP5SRZC3PC41ZCa9Swr18mtAZBkH0gPXGJmzyitBtwXFHmV4ua5nV1ZAaJijwZDZD";
const fb_token= "EAAahgmCBfkQBOzHyZBvx5HjpisdgkqYcsNmLhzSZCgnvgQk0GUH01ZBZCdpTdIeTCZBuJHVBi0RzeDLizMywZAdEoZAwkUGuGgruyuY57Cbwke2r8jFZCYgc09mEHBUIRBTXRMb8YZCkh3pY7ptorJwZCVhqQ5EZA4BAFXCu2ZCDS42ubte5VqeJKhAUKUinejYXzFXYDDSe9uB1D88len6G";
const token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImhlbGxvQHR5dGhvbi5vcmciLCJzdHJhdGVneSI6ImRlZmF1bHQiLCJ0b2tlblZlcnNpb24iOjI3LCJpc1N1cGVyQWRtaW4iOnRydWUsImlhdCI6MTc0NjE4Mjk4MywiZXhwIjoxOTAzODYyOTgzLCJhdWQiOiJjb2xsYWJvcmF0b3JzIn0.dA6WYY81kBN0jLODvuqvyuiwYFC-ewt-gnc9aAH-1Og"
const getBotStatus = async (token, botId)=>{
  try{
    const response = await axios.get(`https://botpress.tython.org/api/v1/studio/${botId}/config`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    console.log("Response from Botpress:", response.data);
    return response.data.disabled;
  }catch(err){
    console.error("Error getting bot status:", err);
    // return res.status(500).json({ error: err });
  }
}
exports.getToken = async()=>{
try{
// const response = await axios.post("https://botpress.tython.org/api/v1/auth/login/basic/default",{
//     "email":"chatbot@tython.org",
//     "password": "Tython12345(@#)"
// })
// console.log("Response from Botpress:", response.data);
// return response.data.payload.jwt;
const response = await supabase
.from('bot_tokens')
.select('token')
.eq('email','chatbot@tython.org')
if(response.error){
  console.log(response.error)
}
console.log(response)
return response.data[0].token
}catch(err){
    console.error("Error getting token:", err);
  }
}
exports.getSessions = async (req, res) => {
  const {botId} = req.body;
  const {pausedOnly}= req.query || false;
  if (!botId) {
    return res.status(400).json({ error: "BotId is required!" });
  }
  try {
    const response = await axios.get(`https://botpress.tython.org/api/v1/bots/${botId}/mod/hitl/sessions?pausedOnly=${pausedOnly}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    // console.log("Response from Botpress:", response.data);
    return res.status(200).json({ message: "Sessions retrieved successfully", data: response.data });
  }catch(err){
    console.error("Error getting sessions:", err);
    return res.status(500).json({ error: err });
  }
}
exports.getUserSession = async(userId, botId,)=>{
  const token = await this.getToken()
  try {
    const response = await axios.get(`https://botpress.tython.org/api/v1/bots/${botId}/mod/hitl/sessions?pausedOnly=false`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    // console.log("Response from Botpress:", response.data);
    const allSessions = response.data;
    // console.log("allSessions", allSessions, allSessions.length);
    const sessionInfo = allSessions.find((session) => String(session.user.id) === String(userId));
  console.log("sessionInfo", sessionInfo);
    return ({ message: "Session retrieved successfully", data: sessionInfo });
  }catch(err){
    console.error("Error getting sessions:", err);
    return  err ;
  }
}
exports.getBotId = async(numberId)=>{
  try{
    const response = await supabase
    .from('chatbots')
    .select('*')
    .or(`phone_number_id.eq.${numberId},page_id.eq.${numberId},ig_page_id.eq.${numberId}`)
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
exports.getChannelID = async(channel)=>{
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
exports.getMetaInfo = async()=>{
  try{
  const response = await supabase
  .from('bot_tokens')
.select('meta_url,meta_version')
.eq('email','chatbot@tython.org')
if(response.error){
  console.log(response.error)
}
console.log(response)
return response.data[0]
}catch(err){
    console.error("Error getting token:", err);
  }
}
exports.controllers = {
  sendMessage: async (req, res) => {
    const io = req.app.get("io");
    const { fromWeb } = req.query;
    const token = await this.getToken();
    try {
        // 1. Extract data based on source (web or WhatsApp)
        let messageText, payload, phone, userName, phoneNumberId, channel, message;

        if (fromWeb) {
            if (!req.body.message || !req.body.phone) {
                return res.status(400).send("Invalid web payload - missing message or phone");
            }
            messageText = req.body.message;
            phone = req.body.phone;
            userName = req.body.userName || "Web User";
            phoneNumberId = req.body.phoneNumberId;
            channel = "web";
        } else {
            const entry = req.body?.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;

            if (!value?.messages) {
                console.log("⚠️ Invalid WhatsApp payload:", JSON.stringify(req.body, null, 2));
                // return res.status(400).send("No valid message received");
            }

            message = value?.messages[0];
            phoneNumberId = value?.metadata?.phone_number_id || req.body.entry[0].id;
            const contact = value?.contacts?.[0];
            phone = contact?.wa_id || req.body.entry[0].messaging[0].sender?.id;
            userName = contact?.profile?.name;
            channel = value?.messaging_product;

            if (req.body.object.includes("whatsapp")) {
              const { messageText: mt, payload: pl } = await handleMsg(message, what_token);
              messageText = mt;
              payload = pl;
             
            } else if (req.body.object.includes("page")) {
              channel = "facebook";
              const { messageText: mt, payload: pl } = await handleFacebookMsg(req.body.entry[0]?.messaging[0]?.message, what_token);
              messageText = mt;
              console.log('messageText',messageText)
              payload = req.body.entry[0]?.messaging[0]?.postback?.payload;
              if(!req.body.entry[0]?.messaging[0]?.message){
                messageText = req.body.entry[0]?.messaging[0]?.postback.title
              }
              console.log('messageText:',messageText)
            }
        }

        // 2. Validate essential fields
        // if (!phone) return res.status(400).send("Missing phone number");
        // if (!messageText) return res.status(400).send("No message content to process");

        // 3. Get channel ID
        const { data: channelData, error: channelError } = await supabase
            .from("channels")
            .select("id")
            .eq("name", channel)
            .single();

        if (channelError || !channelData) {
            console.log("No channel found for:", channel);
            return res.status(404).send("Channel not found");
        }
        const channelId = channelData.id;
console.log('phone number id',phoneNumberId)
        // 4. Get botId
        const { data: botData, error: botError } = await supabase
            .from("chatbots")
            .select("botId,phone_number_id,page_id")
            .or(`phone_number_id.eq.${phoneNumberId},page_id.eq.${phoneNumberId}`)
            
console.log('botId:', botData, botError)
        if (botError || botData.length === 0) {
            console.log("No bot found for phoneNumberId:", phoneNumberId);
            return res.status(404).send("Bot not found");
        }
        const botId = botData[0].botId;
        let pageId = phoneNumberId;
        console.log('botId:', botId)
        phoneNumberId= botData.phone_number_id;
        // 5. Check bot session status
        const botInfo = await this.getUserSession(phone, botId);
        const botStatus = botInfo?.data?.isPaused || false;

        // 6. Ensure user exists
        const { error: userError } = await supabase
            .from("end_users")
            .upsert({ phone, first_name: userName }, { onConflict: "phone" });

        if (userError) console.log("Error upserting user:", userError);

        // 7. Get or create conversation
        const { data: convoData, error: convoError } = await supabase
            .from("conversations")
            .select("id")
            .eq("bot_id", botId)
            .eq("end_user_id", phone)
            .single();

        let conversationId = convoData?.id;

        if (!conversationId) {
            const { data: newConvo, error: newConvoError } = await supabase
                .from("conversations")
                .insert({
                    bot_id: botId,
                    end_user_id: phone,
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

        // 8. Save user message
        const messageInsert = {
            conversation_id: conversationId,
            sender_id: phone,
            content: messageText,
            sender_type: "user",
            sent_at: new Date(),
        };

        if (!fromWeb && message?.type === "interactive") {
            messageInsert.raw_content = message.interactive;
        }

        await supabase.from("messages").insert(messageInsert);
        
        
        // 9. Process with Botpress
        // Adjust payload for Botpress if it expects a single object
        
        console.log("Sending to Botpress with payload:", JSON.stringify(payload, null, 2));
        const msgToBotpress = { type: "text", text: messageText, payload:payload?JSON.parse(payload):null }
        console.log('msgToBotpress:', msgToBotpress);
        const botpressRes = await axios.post(
            `https://botpress.tython.org/api/v1/bots/${botId}/converse/${phone}/secured`,
            msgToBotpress,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const botResponses = Array.isArray(botpressRes.data.responses)
            ? botpressRes.data.responses
            : [];

        io.emit("new-message", {
            user: { from: phone, userMessage: messageText },
            bot: { botId, botResponses }
        });

        // 10. Save bot responses and handle WhatsApp sending
        const sentMessages = [];

        for (const item of botResponses) {
            // Save to database first
            let content;
            if (item.type === "carousel") {
                content = `[CAROUSEL] ${item.items.map(i => i.title).join(", ")}`;
            } else {
                content = item;
            }

            await supabase.from("messages").insert({
                conversation_id: conversationId,
                sender_id: botId,
                content,
                sender_type: "bot",
                sent_at: new Date(),
                raw_content: item.type === "carousel" ? item : null
            });

            // Skip sending if bot is paused
            if (botStatus) continue;

            if (item.type === "carousel") {
              let  meta_token;
              let numbertodsend ;
              if (req.body.object.includes("whatsapp")) {
                meta_token = what_token;
                numbertodsend = pageId;
              } else if (req.body.object.includes("page") && req?.body.entry?.[0]?.messaging?.[0]?.sender?.id) {
                meta_token = fb_token;
                numbertodsend = req.body.entry[0].id;
              }
                // Send each product individually
                for (const product of item.items) {
                    const action = product.actions[0];
                    if (!action || !action.payload || !Array.isArray(action.payload)) {
                        console.error("Invalid action or payload for product:", product.title);
                        sentMessages.push({
                            status: "failed",
                            product_id: "unknown",
                            error: "Invalid action or payload"
                        });
                        continue;
                    }

                    const productPayload = action.payload; // Use the full payload array
                    try {
                      let carouselMsg;
                      if(req.body.object.includes("whatsapp")){
                        carouselMsg ={
                          messaging_product: "whatsapp",
                          recipient_type: "individual",
                          to: phone,
                          type: "interactive",
                          interactive: {
                              type: "button",
                              header: {
                                  type: "image",
                                  image: { link: product.image }
                              },
                              body: {
                                  text: `${product.title}`
                              },
                              footer: {
                                  text: `${product.subtitle}`
                              },
                              action: {
                                  buttons: [{
                                      type: "reply",
                                      reply: {
                                          id: JSON.stringify(productPayload), // Stringify the full payload array
                                          title: product.title.substring(0, 20)
                                      }
                                  }]
                              }
                          }
                      }
                      }else if(req.body.object.includes("page")){
                        carouselMsg = {
                          recipient:{
                            id: req?.body.entry?.[0]?.messaging?.[0]?.sender?.id
                        },  
                        messaging_type: "RESPONSE",
                        message:{
    attachment: {
      type: 'template',
    payload:{
        template_type:"generic",
        elements:[
           {
            title:`${product.title}`,
            image_url:`${product.image}`,
            subtitle:`${product.subtitle}`,
            buttons:[
              {
                type:"postback",
                title: product.title.substring(0, 20),
                payload:JSON.stringify(productPayload)
              }              
            ]      
          }
        ]
      }
    }
    }
  }
  console.log('carouselMsg:',carouselMsg)
                        }
                      
                        

                        console.log("Sending interactive message with id:", JSON.stringify(productPayload));
                        console.log('phone number:', numbertodsend)
                        const response = await axios.post(
                            `https://graph.facebook.com/v22.0/${numbertodsend}/messages`,
                            carouselMsg,
                            { headers: { Authorization: `Bearer ${meta_token}` } }
                        );

                        sentMessages.push({
                            status: "sent",
                            product_id: productPayload[0]?.productId || "unknown",
                            message_id: response.data.messages?.[0]?.id
                        });

                        await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay
                    } catch (error) {
                        console.error("Failed to send product:", product.title, error.response?.data);
                        sentMessages.push({
                            status: "failed",
                            product_id: productPayload[0]?.productId || "unknown",
                            error: error.message
                        });
                    }
                }
            } else {
                // Handle non-carousel messages
                let messageBody, meta_token, numbertodsend;
                const recipientId = req?.body.entry?.[0]?.messaging?.[0]?.sender?.id;
                
                if (req.body.object.includes("whatsapp")) {
                  meta_token = what_token;
                  messageBody = buildMsg(item, phone);
                  numbertodsend = pageId;
                } else if (req.body.object.includes("page") && recipientId) {
                  meta_token = fb_token;
                  messageBody = buildFacebookMsg(item, recipientId);
                  numbertodsend = req.body.entry[0].id;
                  console.log("messageBody",messageBody)
                }
                
                if (!messageBody) continue;
                console.log(phoneNumberId, numbertodsend)
                try {
                    const response = await axios.post(
                        `https://graph.facebook.com/v22.0/${numbertodsend}/messages`,
                        messageBody,
                        { headers: { Authorization: `Bearer ${meta_token}` } }
                    );
                    sentMessages.push({
                        status: "sent",
                        type: item.type,
                        message_id: response.data.messages?.[0]?.id
                    });
                } catch (error) {
                    console.error("meta API error:", error.response?.data);
                    sentMessages.push({
                        status: "failed",
                        type: item.type,
                        error: error.message
                    });
                }
            }
        }

        // 11. Handle web response
        if (fromWeb) {
            return res.status(200).json({
                status: "processed",
                message: "Web message processed"
            });
        }

        // 12. Final response
        return res.status(200).json({
            status: "completed",
            sent_messages: sentMessages,
            bot_status: botStatus ? "paused" : "active"
        });

    } catch (error) {
        console.error("Error in sendMessage:", error);
        return res.status(500).json({
            status: "error",
            message: "Internal server error",
            error: error.message
        });
    }
},
 webhook: async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const { botId } = req.params; // destructure properly

  if (!mode || !token) return res.sendStatus(400);

  try {
    const VERIFY_TOKEN = botId; // define the actual token somewhere secure
    const isValidToken = token === VERIFY_TOKEN;

    if (mode === "subscribe" && isValidToken) {
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
  desactiverBot: async (req,res)=>{
    const { botId, disabled  } = req.body;
    if (!botId) {
      return res.status(400).json({ error: "BotId and disabled are required!" });
    }
    // const token = await getToken(req, res);
    try {
      const response = await axios.post(
        `https://botpress.tython.org/api/v1/studio/${botId}/config`,
        {disabled},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if(response.status === 200){
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
  desactiverSession : async (req,res)=>{
    const { botId, user_phone, is_paused } = req.body;

    if (!botId || !user_phone) {
      return res.status(400).json({ error: "botId and user_phone are required!" });
    }
  
    try {
      const sessionId = await this.getUserSession(user_phone, botId);
      console.log('session:', sessionId)
      if (!sessionId) {
        return res.status(404).json({ error: "Session not found!" });
      }
      console.log('is_paused:', is_paused)
      // let action;
      // if(is_paused === true){
      //   action = "unpause"
      // }else{
      //   action = "pause"
      // }

      const action = is_paused? "pause" : "unpause";
      const token = await this.getToken();
      console.log('action:', action)
      console.log(`url:https://botpress.tython.org/api/v1/bots/${botId}/mod/hitl/sessions/${sessionId.data.id}/${action}`)
      const response = await axios.post(
        `https://botpress.tython.org/api/v1/bots/${botId}/mod/hitl/sessions/${sessionId.data.id}/${action}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
  console.log('response_session:',response)
      console.log("Response from Botpress:", response.data);
  
      if (response.status === 200) {
        await supabase
          .from("conversations")
          .update({ is_active: !is_paused })
          .eq("bot_id", botId)
          .eq("end_user_id", user_phone);
      }
  
      return res.status(200).json({ message: "Conversation updated successfully", data: response.data });
    } catch (err) {
      console.error("Error disabling session:", err);
      return res.status(500).json({ error: "Failed to update session" });
    }
  },
  sendLiveAgentMessage: async (req, res) => {
    const io = req.app.get("io");
    const { phone, type, content,id_conversation, botId } = req.body;
  
    if (!phone || !type || !content || !id_conversation || !botId) {
      return res.status(400).json({
        message: "Missing required fields: phone, type, content, phoneNumberId or botId",
      });
    }
  
    try {
      const numberId = await supabase
      .from("chatbots")
      .select("phone_number_id, page_id")
      .eq("botId", botId)
      .single();
      console.log("numberId", numberId);
      if (!numberId) {
        return res.status(404).json({
          message: "No phone number found for the given botId",
        });
      }
      const phoneNumberId = numberId.data.phone_number_id;
      console.log("phoneNumberId", phoneNumberId);
      // Check if the bot is paused
      const botInfo = await this.getUserSession(phone, botId);
      console.log("botStatus", botInfo);
      const botStatus = botInfo?.data?.isPaused || false;
    console.log('botStatus:', botStatus)
      if (!botStatus) {
        return res.status(403).json({
          message: "Bot is active. Live agent messages are not allowed.",
        });
      }
      const addMessage = await supabase
      .from("messages")
      .insert({
        conversation_id: id_conversation,
        sender_id: req.user.id,
        content: content,
        sender_type: "live_agent",
        sent_at: new Date().toISOString(),
      });
      console.log("addMessage", addMessage);
      if (addMessage.error) {
        return res.status(500).json({
          message: "Failed to save live agent message",
          error: addMessage.error,
        });
      }
      // Construct message body
      let messageBody = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type,
      };
  
      if (type === "text") {
        messageBody.text = { preview_url: false, body: content };
      } else if (type === "image") {
        messageBody.image = { link: content };
      } else {
        return res.status(400).json({
          message: `Unsupported message type: ${type}`,
        });
      }
  
      const whatsappResponse = await axios.post(
        `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
        messageBody,
        {
          headers: {
            Authorization: `Bearer ${what_token}`, // WhatsApp token
            "Content-Type": "application/json",
          },
        }
      );
      console.log('whatsapResponse:', whatsappResponse)
  
      console.log("✅ Live agent message sent:", whatsappResponse.data);
      io.emit("new-message", {
       
      live_agent: {
        live_agent: req.user.id,
        response: content
      }
        
      });
      return res.status(200).json({
        message: "Message sent successfully by live agent",
        data: whatsappResponse.data,
      });
  
    } catch (err) {
      console.error("❌ Error sending live agent message:", err);
      return res.status(500).json({
        message: "Failed to send live agent message",
        error: err.response?.data || err.message,
      });
    }
  },

  
}
