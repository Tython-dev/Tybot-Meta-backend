const { default: axios } = require("axios");
const { supabase } = require("../config/supabase");


const meta_url = process.env.META_URL || "https://graph.facebook.com";
const meta_version = process.env.META_VERSION || "v23.0";
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

const validateBodyParams = (params) => {
  if (!Array.isArray(params)) {
    throw new Error("body_parms must be an array!");
  }

  const invalidTypes = ["video", "image", "document"];

  params.forEach((param) => {
    if (invalidTypes.includes(param.type)) {
      throw new Error(`The type '${param.type}' is not allowed in the BODY component!`);
    }
  });
};

const formatParam = (param) => {
  params_type(param);

  switch (param.type) {
    case "text":
      return { type: "text", text: param.text };
    case "currency":
      return { type: "currency", currency: param.currency };
    case "date_time":
      return {
        type: "date_time",
        date_time: { fallback_value: param.date_time },
      };
    case "image":
      return { type: "image", image: { link: param.image } };
    case "video":
      return { type: "video", video: { link: param.video } };
    case "document":
      return { type: "document", document: { link: param.document } };
    default:
      throw `Unsupported type: ${param.type}`;
  }
};

const templateMsg = (phone, template_name, ln, header, header_parms, body, body_parms) => {
  const components = [];

  if (header && header_parms) {
    const formattedHeader = formatParam(header_parms);
    components.push({
      type: "header",
      parameters: [formattedHeader],
    });
  }

  if (body && Array.isArray(body_parms)) {
    validateBodyParams(body_parms); 
    const formattedBody = body_parms.map(formatParam); 
    components.push({
      type: "body",
      parameters: formattedBody,
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
        code: ln,
      },
      components,
    },
  };
};

exports.getElements = async (req, res) => {
  const { botId, userId, template_name, header_parms, body_parms, language } = req.body;

  try {
    const getTemplate = await supabase
      .from("templates")
      .select("*")
      .eq("name", template_name)
      .eq("botId", botId);

    if (getTemplate.error) {
      return res.status(400).json(getTemplate.error);
    }

    if (getTemplate.data.length === 0) {
      return res.status(404).json("template not found!");
    }

    const template = getTemplate.data[0];

    if (template.status === "REJECTED") {
      return res.status(400).json("you cannot use a rejected template!");
    }

    if (template.status === "PENDING") {
      return res.status(400).json("this template is still pending");
    }

    const getBotInfo = await supabase
      .from("chatbots")
      .select("wa_token, phone_number_id")
      .eq("botId", botId);

    if (getBotInfo.error) {
      return res.status(400).json(getBotInfo.error);
    }

    const { wa_token, phone_number_id } = getBotInfo.data[0];
    const components = template.components;

    let header_var = 0;
    let body_var = 0;

    components.forEach((c) => {
      if (c.type === "HEADER" && c.example?.header_text?.length === 1) {
        header_var = c.example.header_text.length || 0;
        if (!header_parms && header_var !== 0) {
          return res.status(400).json("the header parms should contain one parameter");
        }
      }

      if (c.type === "BODY" && c.example?.body_text?.[0]?.length) {
        body_var = c.example.body_text[0].length;
        if (!Array.isArray(body_parms)) {
          return res.status(400).json("body_parms must be an array");
        }
        if (body_parms.length !== body_var) {
          return res
            .status(400)
            .json(`the body parms array should contain ${body_var} parameters`);
        }
      }
    });

    const data = templateMsg(
      userId,
      template_name,
      language,
      header_var,
      header_parms,
      body_var,
      body_parms
    );

    console.log("Sending data:", JSON.stringify(data, null, 2));

    const sendMessage = await axios.post(
      `${meta_url}/${meta_version}/${phone_number_id}/messages`,
      data,
      {
        headers: {
          Authorization: `Bearer ${wa_token}`,
        },
      }
    );

    console.log(sendMessage.data);
    return res.json(sendMessage.data);
  } catch (error) {
    console.log("error:", error);
    return res.status(500).json(error?.response?.data || error.message);
  }
};

exports.createOne = async (req,res)=>{
  const {chatbot_id,domain_id,chnannel_id,scheduled_time,name,users}= req.body
  if(!chatbot_id || !domain_id || !chnannel_id || !scheduled_time || !name || !users){
    return res.status(400).json("make sûre, these fields are required:chatbot_id,!domain_id,!chnannel_id,!scheduled_time,name and users ")
  }
  if(!Array.isArray(users)){
    return res.status(400).json("users must be an array!")
  }
  const user = req.user?.sub;
  if(!user){
    return res.status(403).json("you do not have permission to create a broadcast")
  }
  try{
    let status, role;
    const getUserInfo = await supabase
    .from("user_role")
    .select("role(slug)")
    .eq("id_user", user)
    if(getUserInfo.error){
      return res.status(400).json(getUserInfo.error)
    }
    const roles = [];
    getUserInfo.data.forEach(role => {
      roles.push(role.slug)
    });
    if(!roles.includes("dom-admin") ||!roles.includes("ws-admin") ){
      return res.status(403).json("you do not have permission to create a broadcast")
    }
    if(roles.includes("dom-admin")){ status = "accepted"; role = "dom"}
    if(roles.includes("ws-admin")) {status = "pending"; role = "ws"}

    const domainUsers = await supabase
    .from("user_domain")
    .select("id_user")
    .eq("id_domain", domain_id)
    if(domainUsers.error){
      return res.status(400).json(domainUsers.error)
    }
    if(!domainUsers.data || !domainUsers.data.filter(i=>i.id_user === user)){
      return res.status(403).json("you do not have the permission to create any template in this domaine")
    }
    let bots;
    if(role === "ws"){
    const getWs = await supabase
    .from("workspaces")
    .select("id")
    .eq("domain_id", domain_id)
    .eq("admin", user)
    if(getWs.error){
      return res.status(400).json(getWs.error)
    }
    if(!getWs.data){
      return res.status(403).json("you are not an admine of any worksapces!")
    }
    const workspaces = getWs.data;

    const getChats = Promise.all(workspaces.map(async(ws)=>{
      const result = await supabase
    .from("chatbots")
    .select('botId')
    .eq("workspace_id",ws.id )
    if(result.data){
      bots.push(result.data)
    }
    }))
}
 const getWorkspaces = await supabase
 .from("workspaces")
 .select("*")
 .eq("domain_id",domain_id)
 if(getWorkspaces.error){
  return res.status(400).json(getWorkspaces.error)
 }
 if(getWorkspaces.data.length != 0){
 Promise.all(getWorkspaces.data.map(async(ws)=>{
      const result = await supabase
    .from("chatbots")
    .select('botId')
    .eq("workspace_id",ws.id )
    if(result.data){
      bots.push(result.data)
    }
    }))
 }
  }catch(error){
    return res.status(500).json(error)
  }
}
