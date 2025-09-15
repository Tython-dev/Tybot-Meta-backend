const Redis = require("ioredis");
const { supabase } = require("./supabase");


const redis = new Redis({
  host: "82.112.241.117",
  port: 6379,
  db: 11
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

// 2 * 60 * 1000
//1 * 60 * 60 * 1000 // one hour
// setInterval(async () => {
//   //console.log("⏰ Checking Redis sessions...");

//   try {
//     const keys = await redis.keys("session:*");
//     const sessionKeys = keys.filter((key) => !key.endsWith(":messages"));
// console.log('keys:', keys)
//     if (sessionKeys.length === 0) {
//       console.log("⚠️ No session keys found.");
//       return;
//     }

//     for (const key of sessionKeys) {
//       //console.log(`\n🔍 Processing session key: ${key}`);
//   const ttl = await redis.ttl(key);
//       //console.log('ttl:', ttl)
//       if (ttl < 300 && ttl > 0) { 
//       const session = await redis.get(key);
//         if (!session) {
//           console.log(`⚠️ No session found for ${key}`);
//           continue;
//         }

//         const parsedSession = JSON.parse(session);
//         const messageListKey = `${key}:messages`;
//         const rawMessages = await redis.lrange(messageListKey, 0, -1);

//         if (rawMessages.length === 0) {
//           console.log(`📭 No messages found for session ${key}`);
//           continue;
//         }

//         const parsedMessages = rawMessages.map((msg) => JSON.parse(msg));
//         console.log(`💬 ${parsedMessages.length} messages found.`);

//         const conversationId = key.split(":")[1];

//         // ✅ Step: Ensure conversation exists
//         const { data: conversation, error: conversationError } = await supabase
//           .from("conversations")
//           .select("id, end_user_id, channels(name)")
//           .eq("id", conversationId)
//           .single();

//         if (conversationError || !conversation) {
//           console.warn(`⚠️ Conversation ${conversationId} not found. Skipping message insert.`);
//           continue;
//         }

//         if (!conversation.end_user_id && conversation.channels.name !== "web") {
//           console.warn(`⚠️ Conversation ${conversationId} has null end_user_id.`);
//         }

//         // ✅ Step: Insert messages
//         for (const msg of parsedMessages) {
//           if (!msg.content || (!msg.sender_id && !msg.web) || !msg.sender_type) {
//             console.warn("⚠️ Skipping invalid message:", msg);
//             continue;
//           }

//           const { error: msgError } = await supabase.from("messages").insert({
//             conversation_id: conversationId,
//             sender_id: msg.sender_id,
//             content: msg.content,
//             sender_type: msg.sender_type,
//             sent_at: msg.sent_at,
//             is_read: msg.is_read || false,
//           });

//           if (msgError) {
//             console.error("❌ Error inserting message:", msgError.message);
//           }
//         }

//         // ✅ Step: Clean up Redis
//         await redis.del(key);
//         await redis.del(messageListKey);
//         console.log(`✅ Flushed session: ${key}`);
//       }
//     }
//   } catch (err) {
//     console.error("❌ Unexpected error:", err.message || err);
//   }
// await flushMessagesToSupabase(conversationId);

// }, 2 * 60 * 1000); // every 2 minutes
// 30 * 1000
module.exports = redis;
