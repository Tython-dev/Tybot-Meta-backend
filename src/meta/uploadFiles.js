const { default: axios } = require("axios");
const { supabase } = require("../config/supabase");
const { uploadFileToDomain } = require("../controllers/domainsApis/domainController");

function createMockRes() {
  const resData = {
    statusCode: 200,
    body: null
  };

  const res = {
    status(code) {
      resData.statusCode = code;
      return res;
    },
    json(payload) {
      resData.body = payload;
      return res;
    },
    getData() {
      return resData;
    }
  };

  return res;
}
exports.uploadFiles = async (req, res) => {
    try {
      const domainName = req.params.domainName;
      const chatId = req.body.chatId;
      if (!req.file || !domainName || !chatId) {
        return res.status(400).json({ error: 'File, chatId and domain name required.' });
      }

      const file = req.file;
      const fileSize = Buffer.byteLength(file.buffer);
      const fileType = file.mimetype;

      // get channel id
      const getChannel = await supabase
      .from("channels")
      .select("*")
      .eq("name", "whatsapp")
      if(getChannel.error){
        return res.status(400).json(getChannel.error)
      }
      if(getChannel.data.length === 0){
        return res.status(404).json("you must add whatsapp channel!")
      }
      const wa_id = getChannel.data[0].id;
      console.log("wa_id:", wa_id, getChannel.data)
      // get chat config
      const getConfig = await supabase
      .from("channels_config")
      .select("config")
      .eq("chat_id", chatId)
      .eq("channel_id",wa_id)
      if(getConfig.error){
        return res.status(400).json(getConfig.error)
      }
      if(getConfig.data.length === 0){
        return res.status(404).json("this chat has no config in whatssap channel!")
      }
      const APP_ID = getConfig.data[0].config.app_id;
      const ACCESS_TOKEN = getConfig.data[0].config.token;
    if(!APP_ID || !ACCESS_TOKEN){
      return res.status(404).json("add the app id in  chat config!")
    }
          //Create Facebook upload session
      const sessionRes = await axios.post(
        `https://graph.facebook.com/v23.0/${APP_ID}/uploads`,
        null,
        {
          params: {
            file_name: file.originalname,
            file_length: fileSize,
            file_type: fileType,
            access_token: ACCESS_TOKEN,
          },
        }
      );

      const uploadSessionId = sessionRes.data.id.replace('upload:', '');
let is_uploaded = true;
      //Upload binary to Facebook
      const uploadRes = await axios.post(
        `https://graph.facebook.com/v23.0/upload:${uploadSessionId}`,
        file.buffer,
        {
          headers: {
            Authorization: `OAuth ${ACCESS_TOKEN}`,
            'file_offset': 0,
            'Content-Type': 'application/octet-stream',
          },
        }
      );
if (!uploadRes.data || !uploadRes.data.h) {
  is_uploaded = false;
  return res.status(500).json({ error: 'Meta upload did not return a valid file handle' });
}

    
      // Forward modified req to this existing upload controller
      const mockRes = createMockRes();
await uploadFileToDomain(req, mockRes);
const result = mockRes.getData();
const presignedURL = result?.body?.presignedURL;

if (!presignedURL) {
  return res.status(500).json({ error: "Failed to extract presigned URL" });
}

console.log("uploadfile:", presignedURL);
    // store file info in the supabase
const infoStore = await supabase
.from("template_files")
.insert({
  chat_id:chatId,
  meta_handle:uploadRes.data.h?uploadRes.data.h:null,
  session_id:uploadSessionId,
  is_uploaded,
  url: presignedURL

})  
.select("*")
if(infoStore.error){
  return res.status(400).json(infoStore.error)
}
      return res.status(200).json(infoStore.data)
    } catch (error) {
      console.error("here is the error:",error.response?.data || error);
      return res.status(500).json({ error: 'Upload failed', details: error });
    }
  }