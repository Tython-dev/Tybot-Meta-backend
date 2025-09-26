const fs = require("fs");
const axios = require("axios");
const { uploadFile } = require("../controllers/MINIOSupabase/minioController");


const downloadAndUploadTelegramPhoto = async (
  fileId,
  botToken,
  bucketName = "zack10",
  name 
) => {
  console.log("BotToken & fileId:", botToken, fileId);

  try {
    // 1. Get Telegram file path
    const res = await axios.get(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
    );
    const filePath = res.data.result.file_path;
    const mediaUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

    // 2. Download file as buffer
    const fileRes = await axios.get(mediaUrl, { responseType: "arraybuffer" });

    // 3. Build file object like multer would
    const file = {
      originalname: `${name}-${Date.now()}.${filePath.split(".").pop()}`,
      buffer: fileRes.data,
      mimetype: fileRes.headers["content-type"],
      size: fileRes.data.length,
    };

    // 4. Mock req/res
    const mockReq = {
      params: { bucketName },
      body: { folderPath: "", metadata: JSON.stringify({ source: "telegram" }) },
      file,
      user: { id: "system-bot" }, // optional
    };

    const resData = { statusCode: 200, body: null };
    const mockRes = {
      status(code) {
        resData.statusCode = code;
        return this;
      },
      json(payload) {
        resData.body = payload;
        return this;
      },
      getData() {
        return resData;
      },
    };

    // 5. Call uploadFile directly
    await uploadFile(mockReq, mockRes);

    const data = mockRes.getData();
    console.log("✅ Uploaded:", data);

    // 6. Return Supabase public/signed URL
    return data.body?.urls?.supabase?.signed || data.body?.urls?.supabase?.public || null;
  } catch (err) {
    console.error("❌ Error downloading/uploading Telegram media:", err);
    return null;
  }
};



const handleTelegram = async (msg, token) => {
  let messageText = "";
  let payload = null;

  if (msg?.callback_query) {
    payload = msg.callback_query.data;
    const tab = msg.callback_query.message.reply_markup.inline_keyboard;
    const value = tab.filter(t=>t[0].callback_data === payload)
    console.log('value:', value)
    messageText = value[0][0].text;
  } else if (msg?.message?.photo) {
      const photos = msg.message.photo;
    const bestPhoto = photos[photos.length - 1];
    const file_id = bestPhoto.file_id;

    // Upload to MinIO
    const presignedURL = await downloadAndUploadTelegramPhoto(file_id, token, "zack10", name="image");
    console.log('url:',presignedURL)
    messageText = presignedURL || "Upload failed";
  }else if(msg?.message?.location){
    const location = msg.message.location;
    messageText =  `${location.latitude},${location.longitude}`
  }else if(msg?.message?.document){
    const file_id = msg.message.document.file_id;
    const presignedURL = await downloadAndUploadTelegramPhoto(file_id, token, "zack10", name="image");
    console.log('url:',presignedURL)
    messageText = presignedURL || "Upload failed";;
  }else if(msg?.message?.vedio){
    const location = msg.message.location;
    messageText =  `${location.latitude},${location.longitude}`
  } else {
    messageText = msg?.message?.text || msg?.text || null;
  }

  return { messageText, payload };
};

module.exports = handleTelegram;