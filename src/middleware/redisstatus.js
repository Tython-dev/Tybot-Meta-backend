const redis = require("../config/redis");
const { supabase } = require("../config/supabase");
const nodemailer = require("nodemailer");
const redisHost = process.env.REDIS_HOST;
async function sendTestEmail() {
  try {
    const transporter = nodemailer.createTransport({
      host: "mail.tython.org",
      port: 465,
      secure: true, // true for port 465, false for 587
      auth: {
        user: "notif@tybotflow.com",
        pass: "tython0x3",
      },
    });

    const info = await transporter.sendMail({
      from: `notif@tybotflow.com`,
      to: "aicha-azr@tython.org, youssef@tython.org, elorchi@tython.org, belokda.laila@tython.org,belokdalaila@gmail.com, zakaria.naji@tython.org ",
      subject: "⚠️ Action Required: Redis Service Down",
      text:`Dear Team,

This is to inform you that the Redis service running on host "${redisHost}" is currently down.

As you are responsible for maintaining this service, please investigate the issue and take the necessary actions to restore it as soon as possible. 

Real-time data caching and message processing may be affected until the service is restored.

Thank you for your prompt attention.

Best regards,`,
    });

    console.log("✅ Email sent:", info.messageId);
  } catch (error) {
    console.error("❌ Error sending email:", error);
  }
}
const check = async (msg, conversationId, redisIsHealthy) => {
  try {
   if (redisIsHealthy) {
    console.log("✅ Redis is healthy");
    return;
  }
    await sendTestEmail()
  console.log("❌ Redis is not healthy, saving to Supabase...");
    
    const { error: msgError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: msg.sender_id,
      content: msg.content,
      sender_type: msg.sender_type,
      sent_at: msg.sent_at,
      is_read: msg.is_read || false,
    });

    if (msgError) {
      console.error("❌ Error inserting message:", msgError.message);
    }
  } catch (err) {
    console.error("❌ Redis check failed:", err.message);
  }
};
module.exports = check;