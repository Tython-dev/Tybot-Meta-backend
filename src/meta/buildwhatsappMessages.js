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


async function buildMsg (item, phone){
        const base = {
          messaging_product: "whatsapp",  
          recipient_type: "individual",
          to: phone
        };
      
        // TEXT MESSAGE
        if (item.type === "text") {
          return {
            ...base,
            type: "text",
            text: { body: item.text }
          };
        }
      
        // IMAGE MESSAGE
        if (item.type === "image") {
          return {
            ...base,
            type: "image",
            image: { link: item.image }
          };
        }
      
      
      
        // SINGLE-CHOICE LIST (dropdown-style)
        if (item.type === "single-choice") {
            const choices = item.choices?.filter(c => c.title && c.value) || [];
            if (choices.length === 0) {
              return {
                ...base,
                type: "text",
                text: { body: item.text || "Please make a selection" }
              };
            }
      
            return {
              ...base,
              type: "interactive",
              interactive: {
                type: "list",
                body: { text: item.text || item.dropdownPlaceholder || "Please make a selection"},
                action: {
                  button: "Options",
                  sections: [{
                    title: item.title||"Options",
                    rows: choices.map(choice => ({
                      id: choice.value,
                      title: choice.title.slice(0, 23),
                      description: choice.description || ""
                    }))
                  }]
                }
              }
            };
        }
        if (item.type === "dropdown") {
            const options = item.options?.filter(c => c.label && c.value) || [];
            if (options.length === 0) {
              return {
                ...base,
                type: "text",
                text: { body: item.message || "Please make a selection" }
              };
            }
      
            return {
              ...base,
              type: "interactive",
              interactive: {
                type: "list",
                body: { text: item.message || item.placeholderText || item.dropdownPlaceholder || "make a selection:" },
                action: {
                  button: "Options",
                  sections: [{
                    title: item.placeholderText||"Options",
                    rows: options.map(choice => ({
                      id: choice.value,
                      title: choice.label,
                      description: choice.description || ""
                    }))
                  }]
                }
              }
            };
        }
      // audio message
      if(item.type === "audio"){
        return {
            ...base,
            type: "audio",
            audio: {
              link: item.audio
            }
        }
      }
      // file message
      if(item.type === "file"){
        return{
            ...base,
            type: "document",
            document: {
                link: item.file,
                filename: item.title
            }
        }
      }
      // video message
      if(item.type === "video"){
        return{
            ...base,
            type: "video",
            video:{
                link: item.video
            }
        }
      }
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
    type: "interactive",
    interactive: {
      type: "button",
      header: {
        type: "image",
        image: { link: item.image }
      },
      body: {
        text: bodyText
      },
      footer: {
        text: item.subtitle
      },
      action: {
        buttons: others.length > 0
          ? others.map(b => ({
              type: "reply",
              reply: {
                id:JSON.stringify(payload),
                title: b.title
              }
            }))
          : [{
              type: "reply",
              reply: {
                id: "no-action",
                title: "No actions available"
              }
            }]
      }
    }
  };
}




        // Unknown type → return an empty object
        return {};
    
}
module.exports = buildMsg;