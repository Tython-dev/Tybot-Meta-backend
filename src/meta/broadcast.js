const { default: axios } = require("axios");
const { supabase } = require("../config/supabase");

const bot_url = process.env.BOTPRESS_URL;
const meta_url = process.env.META_URL;
const meta_version = process.env.META_VERSION;
const templateMsg = (phone, template_name, ln, header, header_parms, body, body_parms) => {
  const components = [];


  if (header && header_parms) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "text",
          text: header_parms
        }
      ]
    });
  }

  
  if (body && Array.isArray(body_parms)) {
    components.push({
      type: "body",
      parameters: body_parms.map(p => ({
        type: "text",
        text: p
      }))
    });
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "template",
    template: {
      name: template_name,
      language: {
        code: ln
      },
      components
    }
  };
};


exports.getElements =async (req, res)=>{
const {botId, userId, template_name, header_parms, body_parms, language} = req.body;
try{
const getTemplate = await supabase
.from("templates")
.select("*")
.eq("name", template_name)
.eq("botId", botId)
if(getTemplate.error){
    return res.status(400).json(getTemplate.error)
}
if(getTemplate.data.length === 0){
    return res.status(404).json('template not found!')
}
if(getTemplate.data[0].status === "REJECTED"){
 return res.status(400).json("you cannot use a regected template!") 
}
if(getTemplate.data[0].status === "PENDING"){
 return res.status(400).json("this template is still pending")
}
const getBotInfo = await supabase
.from("chatbots")
.select("wa_token, phone_number_id")
.eq("botId", botId)
if(getBotInfo.error){
    return res.status(400).json(getBotInfo.error)
}
const {wa_token, phone_number_id} = getBotInfo.data[0]
const components = getTemplate.data[0].components;
let header_var = 0;
let  body_var = 0;
components.map(c=>{
    if(c.type === "HEADER" && c.example.header_text.length === 1){
        header_var = c.example.header_text.length || 0
       
        if(!header_parms && header_var != 0){
            return res.status(400).json('the header parms should contain one parametre')
        }
    }
    if(c.type === "BODY" && c.example.length !== 0){
        body_var = c.example.body_text[0].length || 0;
        if(!Array.isArray(body_parms)){
            return res.status(400).json("body_parms must be an array")
        }
         if(body_parms.length != body_var){
            return res.status(400).json(`the body parms array should contain ${body_var} parametres`)
        }
    }
})
const data = templateMsg(userId,template_name,language,header_var,header_parms,body_var,body_parms)
 console.log("Sending data:", JSON.stringify(data, null, 2));
const sendMessage = await axios.post(`${meta_url}/${meta_version}/${phone_number_id}/messages`,
    data,
    {
        headers: {
            Authorization: `Bearer ${wa_token}`
        }
    }
)
console.log(sendMessage)
return res.json(sendMessage.data)
}catch(error){
    console.log('error:', error?.response?.data || error.message)
    return res.status(500).json( error?.response?.data || error.message)
}
}
exports.updatestatus = async(req, res)=>{
    const { data, error } = await supabase
  .from("templates")
  .select(`
    id,
    name,
    botId,
    chatbots (
      id,
      botId,
      channels_config (
        id,
        channel_id,
        config
      )
    )
  `);
  return res.json(data)

}