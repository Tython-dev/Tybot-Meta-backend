const s3 = require("../../config/minioClient");
const { supabase } = require("../../config/supabase");
const SIGNED_URL_EXPIRES = 60 * 60;
const redis = require("../../config/redis")
async function storeKnowledge(supabase, params, fileMeta) {
  const baseUpsert = {
    domain_id: params.domainId,
    workspace_id: params.workspaceId || null,
    chatbot_id: params.chatbotId || null,
    name: fileMeta.title,
    description: null,
  };

  const { data: base, error: baseErr } = await supabase
    .from("knowledge_bases")
    .upsert(baseUpsert)
    .select("*")
    .single();

  if (baseErr) throw baseErr;
  if (!base) throw new Error("Upsert succeeded but returned no knowledge_base");
  const { error: docErr } = await supabase.from("knowledge_documents").insert({
    knowledge_base_id: base.id,
    title: fileMeta.title,
    content: null,
    file_url: fileMeta.file_url,
    file_type: fileMeta.file_type,
    is_processed: false,
  });

  if (docErr) throw docErr;

  return base;
}

exports.createDomain = async (req, res) => {
  try {
    const {
      name,
      description,
      customer_id,
      is_active,
      package_id,
    } = req.body;

    if (!name || !customer_id || !package_id) {
      return res
        .status(400)
        .json({ error: "name, customer_id, and package_id are required" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Avatar image is required" });
    }

    const avatarFile = req.file;

    if (!avatarFile.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: "Avatar must be an image file" });
    }

    let maxWorkspaces = null;
    let maxChatbots = null;
    let maxTokens = null;

    if (package_id) {
      const { data: pkg, error: pkgErr } = await supabase
        .from("packages")
        .select(
          "id, is_active, is_deleted, max_workspaces_per_domain, max_chatbots_per_workspace, base_token_amount"
        )
        .eq("id", package_id)
        .single();

      if (pkgErr || !pkg) {
        return res.status(400).json({ error: "Invalid package_id provided" });
      }
      if (!pkg.is_active || pkg.is_deleted) {
        return res
          .status(400)
          .json({ error: "Package is not active or has been deleted" });
      }
      maxWorkspaces = pkg.max_workspaces_per_domain;
      maxChatbots = pkg.max_chatbots_per_workspace;
      maxTokens = pkg.base_token_amount;
    }

    const nowIso = new Date().toISOString();
    const { data: domainData, error: domErr } = await supabase
      .from("domains")
      .insert([
        {
          name,
          description,
          customer_id,
          is_active: is_active !== undefined ? is_active : true,
          token_balance: maxTokens,
          avatar_url: null,
          id_package: package_id,
          workspaces_available: maxWorkspaces,
          chatbots_available: maxChatbots,
          created_at: nowIso,
          updated_at: nowIso,
        },
      ])
      .select()
      .single();

    if (domErr) throw domErr;
    const bucketName = name.trim().toLowerCase().replace(/\s+/g, "-");

    try {
      await s3.createBucket({ Bucket: bucketName }).promise();
    } catch (s3Err) {
      console.error("Error creating MinIO bucket:", s3Err.message);
      await supabase.from("domains").delete().eq("id", domainData.id);
      return res.status(500).json({
        error: "Failed to create storage bucket: " + s3Err.message,
      });
    }
    let avatarUrl = null;
    const STORAGE_QUOTA_BYTES = 3 * 1024 * 1024 * 1024;
    const fileSize = Buffer.byteLength(avatarFile.buffer);
    
    try {
      let continuationToken = null;
      let totalUsed = 0;
      do {
        const listParams = {
          Bucket: bucketName,
          ContinuationToken: continuationToken || undefined,
        };
        const listed = await s3.listObjectsV2(listParams).promise();
        for (const obj of listed.Contents || []) {
          totalUsed += obj.Size;
        }
        continuationToken = listed.IsTruncated
          ? listed.NextContinuationToken
          : null;
      } while (continuationToken);

      if (totalUsed + fileSize > STORAGE_QUOTA_BYTES) {
        await supabase.from("domains").delete().eq("id", domainData.id);
        try {
          await s3.deleteBucket({ Bucket: bucketName }).promise();
        } catch (deleteErr) {
          console.warn("Warning: Failed to delete bucket after quota exceeded:", deleteErr.message);
        }
        return res.status(403).json({
          error: "Avatar upload would exceed the 3 GiB storage quota."
        });
      }

      const sanitizedFilename = avatarFile.originalname
        .replace(/[^a-zA-Z0-9.-]/g, '_') 
        .replace(/_{2,}/g, '_') 
        .replace(/^_|_$/g, ''); 
      
      const avatarKey = `avatars/domain_${domainData.id}_${Date.now()}_${sanitizedFilename}`;
      
      await s3
        .putObject({
          Bucket: bucketName,
          Key: avatarKey,
          Body: avatarFile.buffer,
          ContentType: avatarFile.mimetype,
          ACL: 'public-read',
           Expires: SIGNED_URL_EXPIRES
        })
        .promise();

      avatarUrl = s3.getSignedUrl("getObject", {
        Bucket: bucketName,
        Key: avatarKey,
        Expires: SIGNED_URL_EXPIRES
      });
      
    } catch (avatarErr) {
      console.error("Error uploading avatar:", avatarErr.message);
      await supabase.from("domains").delete().eq("id", domainData.id);
      try {
        await s3.deleteBucket({ Bucket: bucketName }).promise();
      } catch (deleteErr) {
        console.warn("Warning: Failed to delete bucket after avatar upload error:", deleteErr.message);
      }
      return res.status(500).json({
        error: "Failed to upload avatar: " + avatarErr.message
      });
    }

    const remainingQuota = STORAGE_QUOTA_BYTES - fileSize;

    const { data: updatedDom, error: updErr } = await supabase
      .from("domains")
      .update({
        storage_bucket_name: bucketName,
        storage_quota: remainingQuota,
        avatar_url: avatarUrl,
        updated_at: nowIso,
      })
      .eq("id", domainData.id)
      .select()
      .single();

    if (updErr) {
      console.warn(
        "Warning: domain created, but failed to update storage fields:",
        updErr.message
      );
    }

    if (package_id) {
      const { error: trackErr } = await supabase
        .from("domain_packages")
        .insert([
          {
            domain_id: domainData.id,
            package_id: package_id,
            created_at: nowIso,
            updated_at: nowIso,
          },
        ]);
      if (trackErr) {
        console.warn(
          "Warning: failed to track domain_package:",
          trackErr.message
        );
      }
    }

    const { data: kbData, error: kbErr } = await supabase
      .from("knowledge_bases")
      .insert([
        {
          domain_id: domainData.id,
          name: name,
          description: description ?? "",
          created_at: nowIso,
          updated_at: nowIso,
        },
      ])
      .select()
      .single();

    if (kbErr) {
      console.warn(
        "Warning: failed to create knowledge_bases entry:",
        kbErr.message
      );
    }

    redis.del("domains");

    return res.status(201).json({
      message: "Domain created successfully with avatar",
      domain: updatedDom || domainData,
      knowledge_base: kbData || null,
      package_assigned: !!package_id,
      storage_bucket: bucketName,
      storage_quota: remainingQuota,
      avatar_uploaded: !!avatarUrl,
      avatar_url: avatarUrl,
    });
  } catch (err) {
    console.error("createDomain error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal Server Error" });
  }
};

exports.uploadFileToDomain = async (req, res) => {
  try {
    const domainName = req.params.domainName;
    if (!domainName) {
      return res.status(400).json({ error: "Invalid domain name" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const file = req.file;
    const fileSize = Buffer.byteLength(file.buffer);
    const { data: domainRow, error: domErr } = await supabase
      .from("domains")
      .select("storage_bucket_name, storage_quota")
      .eq("storage_bucket_name", domainName)
      .single();
    if (domErr || !domainRow) {
      return res.status(404).json({ error: "Domain not found" });
    }
    const { storage_bucket_name, storage_quota } = domainRow;
    if (!storage_bucket_name) {
      return res
        .status(400)
        .json({ error: "No bucket assigned to this domain" });
    }

    let continuationToken = null;
    let totalUsed = 0;
    do {
      const listParams = {
        Bucket: storage_bucket_name,
        ContinuationToken: continuationToken || undefined,
      };
      const listed = await s3.listObjectsV2(listParams).promise();
      for (const obj of listed.Contents) {
        totalUsed += obj.Size;
      }
      continuationToken = listed.IsTruncated
        ? listed.NextContinuationToken
        : null;
    } while (continuationToken);

    if (totalUsed + fileSize > storage_quota) {
      return res
        .status(403)
        .json({ error: "Uploading this file would exceed your 3 GiB quota." });
    }

    const key = `${Date.now()}_${file.originalname}`;
    await s3
      .putObject({
        Bucket: storage_bucket_name,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: "public-read",
        Expires: SIGNED_URL_EXPIRES,
      })
      .promise();

    const newStorageQuota = storage_quota - fileSize;
    const { error: updateErr } = await supabase
      .from("domains")
      .update({ storage_quota: newStorageQuota })
      .eq("storage_bucket_name", domainName);

    if (updateErr) {
      console.error("Error updating storage quota:", updateErr);
    }

    const presignedURL = s3.getSignedUrl("getObject", {
      Bucket: storage_bucket_name,
      Key: key,
      Expires: SIGNED_URL_EXPIRES,
    });

    redis.del("domains");
    await storeKnowledge(
      supabase,
      { domainId: null, workspaceId: null, chatbotId: null },
      {
        title: file.originalname,
        file_url: presignedURL,
        file_type: file.mimetype,
      }
    );

    return res.status(201).json({
      message: "File uploaded successfully",
      key,
      presignedURL,
      remainingQuota: newStorageQuota,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: err.message || "Internal Server Error" });
  }
};

exports.uploadFileToWorkspace = async (req, res) => {
  try {
    const domainName = req.params.domainName;
    const workspaceName = req.params.workspaceName;

    if (!domainName || !workspaceName) {
      return res
        .status(400)
        .json({ error: "Invalid domain name or workspace name" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    const fileSize = Buffer.byteLength(file.buffer);

    const { data: domainRow, error: domErr } = await supabase
      .from("domains")
      .select("storage_bucket_name, storage_quota")
      .eq("name", domainName)
      .single();
    if (domErr || !domainRow) {
      return res.status(404).json({ error: "Domain not found" });
    }
    const { storage_bucket_name, storage_quota } = domainRow;
    if (!storage_bucket_name) {
      return res
        .status(400)
        .json({ error: "No bucket assigned to this domain" });
    }

    const { data: workspaceRow, error: workspaceErr } = await supabase
      .from("workspaces")
      .select("id")
      .eq("name", workspaceName)
      .single();
    if (workspaceErr || !workspaceRow) {
      return res.status(404).json({ error: "Workspace not found" });
    }
    const workspaceId = workspaceRow.id;
    const workspaceNameSanitized = workspaceName.replace(/[^a-zA-Z0-9-_]/g, "_");

    const workspacePrefix = `${workspaceNameSanitized}/`;
    const wsList = await s3
      .listObjectsV2({
        Bucket: storage_bucket_name,
        Prefix: workspacePrefix,
        MaxKeys: 1,
      })
      .promise();
    let continuationToken = null,
      totalUsed = 0;
    do {
      const listed = await s3
        .listObjectsV2({
          Bucket: storage_bucket_name,
          ContinuationToken: continuationToken || undefined,
        })
        .promise();
      for (const obj of listed.Contents) {
        totalUsed += obj.Size;
      }
      continuationToken = listed.IsTruncated
        ? listed.NextContinuationToken
        : null;
    } while (continuationToken);

    if (totalUsed + fileSize > storage_quota) {
      return res.status(403).json({
        error: "Uploading this file would exceed your storage quota.",
      });
    }

    const key = `${workspaceNameSanitized}/${Date.now()}_${file.originalname}`;
    await s3
      .putObject({
        Bucket: storage_bucket_name,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      })
      .promise();

    const presignedURL = s3.getSignedUrl("getObject", {
      Bucket: storage_bucket_name,
      Key: key,
    });

    await redis.del("workspaces");
    await storeKnowledge(
      supabase,
      { domainId: null, workspaceId, chatbotId: null }, // Adjust if domainId is still needed
      {
        title: file.originalname,
        file_url: presignedURL,
        file_type: file.mimetype,
      }
    );

    return res
      .status(201)
      .json({ message: "File uploaded successfully", key, presignedURL });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: err.message || "Internal Server Error" });
  }
};

exports.uploadFileToChatbot = async (req, res) => {
  try {
    const domainName = req.params.domainName;
    const workspaceName = req.params.workspaceName;
    const chatbotName = req.params.chatbotName;

    if (!domainName || !workspaceName || !chatbotName) {
      return res
        .status(400)
        .json({ error: "Invalid domain name, workspace name, or chatbot name" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    const fileSize = Buffer.byteLength(file.buffer);

    const { data: domainRow, error: domErr } = await supabase
      .from("domains")
      .select("storage_bucket_name, storage_quota")
      .eq("name", domainName)
      .single();
    if (domErr || !domainRow) {
      return res.status(404).json({ error: "Domain not found" });
    }
    const { storage_bucket_name, storage_quota } = domainRow;
    if (!storage_bucket_name) {
      return res
        .status(400)
        .json({ error: "No bucket assigned to this domain" });
    }
    const { data: workspaceRow, error: wsErr } = await supabase
      .from("workspaces")
      .select("id")
      .eq("name", workspaceName)
      .single();
    if (wsErr || !workspaceRow) {
      return res.status(404).json({ error: "Workspace not found" });
    }
    const workspaceId = workspaceRow.id;
    const workspaceNameSanitized = workspaceName.replace(/[^a-zA-Z0-9-_]/g, "_");

    const { data: chatbotRow, error: cbErr } = await supabase
      .from("chatbots")
      .select("id")
      .eq("name", chatbotName)
      .single();
    if (cbErr || !chatbotRow) {
      return res.status(404).json({ error: "Chatbot not found" });
    }
    const chatbotId = chatbotRow.id;
    const chatbotNameSanitized = chatbotName.replace(/[^a-zA-Z0-9-_]/g, "_");

    await Promise.all([
      s3
        .listObjectsV2({
          Bucket: storage_bucket_name,
          Prefix: `${workspaceNameSanitized}/`,
          MaxKeys: 1,
        })
        .promise(),
      s3
        .listObjectsV2({
          Bucket: storage_bucket_name,
          Prefix: `${workspaceNameSanitized}/${chatbotNameSanitized}/`,
          MaxKeys: 1,
        })
        .promise(),
    ]);
    let continuationToken = null,
      totalUsed = 0;
    do {
      const listed = await s3
        .listObjectsV2({
          Bucket: storage_bucket_name,
          ContinuationToken: continuationToken || undefined,
        })
        .promise();
      for (const obj of listed.Contents) {
        totalUsed += obj.Size;
      }
      continuationToken = listed.IsTruncated
        ? listed.NextContinuationToken
        : null;
    } while (continuationToken);

    if (totalUsed + fileSize > storage_quota) {
      return res.status(403).json({
        error: "Uploading this file would exceed your storage quota.",
      });
    }

    const key = `${workspaceNameSanitized}/${chatbotNameSanitized}/${Date.now()}_${file.originalname}`;
    await s3
      .putObject({
        Bucket: storage_bucket_name,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      })
      .promise();

    const presignedURL = s3.getSignedUrl("getObject", {
      Bucket: storage_bucket_name,
      Key: key,
    });

    await redis.del("chatbots");
    await storeKnowledge(
      supabase,
      { domainId: null, workspaceId, chatbotId },
      {
        title: file.originalname,
        file_url: presignedURL,
        file_type: file.mimetype,
      }
    );

    return res
      .status(201)
      .json({ message: "File uploaded successfully", key, presignedURL });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: err.message || "Internal Server Error" });
  }
};

// exports.assignPackageToDomain = async (req, res) => {
//   const { domain_id, id_package } = req.body;
//   const assignedBy = req.user?.id;

//   if (!domain_id || !id_package) {
//     return res
//       .status(400)
//       .json({ error: "domain_id and id_package are required" });
//   }

//   try {
//     const { data: domainSolde, error: domainSoldeError } = await supabase
//       .from("domains")
//       .select("token_balance, is_active, is_deleted")
//       .eq("id", domain_id)
//       .single();

//     if (domainSoldeError || !domainSolde) {
//       return res.status(404).json({ error: "Domain not found" });
//     }
//     if (!domainSolde.is_active || domainSolde.is_deleted) {
//       return res
//         .status(400)
//         .json({ error: "Domain is not active or has been deleted" });
//     }

//     const { data: packageData, error: packageError } = await supabase
//       .from("packages")
//       .select(
//         "base_token_amount, is_active, is_deleted, max_workspaces_per_domain, max_chatbots_per_workspace"
//       )
//       .eq("id", id_package)
//       .single();

//     if (packageError || !packageData) {
//       return res.status(404).json({ error: "Package not found" });
//     }
//     if (!packageData.is_active || packageData.is_deleted) {
//       return res
//         .status(400)
//         .json({ error: "Package is not active or has been deleted" });
//     }

//     const newBalance = packageData.base_token_amount;
//     const maxWorkspaces = packageData.max_workspaces_per_domain;
//     const maxChatbots = packageData.max_chatbots_per_workspace;

//     const { data: updatedDomain, error: domainUpdateError } = await supabase
//       .from("domains")
//       .update({
//         id_package,
//         token_balance: newBalance,
//         workspaces_available: maxWorkspaces,
//         chatbots_available: maxChatbots,
//         updated_at: new Date().toISOString(),
//       })
//       .eq("id", domain_id)
//       .select()
//       .single();

//     if (domainUpdateError || !updatedDomain) {
//       return res.status(500).json({ error: "Failed to update domain" });
//     }
//     const now = new Date().toISOString();
//     const { error: trackingError } = await supabase
//       .from("domain_packages")
//       .insert([
//         {
//           domain_id,
//           package_id: id_package,
//           created_at: now,
//           updated_at: now,
//           is_active: true,
//           assigned_by: assignedBy,
//         },
//       ]);

//     if (trackingError) {
//       console.warn(
//         "Failed to insert into domain_packages:",
//         trackingError.message
//       );
//     }
//     redis.del("domains");
//     return res.status(200).json({
//       message: "Package assigned and balance set successfully",
//       domain: updatedDomain,
//     });
//   } catch (err) {
//     console.error("Server error:", err);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// };


exports.assignPackageToDomain = async (req, res) => {
  const { domain_id, id_package } = req.body;
  const assignedBy = req.user?.id;

  if (!domain_id || !id_package) {
    return res
      .status(400)
      .json({ error: "domain_id and id_package are required" });
  }

  try {
    const { data: domainSolde, error: domainSoldeError } = await supabase
      .from("domains")
      .select("token_balance, is_active, is_deleted")
      .eq("id", domain_id)
      .single();

    if (domainSoldeError || !domainSolde) {
      return res.status(404).json({ error: "Domain not found" });
    }
    if (!domainSolde.is_active || domainSolde.is_deleted) {
      return res
        .status(400)
        .json({ error: "Domain is not active or has been deleted" });
    }

    const { data: packageData, error: packageError } = await supabase
      .from("packages")
      .select(
        "base_token_amount, is_active, is_deleted, max_workspaces_per_domain, max_chatbots_per_workspace"
      )
      .eq("id", id_package)
      .single();

    if (packageError || !packageData) {
      return res.status(404).json({ error: "Package not found" });
    }
    if (!packageData.is_active || packageData.is_deleted) {
      return res
        .status(400)
        .json({ error: "Package is not active or has been deleted" });
    }

    const newBalance = packageData.base_token_amount;
    const maxWorkspaces = packageData.max_workspaces_per_domain;
    const maxChatbots = packageData.max_chatbots_per_workspace;
    const now = new Date().toISOString();

    const { data: updatedDomain, error: domainUpdateError } = await supabase
      .from("domains")
      .update({
        id_package,
        token_balance: newBalance,
        workspaces_available: maxWorkspaces,
        chatbots_available: maxChatbots,
        updated_at: now,
      })
      .eq("id", domain_id)
      .select()
      .single();

    if (domainUpdateError || !updatedDomain) {
      return res.status(500).json({ error: "Failed to update domain" });
    }

    const { data: workspaces, error: fetchError } = await supabase
      .from("workspaces")
      .select("id, chatbots_available")
      .eq("domain_id", domain_id)
      .eq("is_deleted", false);

    if (fetchError) {
      console.warn("Failed to fetch workspaces:", fetchError.message);
    } else {
      for (const workspace of workspaces) {
        const newValue = (workspace.chatbots_available || 0) + maxChatbots;
        const { error: updateError } = await supabase
          .from("workspaces")
          .update({
            chatbots_available: newValue,
            updated_at: now,
          })
          .eq("id", workspace.id);

        if (updateError) {
          console.warn(
            `Failed to update workspace ${workspace.id}:`,
            updateError.message
          );
        }
      }
    }

    const { error: trackingError } = await supabase
      .from("domain_packages")
      .insert([
        {
          domain_id,
          package_id: id_package,
          created_at: now,
          updated_at: now,
          is_active: true,
          assigned_by: assignedBy,
        },
      ]);

    if (trackingError) {
      console.warn(
        "Failed to insert into domain_packages:",
        trackingError.message
      );
    }

    redis.del("domains");

    return res.status(200).json({
      message: "Package assigned and balance set successfully",
      domain: updatedDomain,
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.updateDomainPackage = async (req, res) => {
  try {
    const { domain_id, new_package_id } = req.body;
    if (!domain_id || !new_package_id) {
      return res
        .status(400)
        .json({ error: "domain_id and new_package_id are required" });
    }

    const { data: domainData, error: domainError } = await supabase
      .from("domains")
      .select("id, is_active, is_deleted, id_package")
      .eq("id", domain_id)
      .single();

    if (domainError || !domainData) {
      return res.status(404).json({ error: "Domain not found" });
    }

    if (!domainData.is_active || domainData.is_deleted) {
      return res
        .status(400)
        .json({ error: "Domain is not active or has been deleted" });
    }

    const { data: packageData, error: packageError } = await supabase
      .from("packages")
      .select("id, is_active, is_deleted")
      .eq("id", new_package_id)
      .single();

    if (packageError || !packageData) {
      return res.status(404).json({ error: "New package not found" });
    }

    if (!packageData.is_active || packageData.is_deleted) {
      return res
        .status(400)
        .json({ error: "New package is not active or has been deleted" });
    }

    const { data: updatedDomain, error: updateError } = await supabase
      .from("domains")
      .update({
        id_package: new_package_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", domain_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }
    redis.del("domains");
    try {
      if (domainData.id_package) {
        await supabase
          .from("domain_packages")
          .update({
            is_active: false,
            updated_at: new Date().toISOString(),
          })
          .eq("domain_id", domain_id)
          .eq("package_id", domainData.id_package);
      }

      await supabase.from("domain_packages").insert([
        {
          domain_id,
          package_id: new_package_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
    } catch (trackingError) {
      console.warn(
        "Failed to update domain package tracking:",
        trackingError.message
      );
    }

    res.status(200).json({
      message: "Domain package updated successfully",
      domain: updatedDomain,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
};

exports.getDomainPackage = async (req, res) => {
  try {
    const { domain_id } = req.params;

    if (!domain_id) {
      return res.status(400).json({ error: "domain_id is required" });
    }

    const { data, error } = await supabase
      .from("domains")
      .select(
        `
        id,
        name,
        description,
        is_active,
        id_package,
        packages:id_package (
          id,
          name,
          description,
          price,
          base_token_amount,
          max_domains,
          max_workspaces_per_domain,
          max_chatbots_per_workspace,
          is_active
        )
      `
      )
      .eq("id", domain_id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Domain not found" });
      }
      throw error;
    }

    res.status(200).json({
      message: "Domain package retrieved successfully",
      domain: data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
};

exports.getAllDomainsPackages = async (req, res) => {
  try {
    const { data, error } = await supabase.from("domains").select(`
       *,
        packages:id_package (
          id,
          name,
          description,
          price,
          base_token_amount,
          max_domains,
          max_workspaces_per_domain,
          max_chatbots_per_workspace,
          is_active
        )
      `)
      .eq('is_deleted', false);

    if (error) {
      throw error;
    }

    return res.status(200).json({
      message: "All domains with their packages retrieved successfully",
      domains: data,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: err.message || "Internal Server Error" });
  }
};

exports.getDomainPackageHistory = async (req, res) => {
  try {
    const { domain_id } = req.params;

    if (!domain_id) {
      return res.status(400).json({ error: "domain_id is required" });
    }
    const { data, error } = await supabase
      .from("domain_packages")
      .select(
        `
        *,
        packages:package_id (
          id,
          name,
          description,
          price,
          base_token_amount,
          max_domains,
          max_workspaces_per_domain,
          max_chatbots_per_workspace
        )
      `
      )
      .eq("domain_id", domain_id)
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "42P01") {
        return res.status(200).json({
          message: "Domain package history retrieved successfully",
          history: [],
        });
      }
      throw error;
    }

    res.status(200).json({
      message: "Domain package history retrieved successfully",
      history: data,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
};

exports.removeDomainPackage = async (req, res) => {
  try {
    const { domain_id } = req.body;

    if (!domain_id) {
      return res.status(400).json({ error: "domain_id is required" });
    }

    const { data: domainData, error: domainError } = await supabase
      .from("domains")
      .select("id, is_active, is_deleted, id_package")
      .eq("id", domain_id)
      // .multiple();
      .single();

    if (domainError || !domainData) {
      return res.status(404).json({ error: "Domain not found" });
    }
    if (domainData.is_deleted || !domainData.is_active) {
      return res.status(404).json({ error: "Domain is deleted or diactivated" });
    }

    const { data: updatedDomain, error: updateError } = await supabase
      .from("domains")
      .update({
        id_package: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", domain_id)
      .select()
      // .multiple();
      .single();

    if (updateError) {
      throw updateError;
    }

    try {
      await supabase
        .from("domain_packages")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("domain_id", domain_id);
    } catch (trackingError) {
      console.warn(
        "Failed to deactivate domain package tracking:",
        trackingError.message
      );
    }

    res.status(200).json({
      message: "Package removed from domain successfully",
      domain: updatedDomain,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
};

// Assign a domain to a customer
exports.assignDomainToCustomer = async (req, res) => {
  const { id } = req.params;
  const { customer_id } = req.body;
  try {
    const { data, error } = await supabase
      .from("domains")
      .update({ customer_id })
      .eq("id", id)
      .single();
    if (error) throw error;
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateDomain = async (req, res) => {
  const { id } = req.params;
  const { description, is_active, avatar_url, name, token_balance, customer_id } = req.body;
  try {
    const { data, error } = await supabase
      .from("domains")
      .update({ description, is_active, avatar_url, name, token_balance, customer_id })
      .eq("id", id)
      .single();
    if (error) throw error;
    redis.del("domains");
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  try {
    if (!domain_id || !id_package) {
      return res
        .status(400)
        .json({ error: "domain_id and id_package are required" });
    }

    const { data: domainSolde, error: domainSoldeError } = await supabase
      .from("domains")
      .select("token_balance")
      .eq("id", domain_id)
      .single();

    if (domainSoldeError || !domainSolde) {
      console.error("Supabase domain error:", domainSoldeError);
      return res.status(404).json({ error: "Domain not found" });
    }

    const token = domainSolde.token_balance;

    const { data: packageData, error: packageError } = await supabase
      .from("packages")
      .select("base_token_amount")
      .eq("id", id_package)
      .single();

    if (packageError || !packageData) {
      console.error("Supabase package error:", packageError);
      return res.status(404).json({ error: "Package not found" });
    }

    const { base_token_amount } = packageData;

    const { data: updatedDomain, error: domainError } = await supabase
      .from("domains")
      .update({
        id_package,
        token_balance: token + base_token_amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", domain_id)
      .select()
      .single();

    if (domainError || !updatedDomain) {
      console.error("Supabase domain error:", domainError);
      return res.status(500).json({ error: "Failed to update domain" });
    }

    return res.status(200).json({
      message: "Package assigned and balance updated successfully",
      domain: updatedDomain,
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getAllDomains = async (req, res) => {
  try {
    // Step 1: Try to get data from Redis
    const cachedData = await redis.get("domains");
    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }
    const { data, error } = await supabase.from("domains").select("*");
    if (error) throw error;
    await redis.set("domains", JSON.stringify(data), "EX", 604800);

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Get a domain by ID
exports.getDomainById = async (req, res) => {
  const { id } = req.params;
  try {
    const allDomains = await redis.get("domains");
    if (allDomains) {
      const domains = JSON.parse(allDomains);
      const domain = domains.find((u) => u.id === id);
      console.log("domain", domain);
      if (domain) return res.status(200).json(domain);
    }
    const { data, error } = await supabase
      .from("domains")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    await redis.del("domains");
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

//delete domaine
exports.deleteDomain = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: Domaine, error: error } = await supabase
      .from("domains")
      .update({ is_deleted: true })
      .eq("id", id)
      .select("*");
    console.log("id", id);
    console.log("pack", Domaine);
    if (error) {
      return res.status(404).json({ error: "Domaine not found" });
    }
    redis.del("domains");
    return res.status(200).json({ message: "Domaine is deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: err });
  }
};
exports.getTokenHistory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "id is required!" });
    }

    const response = await supabase
      .from("domain_token_history")
      .select("*")
      .eq("id_domain", id)
      .order("created_at", { ascending: true });
    console.log("response:", response);
    if (response.error) {
      return res.status(400).json(response.error);
    }

    const withSoldeChanges = response.data.map((item, i, arr) => {
      const prev = i > 0 ? arr[i - 1].token : null;
      return {
        ...item,
        previous_token: prev,
        token_change: prev != null ? item.token - prev : null,
      };
    });
    console.log("result:", withSoldeChanges);
    return res.json(withSoldeChanges);
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "Server error" });
  }
};
