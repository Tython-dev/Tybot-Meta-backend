async function shortenURLWithTinyURL(originalURL) {
  const encodedURL = encodeURIComponent(originalURL);
  const apiURL = `https://tinyurl.com/api-create.php?url=${encodedURL}`;

  try {
    const response = await fetch(apiURL);
    if (!response.ok) throw new Error('Failed to shorten URL');
    const shortURL = await response.text();
    return shortURL;
  } catch (error) {
    console.error('Error shortening URL:', error);
    return originalURL; // fallback: return original URL if error occurs
  }
}

const buildTelegramMsg = async(item, phone)=>{
    const base = {
        chat_id: phone
     
    };
  
    // TEXT MESSAGE
    if (item.type === "text") {
      return {
        ...base,
            text: item.text,
      };
    }
  
    // IMAGE MESSAGE
    if (item.type === "image") {
      return {
        ...base,
        photo:item.image  
          }
      };

    // SINGLE-CHOICE LIST (dropdown-style)
if (item.type === "single-choice") {
  const options = item.choices?.filter(c => c.title && c.value) || [];

  if (options.length === 0) {
    return {
      ...base,
      text: item.text || "Please make a selection",
    };
  }

  return {
    ...base,
    text: item.text || "Please make a selection",
    reply_markup: {
      inline_keyboard: options.map(choice => ([
        {
          text: choice.title,  // ✅ Use title for button text
          callback_data: choice.value.toString().slice(0, 64) // ✅ Must be <= 64 bytes
        }
      ]))
    }
  };
}




  // audio message
  if(item.type === "audio"){
    return {
        ...base,
       audio: item.audio
  }
}
  // file message
  if(item.type === "file"){
    return{
        ...base,
       document: item.file
    }
  }
  // video message
  if(item.type === "video"){
    return{
        ...base,
       video: item.video
    }     
  }
 // card message
  if (item.type === "card") {
  const others = [];
  var bodyText = item.title;
 for (const u of item.actions) {
      if (u.action === "Open URL") {
        const shortUrl = await shortenURLWithTinyURL(u.url);
        bodyText += ` - ${shortUrl}`;
        console.log('url:', bodyText);
      } else {
        others.push(u);
      }
    }

 const payload = item.actions[0].payload

  return {
    ...base,
    photo: item.image,
    caption: bodyText,
     reply_markup: {
        inline_keyboard: others.length > 0
          ? others.map(b => ([
                {
                    text: b.title,
                    callback_data: JSON.stringify(payload)
                }
            ]))
          : []
    }
    
  };
}
 // dropdown message
 if (item.type === "dropdown") {
  const options = item.options?.filter(c => c.label && c.value) || [];

  if (options.length === 0) {
    return {
      ...base,
      text: item.placeholderText || "Please make a selection",
    };
  }

  return {
    ...base,
    text: item.placeholderText || item.dropdownPlaceholder || "Choose an option:",
    reply_markup: {
      inline_keyboard: options.map(choice => ([
        {
          text: choice.label,
          callback_data: JSON.stringify({
            type: "dropdown",
            value: choice.value,
            label: choice.label,
          })
        }
      ]))
    }
  };
}

    // Unknown type → return an empty object
    return {};

}
module.exports = buildTelegramMsg;