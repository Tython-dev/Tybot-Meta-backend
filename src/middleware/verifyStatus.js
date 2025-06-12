const axios = require("axios");
const { supabase } = require("../config/supabase");
require("dotenv").config();
const verifyStatus = async (req, res, next) => {
  const result = 1;
  try {
    // Check Supabase
    const { data, error } = await supabase
    .from("bot_tokens")
    .select("token, botpress_url")
    .eq("email", "chatbot@tython.org")
    .single(); 
    
    if (error || !data?.token) {
      console.log("Failed to send your message!",error)
      return res.status(400).json({ message: "Failed to send your message!" });
    }
    
    const url = data.botpress_url;
        const token = data.token;
    // Check Botpress
    const botpressResponse = await axios.get(`${url}/api/v1/admin/ping`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    // console.log('botresponse:',botpressResponse)
    if (botpressResponse.status !== 200) {
        // console.log('status:', botpressResponse)
        console.log("Failed to send your message!",botpressResponse)
      return res.status(400).json({ message: "Failed to send your message!", botpressResponse });
    }

    console.log("✅ Your message is sending successfully!");
    next(); 
  } catch (error) {


    console.error("❌ Error verifying status:", error);
    return res.status(500).json({ error: "Server error during status verification." });
  }
};

module.exports = verifyStatus;
