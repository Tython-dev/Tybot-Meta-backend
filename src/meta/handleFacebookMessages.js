const handleFacebookMsg = async (msg, token) => {
  let messageText = "";
  let payload = msg?.quick_reply?.payload || null;

  // If it's a plain text message
  if (!msg?.attachments || msg.attachments.length === 0) {
    messageText = msg?.text || "";
  } else {
    const attachment = msg.attachments[0];
    const allowedTypes = ["image", "audio", "video", "file"];

    if (allowedTypes.includes(attachment?.type)) {
      messageText = attachment.payload?.url || "";
    } else {
      console.warn(`Unsupported attachment type: ${attachment?.type}`);
    }
  }

  return { messageText, payload };
};

module.exports = handleFacebookMsg;
