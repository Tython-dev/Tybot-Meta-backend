const { default: axios } = require("axios");
const { supabase } = require("../config/supabase");
const url = process.env.META_URL;
// Upload a file to Supabase storage
const uploadFile = async (file) => {
  const filePath = `uploads/${Date.now()}-${file.originalname}`;
  const response = await supabase.storage
    .from("files")
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (response.error) {
    console.log("Upload error:", response.error);
    return null;
  }

  const { data: publicUrlData } = supabase.storage
    .from("files")
    .getPublicUrl(filePath);

  if (!publicUrlData || !publicUrlData.publicUrl) {
    console.log({ error: "Failed to retrieve image URL" });
    return null;
  }

  return publicUrlData.publicUrl;
};

// Download media from Facebook and upload it
const downloadAndUpload = async (id,v, token, name = "file") => {
  try {
    const meta = await axios.get(`${url}/${v}/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const mediaUrl = meta.data.url;
    const fileRes = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: "arraybuffer",
    });

    const file = {
      originalname: `${name}-${Date.now()}`,
      buffer: fileRes.data,
      mimetype: fileRes.headers["content-type"],
    };

    return await uploadFile(file);
  } catch (err) {
    console.error("Error downloading/uploading media:", err.message);
    return null;
  }
};

const handleMsg = async (msg, token, v) => {
  let messageText = "";
  let payload;
  // let type = msg?.type;
  switch (msg?.type) {
    case "text":
      messageText = msg.text?.body;
      break;

    case "interactive":
      if (msg.interactive.type === "button_reply") {
        console.log(
          "Received button_reply:",
          JSON.stringify(msg.interactive.button_reply, null, 2)
        );
        messageText = msg.interactive.button_reply.title;

        if (!msg.interactive.button_reply.id) {
          console.error("button_reply.id is missing or undefined");
          payload = [{ productId: "unknown", productName: messageText }];
        } else {
          try {
            payload = msg.interactive.button_reply.id;
            console.log("Parsed payload:", JSON.stringify(payload, null, 2));
            if (!Array.isArray(payload)) throw new Error("Payload is not an array");
          } catch (e) {
            console.error(
              "Failed to parse button_reply.id:",
              msg.interactive.button_reply.id,
              "Error:",
              e.message
            );
            payload = msg.interactive.button_reply.id;
          }
        }
        console.log("Final payload:", JSON.stringify(payload, null, 2));
      } else if (msg.interactive.type === "list_reply") {
        messageText = `${msg.interactive.list_reply.title}`;
      }
      break;

    case "location":
      messageText = `${msg.location.latitude},${msg.location.longitude}`;
      break;

    case "image":
      messageText = await downloadAndUpload(msg.image.id,v, token, "image");
      break;

    case "audio":
      messageText = await downloadAndUpload(msg.audio.id,v, token, "audio");
      break;

    case "video":
      messageText = await downloadAndUpload(msg.video.id,v, token, "video");
      break;

    case "document":
      messageText = await downloadAndUpload(msg.document.id,v, token, "document");
      break;

    case "sticker":
      messageText = await downloadAndUpload(msg.sticker.id,v, token, "sticker");
      break;

    case "contacts":
      try {
        payload = msg.contacts;
        console.log("Parsed payload:", JSON.stringify(payload, null, 2));
        if (!Array.isArray(payload)) throw new Error("Payload is not an array");
      } catch (e) {
        console.error("Failed to parse:", msg.contacts, "Error:", e.message);
        payload = msg.contacts;
      }
      break;

    default:
      console.log("Unhandled message type:", msg?.type);
      return { status: 200, message: "Message type not supported" };
  }

  return { messageText, payload};
};

module.exports = handleMsg;
