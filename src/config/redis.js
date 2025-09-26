const Redis = require("ioredis");
const { supabase } = require("./supabase");


const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  db: process.env.REDIS_DB,
});
console.log("✅ Redis task script started...");

const flushAllRedisSessionsToSupabase = async () => {
  try {
    const keys = await redis.keys("session:*");
    const sessionKeys = keys.filter((key) => !key.endsWith(":messages"));

    if (!sessionKeys.length) {
      console.log("⚠️ No active sessions found.");
      return;
    }

    for (const sessionKey of sessionKeys) {
      const messageKey = `${sessionKey}:messages`;
      const rawMessages = await redis.lrange(messageKey, 0, -1);
      if (!rawMessages.length) {
        console.log(`📭 No messages found for ${sessionKey}`);
        continue;
      }

      const sessionData = await redis.get(sessionKey);
      if (!sessionData) {
        console.warn(`⚠️ Missing session data for ${sessionKey}`);
        continue;
      }

      const parsedMessages = rawMessages.map((msg) => JSON.parse(msg));
      const conversationId = sessionKey.split(":")[1];

      const { data: conversation, error: convoError } = await supabase
        .from("conversations")
        .select("id, end_user_id, channels(name)")
        .eq("id", conversationId)
        .single();

      if (convoError || !conversation) {
        console.warn(`❌ Conversation ${conversationId} not found.`);
        continue;
      }

      // reset for each session
      let allOk = true;

      for (const msg of parsedMessages) {
        if (!msg.content || (!msg.sender_id && !msg.web) || !msg.sender_type) {
          console.warn("⚠️ Skipping invalid message:", msg);
          continue;
        }

        const { error: msgError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: msg.sender_id,
          content: msg.content,
          sender_type: msg.sender_type,
          sent_at: msg.sent_at,
          is_read: msg.is_read || false,
        });

        if (msgError) {
          allOk = false; 
          console.error("❌ Error inserting message:", msgError.message);
        }
      }

      // delete Redis keys if everything succeeded
      if (allOk) {
        await redis.del(sessionKey);
        await redis.del(messageKey);
        console.log(`✅ Flushed ${parsedMessages.length} messages from ${sessionKey}`);
      } else {
        console.warn(`⚠️ Not deleting ${sessionKey} due to insert errors`);
      }
    }
  } catch (error) {
    console.error("❌ Error flushing Redis sessions:", error.message || error);
  }
};

setInterval(flushAllRedisSessionsToSupabase, 45 * 60 * 1000);

module.exports = redis;
