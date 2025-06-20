const { default: axios } = require("axios");
const { supabase } = require("../config/supabase");

function validateHeaderObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return { valid: false, error: 'Object expected.' };
  }

  if (typeof obj.text !== 'string') {
    return { valid: false, error: '"text" must be a string.' };
  }
  if(obj.text.length > 60){
    return {valid:false, error: '"text" must contain less than 60 character.'}
  }
  const regex = /{{\s*([\w]+)\s*}}/g;
  const matches = [...obj.text.matchAll(regex)];

  if (matches.length !== 1) {
    return { valid: false, error: 'Text must contain exactly one variable in the form {{variable}}.' };
  }

  const variableName = matches?.[0]?.[1];
if(variableName){
  if ('example' in obj) {
    if (typeof obj.example !== 'object' || obj.example === null || Array.isArray(obj.example)) {
      return { valid: false, error: '"example" must be an object.' };
    }

    const keys = Object.keys(obj.example);
    if (keys.length !== 1) {
      return { valid: false, error: '"example"of header must contain exactly one key.' };
    }

    const value = obj.example.header_text;
    if (!Array.isArray(value)|| value.length === 0 || !value.every(v => typeof v === 'string')) {
      return { valid: false, error: 'The header_text in example must be an array of strings and not empty.' };
    }
  }else{
    return {valid: false, error: `give an exemple for this variable {{${variableName}}}` }
  }
}
  return { valid: true };
}
function validateBodyObject(obj){
 if (typeof obj !== 'object' || obj === null) {
    return { valid: false, error: 'Object expected.' };
  }

  if (typeof obj.text !== 'string') {
    return { valid: false, error: '"text" must be a string.' };
  }
  if(obj.text.length > 1000 ||obj.text.length < 50 ){
    return {valid:false, error: '"text" must contain greater  than 50 character.'}
  }
  const regex = /{{\s*([\w]+)\s*}}/g;
  const matches = [...obj.text.matchAll(regex)];

//   if (matches.length !== 1) {
//     return { valid: false, error: 'Text must contain exactly one variable in the form {{variable}}.' };
//   }

if(matches){
  if ('example' in obj) {
    if (typeof obj.example !== 'object' || obj.example === null || Array.isArray(obj.example)) {
      return { valid: false, error: '"example" must be an object.' };
    }

    const keys = Object.keys(obj.example);
    if (keys.length !== 1) {
      return { valid: false, error: '"example"of header must contain exactly one key.' };
    }

    const value = obj.example.header_text;
    if (!Array.isArray(value)|| value.length === 0 || !value.every(v => typeof v === 'string')) {
      return { valid: false, error: 'The header_text in example must be an array of strings and not empty.' };
    }
    if(value.length < matches.length){
        return {valid: false, error: `give an exemple for these variables:${matches.slice(value.length).map(match => match[0])} `}
    }
  }else{
    return {valid: false, error: `give an exemple for these variables ${matches.map(match => match[0])}` }
  }
}
  return { valid: true };
}
function validateFooterObject(obj){
 if (typeof obj !== 'object' || obj === null) {
    return { valid: false, error: 'Object expected.' };
  }

  if (typeof obj.text !== 'string') {
    return { valid: false, error: '"text" must be a string.' };
  }
  if(obj.text.length > 60){
    return {valid:false, error: '"text" must contain less  than 60 character.'}
  }  
  return {valid:true}  
}
function validateButtonsObject(obj){
  if (!Array.isArray(obj)|| obj.length === 0) {
      return { valid: false, error: "The buttons array mustn't be empty." };
    }
    if(obj.length > 4){
      return {valid:false, error:'the buttons array must contain less or 4 buttons'}
    }
  let types = [];
  let countMap = {};
  const buttonType = ["URL", "PHONE_NUMBER","QUICK_REPLY"]

  obj.map(o=>types.push(o.type)) 
  for (const t of types) {
    if(!buttonType.contains(t)){
      return {valid:false, error: `this type /'${t}'/ doesn't include in buttons types: ${buttonType}`}
    }
  countMap[t] = (countMap[t] || 0) + 1;
}

console.log(countMap);
if(countMap["URL"] > 2){
  return {valid:false, error: 'it must be less than 2 buttons of type "URL".'}
}
if(countMap["PHONE_NUMBER"] > 1){
  return {valid:false, error: 'it must be less than 1 buttons of type "PHONE_NUMBER".'}
}
return {valid:true}
}
require("dotenv");
const meta_url = process.env.META_URL;
const version = process.env.META_VERSION
function validateTemplatePayload(payload) {
  if (typeof payload !== 'object' || payload === null) {
    return { valid: false, error: 'Payload must be an object.' };
  }

  if (!Array.isArray(payload.components)) {
    return { valid: false, error: '"components" must be an array.' };
  }

  const validComponentTypes = ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'];
  const variableRegex = /{{\s*(\d+)\s*}}/g;

  const errors = [];

  for (const component of payload.components) {
    const { type } = component;

    if (!validComponentTypes.includes(type)) {
      errors.push(`Invalid component type: "${type}".`);
      continue;
    }

    // Validate HEADER
    if (type === 'HEADER') {
      if (component.format !== 'TEXT') {
        errors.push('HEADER format must be "TEXT".');
        continue;
      }

      if (typeof component.text !== 'string' || component.text.length > 60) {
        errors.push('HEADER "text" must be a string under 60 characters.');
        continue;
      }

      const matches = [...component.text.matchAll(variableRegex)];
      if (matches.length !== 1) {
        errors.push('HEADER "text" must contain exactly one variable like {{1}}.');
        continue;
      }

      if (!component.example || !Array.isArray(component.example.header_text)) {
        errors.push('HEADER must have an example with "header_text" as a non-empty array.');
        continue;
      }
    }

    // Validate BODY
    if (type === 'BODY') {
      if (typeof component.text !== 'string' || component.text.length < 50 || component.text.length > 1000) {
        errors.push('BODY "text" must be a string between 50 and 1000 characters.');
        continue;
      }

      const matches = [...component.text.matchAll(variableRegex)];
      const expectedVars = new Set(matches.map(m => m[1])); 

      if (!component.example || !Array.isArray(component.example.body_text)) {
        errors.push('BODY must have an example with "body_text" as a non-empty 2D array.');
        continue;
      }

      const exampleRows = component.example.body_text;
      if (
        exampleRows.length === 0 ||
        !exampleRows.every(row => Array.isArray(row) && row.length >= expectedVars.size)
      ) {
        errors.push(`BODY "example.body_text" must have enough values for all variables: {{${[...expectedVars].join('}}, {{')}}}.`);
        continue;
      }
    }

    // Validate FOOTER
    if (type === 'FOOTER') {
      if (typeof component.text !== 'string' || component.text.length > 60) {
        errors.push('FOOTER "text" must be a string under 60 characters.');
      }
    }

    // Validate BUTTONS
    if (type === 'BUTTONS') {
      if (!Array.isArray(component.buttons) || component.buttons.length === 0) {
        errors.push('BUTTONS must be a non-empty array.');
        continue;
      }

      if (component.buttons.length > 4) {
        errors.push('BUTTONS array must contain 4 or fewer items.');
        continue;
      }

      const allowedTypes = ['URL', 'PHONE_NUMBER', 'QUICK_REPLY'];
      const count = { URL: 0, PHONE_NUMBER: 0, QUICK_REPLY: 0 };

      for (const btn of component.buttons) {
        if (!allowedTypes.includes(btn.type)) {
          errors.push(`Invalid button type: "${btn.type}".`);
          continue;
        }
        count[btn.type]++;
      }

      if (count.URL > 2) errors.push('At most 2 buttons of type "URL" are allowed.');
      if (count.PHONE_NUMBER > 1) errors.push('At most 1 button of type "PHONE_NUMBER" is allowed.');
    }
  }

  return errors.length > 0 ? { valid: false, error: errors } : { valid: true };
}

exports.createTemplate = async (req, res) => {
  try {
    const { botId, payload } = req.body;
    if (!botId || !payload) {
      return res.status(400).json({ error: 'Missing botId or payload.' });
    }
    const isValid = validateTemplatePayload(payload);
    if (!isValid.valid) {
      return res.status(400).json({ error: isValid.error });
    }
    const botInfo = await supabase
      .from("chatbots")
      .select("whatsapp_business_account_id, wa_token")
      .eq("botId", botId)

    if (botInfo.error) {
      return res.status(500).json(botInfo.error);
    }

    if (!botInfo) {
      return res.status(404).json({ error: 'No bot found .' });
    }

    const { whatsapp_business_account_id: wa_acc_id, wa_token: token } = botInfo.data[0];

    const meta_api = await axios.post(
      `${meta_url}/${version}/${wa_acc_id}/message_templates`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
console.log('meta _response:', meta_api)
if(meta_api.status === 200){
  const insertTemplate = await supabase
  .from("templates")
  .insert({botId,template_id:meta_api.data.id,status:meta_api.data.status, name: payload.name, category: payload.category, language: payload.language, components: payload.components})
  .select('*')
  if(insertTemplate.error){
    return res.status(400).json(insertTemplate.error)
  }
}
    return res.status(200).json({ message: "The template has been created successfully." });

  } catch (err) {
    console.error("createTemplate error:", err?.response?.data || err.message);
    return res.status(500).json({
      error: "Internal server error.",
      details:err?.response?.data
    });
  }
};
exports.deleteTemplate = async(req,res) =>{
  const {id} = req.params;
  if(!id){
    return res.status(400).json('id is required!')
  }
  try{
    const getTemplate = await supabase
    .from("templates")
    .select('*,chatbots(id,botId)')
    .eq('id', id) 
    if(getTemplate.error){
      return res.status(400).json(getTemplate.error)
    }
    if(getTemplate.data.length === 0){
      return res.status(404).json('template not found!')
    }
    const {template_id, name, chatbots} = getTemplate.data[0]
    const getMetaInfo = await supabase
    .from("channels_config")
    .select('*, channels(name)')
    .eq('chat_id', chatbots.id)
    
    if(getMetaInfo.error){
      return res.status(400).json(getMetaInfo.error)
    }
    if(getMetaInfo.data.length === 0){
      return res.status(404).json("please, add chatbot configuration in WhatsApp channel so you can delete the template!")
    }
   const infos = getMetaInfo.data.filter(i=> i.channels.name === "whatsapp")
   if (infos.length === 0) {
  return res.status(400).json("No WhatsApp channel configuration found for this chatbot.");
}
   const {config} = infos[0];
   const bus_acc = config.business_account_id;
   const token = config.token;
  const deletefromMeta = await axios.delete(`${meta_url}/${version}/${bus_acc}/message_templates?hsm_id=${template_id}&name=${name}`,{headers: {Authorization: `Bearer ${token}`}})
  console.log('meta_response:', deletefromMeta)
  if(deletefromMeta.error){
    return res.status(400).json(deletefromMeta)
  }
  const fromSupabase = await supabase
  .from('templates')
  .delete()
  .eq('id', id)
  if(fromSupabase.error){
    return res.status(400).json(fromSupabase.error)
  }
  return res.status(200).json({message: "Template deleted successfully"})
  }catch(error){
    console.log('error:', error)
    return res.status(500).json(error)
  }
}