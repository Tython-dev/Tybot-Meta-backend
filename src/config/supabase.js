const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
	process.env.SUPABASE_KEY;
const supabaseSecret =
	process.env.SUPABASE_JWT_SECRET ;

const supabase = createClient(supabaseUrl, supabaseKey, {
	db: { schema: "public" },
	auth: {
		autoRefreshToken: true,
		persistSession: false,
	},
});

console.log("Supabase client initialized:", {
	url: supabaseUrl,
	schema: "public",
});

module.exports = { supabase, supabaseSecret };
