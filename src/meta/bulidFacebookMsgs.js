const buildFacebookMsg = (item, phone)=>{
    const base = {
        recipient:{
            id: phone
        }, 
        messaging_type: "RESPONSE",
     
    };
  
    // TEXT MESSAGE
    if (item.type === "text") {
      return {
        ...base,
        message:{
            text: item.text,
        }
      };
    }
  
    // IMAGE MESSAGE
    if (item.type === "image") {
      return {
        ...base,
        message:{
            attachment:{
              type:"image", 
              payload:{
                is_reusable: true,
                url:item.image
              }
            }
          }
      };
    }
  
  
  
    // SINGLE-CHOICE LIST (dropdown-style)
    if (item.type === "single-choice") {
        const choices = item.choices?.filter(c => c.title && c.value) || [];
        if (choices.length === 0) {
          return {
            ...base,
            message: {
                text: item.text || "Please make a selection"
              }
          };
        }
  
        return {
          ...base,
          message:{
    text:  item.text || item.dropdownPlaceholder ,
    quick_replies: choices.map(choice => ({
        content_type: "text",
        title: choice.title,
        payload: choice.title
    }))
    
  }
        };
    }
  // audio message
  if(item.type === "audio"){
    return {
        ...base,
        message:{
            attachment:{
              type:"audio", 
              payload:{
                is_reusable: true,
                url:item.audio
              }
            }
          }
    }
  }
  // file message
  if(item.type === "file"){
    return{
        ...base,
        message:{
            attachment:{
              type:"file", 
              payload:{
                is_reusable: true,
                url:item.file
              }
            }
          }
    }
  }
  // video message
  if(item.type === "video"){
    return{
        ...base,
        message:{
            attachment:{
              type:"video", 
              payload:{
                is_reusable: true,
                url:item.video
              }
            }
          }
    }
  }
    // Unknown type → return an empty object
    return {};

}
module.exports = buildFacebookMsg;