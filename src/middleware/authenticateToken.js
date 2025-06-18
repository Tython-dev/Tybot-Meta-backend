const { supabase, supabaseSecret } = require("../config/supabase");
const jwt = require("jsonwebtoken");
const axios = require("axios");

exports.authenticateToken = (req, res, next) => {
  console.log("authenticateToken middleware called");
  let token = null;

  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.split(" ")[0] === "Bearer") {
    token = authHeader.split(" ")[1];
  }

  // Fallback to query parameter for SSE
  if (!token && req.query.token) {
    token = req.query.token;
    console.log("Using token from query parameter");
  }

  if (!token) {
    console.log("No token provided in header or query");
    return res.status(401).json({ error: "Unauthorized. Token missing." });
  }

  try {
    const decodedToken = jwt.verify(token, supabaseSecret);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Error during token verification:", error);
    return res
      .status(401)
      .json({ error: "Invalid token. Unauthorized access." });
  }
};

exports.getUserRoles = async (req, res, next) => {
  try {
    const { data: userRoles, error: rolesError } = await supabase
      .from("user_role")
      .select("role(name, slug)")
      .eq("id_user", req.user.sub);

    if (rolesError) {
      console.error("Error fetching roles:", rolesError);
      return res.status(500).json({ error: "Error fetching user roles" });
    }

    req.userRoles = userRoles.map((r) => r.role.name);
    next();
  } catch (err) {
    console.error("Get user roles middleware error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Helper for Botpress token management
const botTokenManager = {
  /**
   * Retrieves the latest Botpress API token from Supabase
   * @returns {Promise<string>} The stored Botpress API token
   */
  async getToken() {
    const { data: tokens, error } = await supabase
      .from("bot_tokens")
      .select("token")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Error querying bot tokens:", error);
      throw new Error("Failed to retrieve Botpress token");
    }
    if (!tokens || tokens.length === 0) {
      throw new Error("No Botpress token available");
    }

    console.log("Using stored Botpress token");
    return tokens[0].token;
  },
};

// module.exports = {
//   authenticateToken: exports.authenticateToken,
//   getUserRoles: exports.getUserRoles,
//   botTokenManager,
// };
