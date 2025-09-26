const { default: axios } = require("axios");
const buildFacebookMsg = require("./bulidFacebookMsgs");

require("dotenv").config();
function buildCarouselMsg(product,productPayload, userPhone) {
  return {
        recipient:{
                            id: userPhone
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
  };
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
exports.fbapi = async({item,url,version,token,userPhone,pageId})=>{
    const metaInfo = await this.getMetaInfo()
    console.log('meta_info:', metaInfo)
const meta_url = metaInfo.meta_url|| url || process.env.META_URL;
const meta_version =metaInfo.meta_version|| version || process.env.META_VERSION;
const sentMessages = [];
     let content;
            if (item.type === "carousel") {
                content = `[CAROUSEL] ${item.items.map(i => i.title).join(", ")}`;
            } else {
                content = item;
            }

    if (item.type === "carousel") {
         // Send each product individually
                for (const product of item.items) {
                    const action = product.actions[0];
                    if (!action || !action.payload) {
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
                        const carouselMsg = buildCarouselMsg(product,productPayload, userPhone);
                           console.log("Sending interactive message with id:", JSON.stringify(productPayload));
                        // 1. Send typing_on first
// Step 1: Send "typing_on"
if(msgID){
  await axios.post(`${meta_url}/${meta_version}/${pageId}/messages`, {
    recipient: { id: userPhone },
  sender_action: "typing_on"
  }, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  // Step 2: Wait
  await new Promise(resolve => setTimeout(resolve, 1000));

}

                                              
                                              const response = await axios.post(
                                                  `${meta_url}/${meta_version}/${pageId}/messages`,
                                                  carouselMsg,
                                                  { headers: { Authorization: `Bearer ${token}` } }
                                              );
                      
                                              sentMessages.push({
                                                  status: "sent",
                                                  product_id: productPayload[0]?.productId || "unknown",
                                                  message_id: response.data.messages?.[0]?.id
                                              });
                      
                                              await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay
                                              // Step 4: Turn off typing indicator
await axios.post(
  `${meta_url}/${meta_version}/${pageId}/messages`,
  {
    recipient: { id: userPhone },
    sender_action: "typing_off"
  },
  {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  }
);
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
                let messageBody;
                  messageBody = buildFacebookMsg(item, userPhone);
                // if (!messageBody) continue;
              
                try {
  // Step 1: Send "typing_on"
  if(msgID){
  await axios.post(`${meta_url}/${meta_version}/${pageId}/messages`, {
    recipient: { id: userPhone },
  sender_action: "typing_on"
  }, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  // Step 2: Wait
  await new Promise(resolve => setTimeout(resolve, 1000));
  }
  // Step 3: Make sure your message does NOT contain sender_action
  console.log("messageBody:", messageBody);

  // Step 4: Send the actual message
  const response = await axios.post(
    `${meta_url}/${meta_version}/${pageId}/messages`,
    messageBody,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
// Step 4: Turn off typing indicator
await axios.post(
  `${meta_url}/${meta_version}/${pageId}/messages`,
  {
    recipient: { id: userPhone },
    sender_action: "typing_off"
  },
  {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  }
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
            // 12. Final response
        return{
            status: "completed",
            sent_messages: sentMessages
        };

}