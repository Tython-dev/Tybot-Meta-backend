const axios = require("axios");
const { supabase } = require("../config/supabase");
require("dotenv").config();

const verifyStatus = async (req, res, next) => {
  try {
    // Fetch credentials from Supabase
    const { data, error } = await supabase
      .from("bot_tokens")
      .select("token, botpress_url, email, password")

    if (error || !data || data.length === 0 || !data[0].token) {
      console.log("❌ Supabase fetch failed:", error);
      return res.status(400).json({ message: "Failed to fetch bot credentials." });
    }

    const { token, botpress_url, email, password } = data[0];
    let botpressResponse;

    try {
      botpressResponse = await axios.get(`${botpress_url}/api/v1/admin/ping`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      if (err.response && err.response.status === 401) {
        // Re-authenticate
        const loginRes = await axios.post(`${botpress_url}/api/v1/auth/login/basic/default`, {
          email,
          password,
        });

        if (loginRes.data?.payload?.jwt) {
          const newToken = loginRes.data.payload.jwt;

          await supabase
            .from("bot_tokens")
            .update({ token: newToken })
            .eq("email", email);

          console.log("🔁 Token refreshed and updated in Supabase");

          // Retry with new token
          botpressResponse = await axios.get(`${botpress_url}/api/v1/admin/ping`, {
            headers: { Authorization: `Bearer ${newToken}` },
          });
        } else {
          return res.status(400).json({ message: "Login failed", error: loginRes.data });
        }
      } else {
        return res.status(400).json({ message: "Botpress ping failed", error: err.message });
      }
    }

    if (botpressResponse.status !== 200) {
      return res.status(400).json({ message: "Botpress is not available" });
    }

    console.log("✅ Botpress verified");
    next();
  } catch (error) {
    console.error("❌ Error verifying status:", error);
    return res.status(500).json({ error: "Server error during status verification." });
  }
};
//   const redis_healthy = false;
// redis.ping().then((result) => {
//   if (result === "PONG") {
//     console.log("✅ Redis is healthy");
//   } else {
//     console.log("❌ Redis did not respond properly");
//   }
// }).catch((err) => {
//   console.error("❌ Redis connection failed:", err.message);
// });
module.exports = verifyStatus;
