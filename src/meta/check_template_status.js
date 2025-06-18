const { supabase } = require("../config/supabase")

const check = async (req,res)=>{
    try{
    const getTemplates = await supabase
    .from('templates')
    .select('*')
    .eq('status', "PENDING")
    if(getTemplates.error){
        return res.status(400).error(getTemplates.error)
    }
    }catch(error){
        return res.status(500)
    }
}
