const Redis = require("ioredis");
const { supabase } = require("./supabase");

const redis = new Redis({
  host: "82.112.241.117",
  port: 6379,
  db: 10,
});

console.log("✅ Redis task script started...");

setInterval(async () => {
  console.log("⏰ Checking Redis sessions...");

  try {
    const keys = await redis.keys("session:*");
    const sessionKeys = keys.filter((key) => !key.endsWith(":messages"));

    if (sessionKeys.length === 0) {
      console.log("⚠️ No session keys found.");
      return;
    }

    for (const key of sessionKeys) {
      console.log(`\n🔍 Processing session key: ${key}`);
      const ttl = await redis.ttl(key);
      console.log("ttl:", ttl);

      if (ttl < 400 && ttl > 0) {
        const session = await redis.get(key);
        if (!session) {
          console.log(`⚠️ No session found for ${key}`);
          continue;
        }

        const parsedSession = JSON.parse(session);
        const messageListKey = `${key}:messages`;
        const rawMessages = await redis.lrange(messageListKey, 0, -1);

        if (rawMessages.length === 0) {
          console.log(`📭 No messages found for session ${key}`);
          continue;
        }

        const parsedMessages = rawMessages.map((msg) => JSON.parse(msg));
        console.log(`💬 ${parsedMessages.length} messages found.`);

        const conversationId = key.split(":")[1];

        // ✅ Step: Ensure conversation exists
        const { data: conversation, error: conversationError } = await supabase
          .from("conversations")
          .select("id, end_user_id")
          .eq("id", conversationId)
          .single();

        if (conversationError || !conversation) {
          console.warn(`⚠️ Conversation ${conversationId} not found. Skipping message insert.`);
          continue;
        }

        if (!conversation.end_user_id) {
          console.warn(`⚠️ Conversation ${conversationId} has null end_user_id.`);
        }

        // ✅ Step: Insert messages
        for (const msg of parsedMessages) {
          if (!msg.content || !msg.sender_id || !msg.sender_type) {
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
            console.error("❌ Error inserting message:", msgError.message);
          }
        }

        // ✅ Step: Clean up Redis
        await redis.del(key);
        await redis.del(messageListKey);
        console.log(`✅ Flushed session: ${key}`);
      }
    }
  } catch (err) {
    console.error("❌ Unexpected error:", err.message || err);
  }
}, 2 * 60 * 1000); // every 2 minutes

module.exports = redis;
