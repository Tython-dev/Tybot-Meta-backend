const { default: axios } = require("axios");
const buildMsg = require("./buildwhatsappMessages");
const { supabase } = require("../config/supabase");

require("dotenv").config();
exports.getMetaInfo = async()=>{
  try{
  const response = await supabase
  .from('bot_tokens')
.select('meta_url,meta_version')
if(response.error){
  console.log(response.error)
}
console.log(response)
return response.data[0]
}catch(err){
    console.error("Error getting token:", err);
  }
}
function buildCarouselMsg(product,productPayload, userPhone) {
    console.log('productPayload:',productPayload)
  return {
  
                          messaging_product: "whatsapp",
                          recipient_type: "individual",
                          to: userPhone,
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
                                          title: product.actions[0]?.title || product.title.substring(0, 20)
                                      }
                                  }]
                              }
                          }
                      }
                        
  };


exports.waApi = async({item,url,version,token,userPhone,waPhone, msgID})=>{
    console.log('token:', token)
    const metaInfo = await this.getMetaInfo()
    console.log('meta_info:', metaInfo)
const meta_url = metaInfo.meta_url|| url || process.env.META_URL;
const meta_version = version || metaInfo.meta_version || process.env.META_VERSION;
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
                    console.log('the product is here:', product)
                    const action = product.actions[0];
                    // || !Array.isArray(action.payload)
                    if (!action || !action.payload ) {
                        console.error("Invalid action or payload for product:", product.title);
                        sentMessages.push({
                            status: "failed",
                            product_id: "unknown",
                            error: "Invalid action or payload"
                        });
                        continue;
                    }
                    const productPayload = action.payload || [product.title]; // Use the full payload array
                    try {
                      const carouselMsg = buildCarouselMsg(product,productPayload, userPhone);
                      
                           console.log("Sending interactive message with id:", JSON.stringify(productPayload));
                           console.log('msgID:',msgID)
                                    // Step 1: Send "typing_on"
                                    if(msgID){
  await axios.post(`${meta_url}/${meta_version}/${waPhone}/messages`, {
     messaging_product: "whatsapp",
 status: "read",
    message_id: msgID,
  typing_indicator: {
    type: "text"
  }
  }, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  // Step 2: Wait
  await new Promise(resolve => setTimeout(resolve, 1000));    
}      
                                              const response = await axios.post(
                                                  `${meta_url}/${meta_version}/${waPhone}/messages`,
                                                  carouselMsg,
                                                  { headers: { Authorization: `Bearer ${token}` } }
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
                                                  error: error
                                              });
                                          }
                                        }
    } else {
                // Handle non-carousel messages
                let messageBody;
                  messageBody =await buildMsg(item, userPhone);
                // if (!messageBody) continue;
              
                try {
                    console.log(`${meta_url}/${meta_version}/${waPhone}/messages`)
                    console.log('msgID:',msgID)
                                    // Step 1: Send "typing_on"
                                    if(msgID){
  await axios.post(`${meta_url}/${meta_version}/${waPhone}/messages`, {
     messaging_product: "whatsapp",
 status: "read",
    message_id: msgID,
  typing_indicator: {
    type: "text"
  }
  }, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  // Step 2: Wait
  await new Promise(resolve => setTimeout(resolve, 1000));
}
                    const response = await axios.post(
                        `${meta_url}/${meta_version}/${waPhone}/messages`,
                        messageBody,
                        { headers: { Authorization: `Bearer ${token}` } }
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
        return {
            status: "completed",
            sent_messages: sentMessages
        };

}