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

exports.fbapi = async({item,url,version,token,userPhone,pageId})=>{
const meta_url = url || process.env.META_URL;
const meta_version = version || process.env.META_VERSION;
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
                         const carouselMsg = buildCarouselMsg(product,productPayload, userPhone);
                            console.log("Sending interactive message with id:", JSON.stringify(productPayload));
                                              
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
                    const response = await axios.post(
                        `${meta_url}/${meta_version}/${pageId}/messages`,
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
        return{
            status: "completed",
            sent_messages: sentMessages
        };

}