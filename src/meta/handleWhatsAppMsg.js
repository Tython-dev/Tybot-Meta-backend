const { default: axios } = require("axios");
const url = process.env.META_URL;
const { uploadFile } = require("../controllers/MINIOSupabase/minioController");
// const uploadFile = async (file) => {
//   try {
//     const fileSize = Buffer.byteLength(file.buffer);

//     const { data: domainRow, error: domErr } = await supabase
//       .from("domains")
//       .select("storage_bucket_name, storage_quota")
//       .eq("name", "meta")
//       .single();
//     if (domErr || !domainRow) {
//       console.log({ error: "Domain not found" });
//       return null;
//     }
//     const { storage_bucket_name, storage_quota } = domainRow;
//     if (!storage_bucket_name) {
//      console.log({ error: "No bucket assigned to this domain" });
//      return null;
//     }

//     let continuationToken = null;
//     let totalUsed = 0;
//     do {
//       const listParams = {
//         Bucket: storage_bucket_name,
//         ContinuationToken: continuationToken || undefined,
//       };
//       const listed = await s3.listObjectsV2(listParams).promise();
//       for (const obj of listed.Contents) {
//         totalUsed += obj.Size;
//       }
//       continuationToken = listed.IsTruncated
//         ? listed.NextContinuationToken
//         : null;
//     } while (continuationToken);

//     if (totalUsed + fileSize > storage_quota) {
//      console.log({ error: "Uploading this file would exceed your 3 GiB quota." });
//      return null;
//     }

//     const key = `${Date.now()}_${file.originalname}`;
//     await s3
//       .putObject({
//         Bucket: storage_bucket_name,
//         Key: key,
//         Body: file.buffer,
//         ContentType: file.mimetype,
//       })
//       .promise();

//     const presignedURL = s3.getSignedUrl("getObject", {
//       Bucket: storage_bucket_name,
//       Key: key,
//       Expires: 60 * 60, // 1 hour
//     });
//     return presignedURL;
    
//   } catch (err) {
//     console.error(err);
//     return null;
//   }
// };
// Download media from Facebook and upload it
const downloadAndUpload = async (id, v, token, name = "file") => {
  try {
    // Get meta info with timeout
    const meta = await axios.get(`${url}/${v}/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000
    });

    const mediaUrl = meta.data.url;
    const fileRes = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: "arraybuffer",
      timeout: 15000
    });

    const file = {
      originalname: `${name}-${Date.now()}`,
      buffer: fileRes.data,
      mimetype: fileRes.headers["content-type"],
      size: fileRes.data.length, // 🔹 added size
    };

    console.log("✅ File downloaded:", {
      name: file.originalname,
      size: file.size,
      type: file.mimetype,
    });

    function createMockRes() {
      const resData = { statusCode: 200, body: null };
      return {
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
    }

    const mockRes = createMockRes();

    // 🔹 include user + body if needed
    await uploadFile(
      {
        file,
        params: { bucketName: "zack10" },
        body: {}, // add folderPath/metadata here if you want
        user: { userId: "system" },
      },
      mockRes
    );

    const result = mockRes.getData();
    console.log("here:", JSON.stringify(result, null, 2));
    return result.body?.urls?.supabase?.signed; // or .public
  } catch (err) {
    console.error("Error downloading/uploading media:", err);
    return null;
  }
};


const handleMsg = async (msg, token, v) => {
  let messageText = "";
  let payload;
  console.log('message from whatsapp:', msg)
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
        messageText = msg.interactive.button_reply.title || msg.interactive.button_reply.text;

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
 
    case "button":
      console.log("button_template:", msg.button)
      messageText = msg.button?.text
      break;
    default:
      console.log("Unhandled message type:", msg?.type);
      messageText = null;
      return { status: 200, message: "Message type not supported" };
  }

  return { messageText, payload};
};

module.exports = handleMsg;
