const { supabase } = require("../config/supabase");

exports.verifyPermission = async (req, res, name, next) => {
    const id_user = req.user.userId;
    console.log("User ID:", id_user); // Log the user ID for debugging
    try {
      // Step 1: Retrieve the permission by its name
      const { data, error } = await supabase
        .from("permissions")
        .select("id")
        .eq("name", name)
        .single();
      
      if (error) {
        return res.status(400).json({ error: error.message });
      }
  
      // Check if the permission exists
      if (!data) {
        return res.status(403).json({ error: "Permission denied!" });
      }
      
      const id_permission = data.id;
  
      // Step 2: Check if the user has the specified permission
      const { data: userPermissions, error: permissionError } = await supabase
        .from("user_role_permissions")
        .select("*")
        .eq("id_user", id_user)         // Make sure the check is for the specific user
        .eq("id_permission", id_permission);  // Ensure user has the required permission
  
      if (permissionError) {
        return res.status(400).json({ error: permissionError.message });
      }
  
      // Step 3: If no user-role-permission is found, deny access
      if (userPermissions.length === 0) {
        return res.status(403).json({ error: "Permission denied!" });
      }
  
      // Permission granted, proceed to next middleware
      next();
  
    } catch (error) {
      return res.status(400).json({ error: error.message || "An error occurred" });
    }
  };
  
