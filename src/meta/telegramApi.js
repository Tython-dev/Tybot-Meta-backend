const { default: axios } = require("axios");
const buildTelegramMsg = require("./buildtelegramMsg");

// Builder for carousel-style card
function buildTelegramCard(product, productPayload, chatId) {
  return {
    chat_id: chatId,
    photo: product.image,
    caption: `*${product.title}*\n${product.subtitle}`,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: product.actions[0]?.title || product.title.substring(0, 20),
            callback_data: JSON.stringify(productPayload)
          }
        ]
      ]
    }
  };
}

exports.telegramApi = async ({ item, token, phone }) => {
  try {
    let method;
    let message;

    // Handle carousel separately
    if (item.type === "carousel") {
      const results = [];
      for (const product of item.items) {
        const action = product.actions?.[0];
        if (!action || !action.payload) {
          results.push({
            status: "failed",
            product_id: product.title,
            error: "Invalid action or payload"
          });
          continue;
        }
        const productPayload = action.payload || [product.title];
        const cardMessage = buildTelegramCard(product, productPayload, phone);

        const res = await axios.post(
          `https://api.telegram.org/bot${token}/sendPhoto`,
          cardMessage,
          { headers: { "Content-Type": "application/json" } }
        );

        results.push({
          status: "sent",
          product_id: productPayload[0]?.productId || "unknown",
          message_id: res.data.result.message_id
        });

        await new Promise(r => setTimeout(r, 500)); // throttle a bit
      }
      return results;
    }

    // For normal messages
    switch (item.type) {
      case "image":
        method = "sendPhoto";
        break;
      case "audio":
        method = "sendAudio";
        break;
      case "file":
        method = "sendDocument";
        break;
      case "video":
        method = "sendVideo";
        break;
      default:
        method = "sendMessage";
    }

    message = await buildTelegramMsg(item, phone);

    console.log("message telegram here", message);

    const response = await axios.post(
      `https://api.telegram.org/bot${token}/${method}`,
      message,
      { headers: { "Content-Type": "application/json" } }
    );

    return response.data;
  } catch (error) {
    console.error(
      "Error sending Telegram message:",
      error.response?.data || error.message
    );
  }
};
