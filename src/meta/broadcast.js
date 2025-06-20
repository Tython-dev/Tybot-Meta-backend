const { default: axios } = require("axios");
const { supabase } = require("../config/supabase");


const meta_url = process.env.META_URL;
const meta_version = process.env.META_VERSION;
const params_type = (params) => {
  switch (params.type) {
    case "text":
      if (params.text === undefined) {
        throw "The 'text' type parameter must include a 'text' attribute.";
      }
      break;

    case "image":
      if (params.image === undefined) {
        throw "The 'image' type parameter must include an 'image' attribute.";
      }
      break;

    case "currency":
      if (params.currency === undefined) {
        throw "The 'currency' type parameter must include a 'currency' attribute.";
      }
      const requiredCurrencyFields = ["fallback_value", "code", "amount_1000"];
      requiredCurrencyFields.forEach((field) => {
        if (params.currency[field] === undefined) {
          throw `Currency object must contain '${field}' attribute.`;
        }
      });
      break;

    case "date_time":
      if (params.date_time === undefined) {
        throw "The 'date_time' type parameter must include a 'date_time' attribute.";
      }
      break;

    case "video":
      if (params.video === undefined) {
        throw "The 'video' type parameter must include a 'video' attribute.";
      }
      break;

    default:
      throw "Invalid type.";
  }
};

const body_params = (params) => {
  if (!Array.isArray(params)) {
    throw new Error("body_params must be an array!");
  }

  const invalidTypes = ["video", "image", "document"];

  params.forEach((param) => {
    const type = param.type;

    if (invalidTypes.includes(type)) {
      throw new Error(`The type '${type}' is not allowed in the BODY component!`);
    }
  });
};
const formatParam = (param) => {
  params_type(param);

  switch (param.type) {
    case "text":
      return {
        type: "text",
        text: param.text
      };

    case "currency":
      return {
        type: "currency",
        currency: param.currency
      };

    case "date_time":
      return {
        type: "date_time",
        date_time:{
          fallback_value: param.date_time
        }
      };

    case "image":
      return {
        type: "image",
        image:{
          link: param.image
        }
      };

    case "video":
      return {
        type: "video",
        video:{ 
          link:param.video
        }
      };

    case "document":
      return {
        type: "document",
        document:{
          link: param.document
        }
      };

    default:
      throw `Unsupported type: ${param.type}`;
  }
};

const templateMsg = (phone, template_name, ln, header, header_parms, body, body_parms) => {
  const components = [];



  if (header && header_parms) {
    const formattedHeader = formatParam(header_param);
    components.push({
      type: "header",
      parameters: [formattedHeader]
    });
  }


  if (body && Array.isArray(body_parms)) {
    body_params.forEach(body_params_item => body_params(body_params_item)); // validate types
    const formattedBody = body_params.map(formatParam);
    components.push({
      type: "body",
      parameters: formattedBody
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
