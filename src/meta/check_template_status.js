const axios = require("axios");
require('dotenv');
const { supabase } = require("../config/supabase");
const meta_url = process.env.META_URL;
const meta_version = process.env.META_VERSION;

const check = async () => {
    console.log('from check template status file...!')
  try {
    const getTemplates = await supabase
      .from("templates")
      .select("*, chatbots(id)")
      .eq("status", "PENDING");

    if (getTemplates.error) {
      console.error("Error fetching templates:", getTemplates.error.message);
      return;
    }

    if (getTemplates.data.length === 0) {
      console.log("There is no template with status 'PENDING'.");
      return;
    }

    const templates = getTemplates.data;

    await Promise.all(
      templates.map(async (t) => {
        const getInfo = await supabase
          .from("channels_config")
          .select("*")
          .eq("chat_id", t.chatbots.id);
console.log('getInfo:', getInfo)
        if (getInfo.error) {
          console.error(`Error retrieving meta info for ${t.botId}:`, getInfo.error.message);
          return;
        }

        const infos = getInfo.data?.[0];
        if (!infos) {
          console.warn(`No config found for botId ${t.botId}`);
          return;
        }

        try {
          const check_status = await axios.get(
            `${meta_url}/${meta_version}/${infos.config.business_account_id}/message_templates`,
            {
              params: { hsm_id: t.template_id, name: t.name },
              headers: {
                Authorization: `Bearer ${infos.config.token}`,
              },
            }
          );
          
          const status = check_status.data.data?.[0]?.status;
          if (!check_status.data) {
            console.warn(`No status returned for template ${t.name}`);
            return;
          }

          const updateStatus = await supabase
            .from("templates")
            .update({status})
            .eq("id", t.id)
            .select('*');
          if (updateStatus.error) {
            console.error(`Error updating status for ${t.name}:`, updateStatus.error.message);
          }
        } catch (err) {
          console.error(`API call failed for template ${t.name}:`, err.message);
        }
      })
    );
  } catch (error) {
    console.error("Unexpected error:", error.message);
  }
};
setInterval(check, 7 * 1000);
