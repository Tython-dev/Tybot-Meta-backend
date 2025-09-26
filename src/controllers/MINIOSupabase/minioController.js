const { supabase, supabaseAdmin } = require("../../config/supabase");
const s3 = require("../../config/minioClient");

const crypto = require("crypto");

const minioController = {
  createBucket: async (req, res) => {
    const {
      bucketName,
      isPublic = false,
      description = "",
      encryption = true,
      encryptionType = "AES256",
      sizeLimit,
      allowedMimeTypes,
      policies = [],
    } = req.body;

    const userId = req.user?.userId;

    try {
      if (
        !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(bucketName) ||
        bucketName.length < 3 ||
        bucketName.length > 63
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid bucket name. Must be 3-63 chars, lowercase, start/end with alphanumeric",
        });
      }

      let supabaseSuccess = false;
      let minioSuccess = false;
      let bucketId;

      try {
        const { data: existingBucket, error: checkError } = await supabaseAdmin
          .from("buckets")
          .select("id")
          .eq("name", bucketName)
          .single();

        if (!checkError && existingBucket) {
          return res.status(409).json({
            success: false,
            message: "Bucket already exists",
          });
        }

        const { data: newBucket, error: insertError } = await supabaseAdmin
          .from("buckets")
          .insert({
            name: bucketName,
            description,
            is_public: isPublic,
            encryption_enabled: encryption,
            encryption_type: encryptionType,
            size_limit: sizeLimit,
            allowed_mime_types: allowedMimeTypes,
            policies,
            created_by: userId,
          })
          .select()
          .single();

        if (insertError)
          throw new Error(
            `Supabase record creation failed: ${insertError.message}`
          );

        bucketId = newBucket.id;

        const { error: supabaseStorageError } =
          await supabaseAdmin.storage.createBucket(bucketName, {
            public: isPublic,
            fileSizeLimit: sizeLimit,
            allowedMimeTypes,
          });

        if (
          supabaseStorageError &&
          !supabaseStorageError.message.includes("already exists")
        ) {
          throw new Error(
            `Supabase storage creation failed: ${supabaseStorageError.message}`
          );
        }

        await supabaseAdmin
          .from("buckets")
          .update({ supabase_created: true })
          .eq("id", bucketId);

        supabaseSuccess = true;
        console.log(`✅ Supabase bucket '${bucketName}' created`);
      } catch (supabaseError) {
        console.error(
          "❌ Supabase bucket operation failed:",
          supabaseError.message
        );
      }

      try {
        await ensureMinioBucket(bucketName, encryption, encryptionType);

        if (bucketId) {
          await supabaseAdmin
            .from("buckets")
            .update({ minio_created: true })
            .eq("id", bucketId);
        }

        minioSuccess = true;
        console.log(`✅ MinIO bucket '${bucketName}' created`);
      } catch (minioError) {
        console.error("❌ MinIO bucket operation failed:", minioError.message);
      }

      await logAuditEvent(
        "CREATE_BUCKET",
        bucketName,
        null,
        userId,
        supabaseSuccess && minioSuccess,
        null,
        {
          supabaseSuccess,
          minioSuccess,
          isPublic,
          encryption,
        }
      );

      if (supabaseSuccess && minioSuccess) {
        return res.json({
          success: true,
          message: `Bucket '${bucketName}' created successfully in both systems`,
          bucketId,
          supabase: true,
          minio: true,
        });
      } else if (supabaseSuccess || minioSuccess) {
        return res.status(207).json({
          success: true,
          message: `Bucket '${bucketName}' partially created`,
          bucketId,
          supabase: supabaseSuccess,
          minio: minioSuccess,
          warning: `${!supabaseSuccess ? "Supabase" : "MinIO"} creation failed`,
        });
      } else {
        return res.status(500).json({
          success: false,
          message: `Bucket '${bucketName}' creation failed in both systems`,
        });
      }
    } catch (error) {
      console.error("❌ Bucket creation error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Bucket creation failed",
        error: error.message,
      });
    }
  },

  updateBucketName: async (req, res) => {
    const { bucketId } = req.params;
    const { newName } = req.body;
    const userId = req.user?.userId;

    try {
      // lookup by id only (no created_by filter)
      const { data: bucket, error } = await supabaseAdmin
        .from("buckets")
        .select("*")
        .eq("id", bucketId)
        .single();

      if (error || !bucket) {
        return res.status(404).json({
          success: false,
          message: "Bucket not found",
        });
      }
      return res.status(501).json({
        success: false,
        message:
          "Bucket renaming requires manual migration. Consider creating a new bucket and transferring objects.",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Update failed",
        error: error.message,
      });
    }
  },
  deleteBucket: async (req, res) => {
    const { bucketId } = req.params;
    const { force = false } = req.body;
    const userId = req.user?.userId;

    try {
      // lookup by id only
      const { data: bucket, error } = await supabaseAdmin
        .from("buckets")
        .select("*")
        .eq("id", bucketId)
        .single();

      if (error || !bucket) {
        return res.status(404).json({
          success: false,
          message: "Bucket not found",
        });
      }

      let supabaseSuccess = false;
      let minioSuccess = false;

      if (!force) {
        const { data: objects } = await supabaseAdmin
          .from("storage_objects")
          .select("id")
          .eq("bucket_id", bucketId)
          .limit(1);

        if (objects && objects.length > 0) {
          return res.status(400).json({
            success: false,
            message:
              "Bucket is not empty. Use force=true to delete with contents.",
          });
        }
      }

      try {
        if (force) {
          const objects = await s3
            .listObjectsV2({ Bucket: bucket.name })
            .promise();
          if (objects.Contents && objects.Contents.length > 0) {
            const deleteParams = {
              Bucket: bucket.name,
              Delete: {
                Objects: objects.Contents.map((obj) => ({ Key: obj.Key })),
              },
            };
            await s3.deleteObjects(deleteParams).promise();
          }
        }

        await s3.deleteBucket({ Bucket: bucket.name }).promise();
        minioSuccess = true;
      } catch (minioError) {
        console.error("❌ MinIO bucket deletion failed:", minioError.message);
      }

      try {
        if (force) {
          const { data: files } = await supabaseAdmin.storage
            .from(bucket.name)
            .list();

          if (files && files.length > 0) {
            const filePaths = files.map((file) => file.name);
            await supabaseAdmin.storage.from(bucket.name).remove(filePaths);
          }
        }

        const { error: deleteError } = await supabaseAdmin.storage.deleteBucket(
          bucket.name
        );

        if (!deleteError) supabaseSuccess = true;
      } catch (supabaseError) {
        console.error(
          "❌ Supabase storage deletion failed:",
          supabaseError.message
        );
      }

      const { error: dbError } = await supabaseAdmin
        .from("buckets")
        .delete()
        .eq("id", bucketId);

      await logAuditEvent(
        "DELETE_BUCKET",
        bucket.name,
        null,
        userId,
        supabaseSuccess && minioSuccess,
        null,
        {
          force,
          supabaseSuccess,
          minioSuccess,
        }
      );

      return res.json({
        success: true,
        message: `Bucket '${bucket.name}' deleted`,
        supabase: supabaseSuccess,
        minio: minioSuccess,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Bucket deletion failed",
        error: error.message,
      });
    }
  },

  uploadAvatar: async (req, res) => {
    const { bucketName } = req.params;
    const { domainId, metadata } = req.body;
    const userId = req.user?.userId;
    const file = req.file;

    try {
      if (!file || !bucketName || !domainId) {
        return res.status(400).json({
          success: false,
          message: "File, bucket name, and domain ID are required",
        });
      }

      // Validate bucket exists
      const { data: bucket, error: bucketError } = await supabaseAdmin
        .from("buckets")
        .select("*")
        .eq("name", bucketName)
        .single();

      if (bucketError || !bucket) {
        return res.status(404).json({
          success: false,
          message: "Bucket not found or access denied",
        });
      }

      // Validate file size
      if (bucket.size_limit && file.size > bucket.size_limit) {
        return res.status(413).json({
          success: false,
          message: `File size exceeds bucket limit of ${bucket.size_limit} bytes`,
        });
      }

      // Validate file type
      if (bucket.allowed_mime_types && bucket.allowed_mime_types.length > 0) {
        if (!bucket.allowed_mime_types.includes(file.mimetype)) {
          return res.status(415).json({
            success: false,
            message: `File type ${file.mimetype} not allowed for this bucket`,
          });
        }
      }

      // Create avatar-specific path with timestamp to avoid conflicts
      const timestamp = Date.now();
      const fileExtension = file.originalname.split(".").pop();
      const avatarFileName = `avatar_${domainId}_${timestamp}.${fileExtension}`;
      const objectKey = `avatars/${avatarFileName}`;

      let supabaseSuccess = false;
      let minioSuccess = false;
      let supabaseUrl = null;
      let supabaseSignedUrl = null;
      let avatarUrlForDomain = null;
      let domainUpdateSuccess = false;

      // Parse metadata
      let parsedMetadata = { type: "avatar", domainId };
      try {
        if (metadata) {
          const userMetadata =
            typeof metadata === "string" ? JSON.parse(metadata) : metadata;
          parsedMetadata = { ...parsedMetadata, ...userMetadata };
        }
      } catch (parseError) {
        console.error("❌ Metadata parsing failed:", parseError.message);
        return res.status(400).json({
          success: false,
          message: "Invalid metadata format. Must be valid JSON.",
          error: parseError.message,
        });
      }

      // Upload to MinIO
      try {
        const uploadParams = {
          Bucket: bucketName,
          Key: objectKey,
          Body: file.buffer,
          ContentType: file.mimetype,
          Metadata: parsedMetadata,
        };

        if (bucket.encryption_enabled) {
          uploadParams.ServerSideEncryption = bucket.encryption_type;
        }

        const result = await s3.upload(uploadParams).promise();
        minioSuccess = true;
        console.log(`✅ Avatar uploaded to MinIO: ${result.Location}`);
      } catch (minioError) {
        console.error("❌ MinIO avatar upload failed:", minioError.message);
      }

      // Upload to Supabase
      try {
        const { data, error } = await supabaseAdmin.storage
          .from(bucketName)
          .upload(objectKey, file.buffer, {
            contentType: file.mimetype,
            metadata: parsedMetadata,
          });

        if (!error) {
          supabaseSuccess = true;
          console.log(`✅ Avatar uploaded to Supabase: ${data.path}`);

          // Get public URL
          const { data: urlData } = supabaseAdmin.storage
            .from(bucketName)
            .getPublicUrl(objectKey);
          supabaseUrl = urlData.publicUrl;

          // Get signed URL with long expiration
          const { data: signedUrlData, error: signedUrlError } =
            await supabaseAdmin.storage
              .from(bucketName)
              .createSignedUrl(objectKey, 2147483647);

          if (!signedUrlError && signedUrlData) {
            supabaseSignedUrl = signedUrlData.signedUrl;
          }
        }
      } catch (supabaseError) {
        console.error(
          "❌ Supabase avatar upload failed:",
          supabaseError.message
        );
      }

      // Store file record in database
      const { data: fileRecord, error: recordError } = await supabaseAdmin
        .from("storage_objects")
        .insert({
          bucket_id: bucket.id,
          object_key: objectKey,
          file_name: file.originalname,
          file_size: file.size,
          content_type: file.mimetype,
          minio_stored: minioSuccess,
          supabase_stored: supabaseSuccess,
          supabase_url: supabaseUrl,
          supabase_signed_url: supabaseSignedUrl,
          metadata: parsedMetadata,
          uploaded_by: userId,
        })
        .select()
        .single();

      if (recordError) {
        console.error("❌ Database record error:", recordError.message);
      }

      // Update domain avatar URL if upload was successful
      if (supabaseSignedUrl && supabaseSuccess) {
        try {
          const { error: domainUpdateError } = await supabaseAdmin
            .from("domains")
            .update({ avatar_url: supabaseSignedUrl })
            .eq("id", domainId);

          if (domainUpdateError) {
            console.error(
              "❌ Domain avatar update error:",
              domainUpdateError.message
            );
          } else {
            console.log(
              `✅ Domain avatar_url updated successfully for domain ID: ${domainId}`
            );
          }
        } catch (domainError) {
          console.error("❌ Domain update error:", domainError.message);
        }
      }

      // Log audit event
      await logAuditEvent(
        "UPLOAD_AVATAR",
        bucketName,
        objectKey,
        userId,
        supabaseSuccess && minioSuccess,
        null,
        {
          fileSize: file.size,
          contentType: file.mimetype,
          supabaseSuccess,
          minioSuccess,
          domainId,
          avatarUpdated: domainUpdateSuccess,
          avatarUrl: avatarUrlForDomain,
          supabaseFailed: !supabaseSuccess,
        }
      );

      return res.json({
        success: true,
        message: `Avatar '${file.originalname}' uploaded successfully`,
        fileId: fileRecord?.id,
        objectKey,
        avatarUrl: avatarUrlForDomain,
        urls: {
          supabase: {
            public: supabaseUrl,
            signed: supabaseSignedUrl,
          },
          minio: minioSuccess
            ? `https://s3.tybot.ma/${bucketName}/${objectKey}`
            : null,
        },
        storage: {
          supabase: supabaseSuccess,
          minio: minioSuccess,
        },
        domainUpdated: domainUpdateSuccess,
      });
    } catch (error) {
      console.error("❌ Upload avatar error:", error.message);
      await logAuditEvent(
        "UPLOAD_AVATAR",
        bucketName,
        objectKey || "unknown",
        userId,
        false,
        error.message
      );

      return res.status(500).json({
        success: false,
        message: "Avatar upload failed",
        error: error.message,
      });
    }
  },

  uploadFile: async (req, res) => {
    const { bucketName } = req.params;
    const { folderPath = "", metadata } = req.body;
    const userId = req.user?.userId;
    const file = req.file;

    try {
      if (!file || !bucketName) {
        return res.status(400).json({
          success: false,
          message: "File and bucket name required",
        });
      }

      // Validate bucket exists
      const { data: bucket, error: bucketError } = await supabaseAdmin
        .from("buckets")
        .select("*")
        .eq("name", bucketName)
        .single();

      if (bucketError || !bucket) {
        return res.status(404).json({
          success: false,
          message: "Bucket not found or access denied",
        });
      }

      // Validate file size
      if (bucket.size_limit && file.size > bucket.size_limit) {
        return res.status(413).json({
          success: false,
          message: `File size exceeds bucket limit of ${bucket.size_limit} bytes`,
        });
      }

      // Validate file type
      if (bucket.allowed_mime_types && bucket.allowed_mime_types.length > 0) {
        if (!bucket.allowed_mime_types.includes(file.mimetype)) {
          return res.status(415).json({
            success: false,
            message: `File type ${file.mimetype} not allowed for this bucket`,
          });
        }
      }

      // Create object key with optional folder path
      const objectKey = folderPath
        ? `${folderPath}/${file.originalname}`
        : file.originalname;

      let supabaseSuccess = false;
      let minioSuccess = false;
      let supabaseUrl = null;
      let supabaseSignedUrl = null;

      // Parse metadata
      let parsedMetadata = { type: "document" };
      try {
        if (metadata) {
          const userMetadata =
            typeof metadata === "string" ? JSON.parse(metadata) : metadata;
          parsedMetadata = { ...parsedMetadata, ...userMetadata };
        }
      } catch (parseError) {
        console.error("❌ Metadata parsing failed:", parseError.message);
        return res.status(400).json({
          success: false,
          message: "Invalid metadata format. Must be valid JSON.",
          error: parseError.message,
        });
      }

      // Upload to MinIO
      try {
        const uploadParams = {
          Bucket: bucketName,
          Key: objectKey,
          Body: file.buffer,
          ContentType: file.mimetype,
          Metadata: parsedMetadata,
        };

        if (bucket.encryption_enabled) {
          uploadParams.ServerSideEncryption = bucket.encryption_type;
        }

        const result = await s3.upload(uploadParams).promise();
        minioSuccess = true;
        console.log(`✅ File uploaded to MinIO: ${result.Location}`);
      } catch (minioError) {
        console.error("❌ MinIO upload failed:", minioError.message);
      }

      // Upload to Supabase
      try {
        const { data, error } = await supabaseAdmin.storage
          .from(bucketName)
          .upload(objectKey, file.buffer, {
            contentType: file.mimetype,
            metadata: parsedMetadata,
          });

        if (!error) {
          supabaseSuccess = true;
          console.log(`✅ File uploaded to Supabase: ${data.path}`);

          // Get public URL
          const { data: urlData } = supabaseAdmin.storage
            .from(bucketName)
            .getPublicUrl(objectKey);
          supabaseUrl = urlData.publicUrl;

          // Get signed URL
          const { data: signedUrlData, error: signedUrlError } =
            await supabaseAdmin.storage
              .from(bucketName)
              .createSignedUrl(objectKey, 2147483647);

          if (!signedUrlError && signedUrlData) {
            supabaseSignedUrl = signedUrlData.signedUrl;
          }
        }
      } catch (supabaseError) {
        console.error("❌ Supabase upload failed:", supabaseError.message);
      }

      // Store file record in database
      const { data: fileRecord, error: recordError } = await supabaseAdmin
        .from("storage_objects")
        .insert({
          bucket_id: bucket.id,
          object_key: objectKey,
          file_name: file.originalname,
          file_size: file.size,
          content_type: file.mimetype,
          minio_stored: minioSuccess,
          supabase_stored: supabaseSuccess,
          supabase_url: supabaseUrl,
          supabase_signed_url: supabaseSignedUrl,
          metadata: parsedMetadata,
          uploaded_by: userId,
        })
        .select()
        .single();

      if (recordError) {
        console.error("❌ Database record error:", recordError.message);
      }

      // Log audit event
      await logAuditEvent(
        "UPLOAD_FILE",
        bucketName,
        objectKey,
        userId,
        supabaseSuccess && minioSuccess,
        null,
        {
          fileSize: file.size,
          contentType: file.mimetype,
          supabaseSuccess,
          minioSuccess,
        }
      );

      return res.json({
        success: true,
        message: `File '${file.originalname}' uploaded successfully`,
        fileId: fileRecord?.id,
        objectKey,
        urls: {
          supabase: {
            public: supabaseUrl,
            signed: supabaseSignedUrl,
          },
        },
        storage: {
          supabase: supabaseSuccess,
          minio: minioSuccess,
        },
      });
    } catch (error) {
      console.error("❌ Upload file error:", error.message);
      await logAuditEvent(
        "UPLOAD_FILE",
        bucketName,
        objectKey || "unknown",
        userId,
        false,
        error.message
      );

      return res.status(500).json({
        success: false,
        message: "File upload failed",
        error: error.message,
      });
    }
  },


uploadToWorkspace: async (req, res) => {
  const { bucketName, workspaceName } = req.params;
  const file = req.file;
  const userId = req.user?.userId;

  try {
    // Check if workspace exists
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id, name')
      .eq('name', workspaceName)
      .single();

    if (workspaceError || !workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found"
      });
    }

    // Create workspace folder path
    const workspacePath = `workspaces/${workspaceName}`;
    const objectKey = `${workspacePath}/${file.originalname}`;

    let supabaseSuccess = false;
    let minioSuccess = false;
    let supabaseUrl = null;
    let supabaseSignedUrl = null;

    // Upload to MinIO
    try {
      await ensureFolder(bucketName, workspacePath);
      await s3.putObject({
        Bucket: bucketName,
        Key: objectKey,
        Body: file.buffer,
        ContentType: file.mimetype
      }).promise();
      minioSuccess = true;
    } catch (minioError) {
      console.error("MinIO upload failed:", minioError);
    }

    // Upload to Supabase
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(objectKey, file.buffer, {
          contentType: file.mimetype,
          upsert: true
        });

      if (!error) {
        supabaseSuccess = true;
        
        // Get public URL
        const { data: urlData } = supabaseAdmin.storage
          .from(bucketName)
          .getPublicUrl(objectKey);
        supabaseUrl = urlData.publicUrl;

        // Get signed URL
        const { data: signedUrlData } = await supabaseAdmin.storage
          .from(bucketName)
          .createSignedUrl(objectKey, 604800); // 7 days
        supabaseSignedUrl = signedUrlData.signedUrl;
      }
    } catch (supabaseError) {
      console.error("Supabase upload failed:", supabaseError);
    }

    // Store file record in database
    const { data: fileRecord } = await supabaseAdmin
      .from("storage_objects")
      .insert({
        bucket_id: bucketName,
        object_key: objectKey,
        file_name: file.originalname,
        file_size: file.size,
        content_type: file.mimetype,
        minio_stored: minioSuccess,
        supabase_stored: supabaseSuccess,
        supabase_url: supabaseUrl,
        supabase_signed_url: supabaseSignedUrl,
        metadata: { workspace_id: workspace.id },
        uploaded_by: userId
      })
      .select()
      .single();

    res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      data: {
        workspaceId: workspace.id,
        fileName: file.originalname,
        fileId: fileRecord?.id,
        path: objectKey,
        urls: {
          supabase: {
            public: supabaseUrl,
            signed: supabaseSignedUrl
          },
          minio: minioSuccess ? `https://s3.tybot.ma/${bucketName}/${objectKey}` : null
        },
        storage: {
          supabase: supabaseSuccess,
          minio: minioSuccess
        }
      }
    });

  } catch (error) {
    console.error("Workspace upload error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload file to workspace",
      error: error.message
    });
  }
},

uploadToChatbot: async (req, res) => {
  const { bucketName, workspaceName, smartServiceName } = req.params;
  const file = req.file;
  const userId = req.user?.userId;

  try {
    // Check if workspace exists
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id, name')
      .eq('name', workspaceName)
      .single();

    if (workspaceError || !workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found"
      });
    }

    // Check if chatbot exists
    const { data: chatbot, error: chatbotError } = await supabase
      .from('chatbots')
      .select('id, name')
      .eq('name', smartServiceName)
      .eq('workspace_id', workspace.id)
      .single();

    if (chatbotError || !chatbot) {
      return res.status(404).json({
        success: false,
        message: "Smart Service not found in this workspace"
      });
    }

    // Create paths
    const workspacePath = `workspaces/${workspaceName}`;
    const chatbotPath = `${workspacePath}/smartServices/${smartServiceName}`;
    const objectKey = `${chatbotPath}/${file.originalname}`;

    let supabaseSuccess = false;
    let minioSuccess = false;
    let supabaseUrl = null;
    let supabaseSignedUrl = null;

    // Upload to MinIO
    try {
      await ensureFolder(bucketName, workspacePath);
      await ensureFolder(bucketName, `${workspacePath}/smartServices`);
      await ensureFolder(bucketName, chatbotPath);
      
      await s3.putObject({
        Bucket: bucketName,
        Key: objectKey,
        Body: file.buffer,
        ContentType: file.mimetype
      }).promise();
      minioSuccess = true;
    } catch (minioError) {
      console.error("MinIO upload failed:", minioError);
    }

    // Upload to Supabase
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(objectKey, file.buffer, {
          contentType: file.mimetype,
          upsert: true
        });

      if (!error) {
        supabaseSuccess = true;
        
        // Get public URL
        const { data: urlData } = supabaseAdmin.storage
          .from(bucketName)
          .getPublicUrl(objectKey);
        supabaseUrl = urlData.publicUrl;

        // Get signed URL
        const { data: signedUrlData } = await supabaseAdmin.storage
          .from(bucketName)
          .createSignedUrl(objectKey, 604800); // 7 days
        supabaseSignedUrl = signedUrlData.signedUrl;
      }
    } catch (supabaseError) {
      console.error("Supabase upload failed:", supabaseError);
    }

    // Store file record in database
    const { data: fileRecord } = await supabaseAdmin
      .from("storage_objects")
      .insert({
        bucket_id: bucketName,
        object_key: objectKey,
        file_name: file.originalname,
        file_size: file.size,
        content_type: file.mimetype,
        minio_stored: minioSuccess,
        supabase_stored: supabaseSuccess,
        supabase_url: supabaseUrl,
        supabase_signed_url: supabaseSignedUrl,
        metadata: { 
          workspace_id: workspace.id,
          chatbot_id: chatbot.id 
        },
        uploaded_by: userId
      })
      .select()
      .single();

    res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      data: {
        workspaceId: workspace.id,
        chatbotId: chatbot.id,
        fileName: file.originalname,
        fileId: fileRecord?.id,
        path: objectKey,
        urls: {
          supabase: {
            public: supabaseUrl,
            signed: supabaseSignedUrl
          },
          minio: minioSuccess ? `https://s3.tybot.ma/${bucketName}/${objectKey}` : null
        },
        storage: {
          supabase: supabaseSuccess,
          minio: minioSuccess
        }
      }
    });

  } catch (error) {
    console.error("Smart Services upload error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload file to Smart Services",
      error: error.message
    });
  }
},
  uploadUserAvatar: async (req, res) => {
    const { userId: targetUserId } = req.params;
    const { metadata } = req.body;
    const userId = req.user?.userId;
    const file = req.file;

    try {
      if (!file || !targetUserId) {
        return res.status(400).json({
          success: false,
          message: "File and user ID are required",
        });
      }

      // Get user details
      const { data: user, error: userError } = await supabaseAdmin
        .from("system_users")
        .select("id, first_name, last_name, avatar_url")
        .eq("id", targetUserId)
        .single();

      if (userError || !user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const bucketName = "users-avatars";

      let { data: bucket, error: bucketError } = await supabaseAdmin
        .from("buckets")
        .select("*")
        .eq("name", bucketName)
        .single();

      if (bucketError || !bucket) {
        console.log(`📦 Creating bucket: ${bucketName}`);

        let minioBucketCreated = false;
        let supabaseBucketCreated = false;

        // Create bucket in MinIO first
        try {
          if (s3) {
            // Check if bucket exists first
            try {
              await s3.headBucket({ Bucket: bucketName }).promise();
              minioBucketCreated = true;
              console.log(`✅ MinIO bucket already exists: ${bucketName}`);
            } catch (headError) {
              if (headError.statusCode === 404) {
                // Bucket doesn't exist, create it
                await s3.createBucket({ Bucket: bucketName }).promise();
                minioBucketCreated = true;
                console.log(`✅ Created MinIO bucket: ${bucketName}`);
              } else {
                throw headError;
              }
            }
          } else {
            console.warn("⚠️ MinIO S3 client not configured");
          }
        } catch (minioError) {
          console.error(
            "❌ MinIO bucket creation/check failed:",
            minioError.message
          );
          console.error("MinIO bucket error details:", {
            code: minioError.code,
            statusCode: minioError.statusCode,
          });
        }

        try {
          if (supabaseAdmin && supabaseAdmin.storage) {
            const { data: existingBuckets, error: listError } =
              await supabaseAdmin.storage.listBuckets();

            const bucketExists = existingBuckets?.some(
              (b) => b.name === bucketName
            );

            if (bucketExists) {
              supabaseBucketCreated = true;
              console.log(`✅ Supabase bucket already exists: ${bucketName}`);
            } else {
              // Create the bucket
              const { data: supabaseBucket, error: supabaseBucketError } =
                await supabaseAdmin.storage.createBucket(bucketName, {
                  public: true,
                  allowedMimeTypes: [
                    "image/jpeg",
                    "image/png",
                    "image/gif",
                    "image/webp",
                  ],
                  fileSizeLimit: 5242880, // 5MB
                });

              if (supabaseBucketError) {
                console.error(
                  "❌ Failed to create Supabase bucket:",
                  supabaseBucketError.message
                );
                console.error("Supabase bucket creation error details:", {
                  code: supabaseBucketError.code,
                  details: supabaseBucketError.details,
                  hint: supabaseBucketError.hint,
                });
              } else {
                supabaseBucketCreated = true;
                console.log(`✅ Created Supabase bucket: ${bucketName}`);
              }
            }
          } else {
            console.warn("⚠️ Supabase admin client not configured");
          }
        } catch (supabaseError) {
          console.error(
            "❌ Supabase bucket creation/check error:",
            supabaseError.message
          );
          console.error("Supabase error details:", {
            code: supabaseError.code,
            details: supabaseError.details,
            hint: supabaseError.hint,
          });
        }

        if (minioBucketCreated || supabaseBucketCreated) {
          const { data: newBucket, error: createBucketError } =
            await supabaseAdmin
              .from("buckets")
              .insert({
                name: bucketName,
                description: "User avatars storage bucket",
                size_limit: 5242880,
                allowed_mime_types: [
                  "image/jpeg",
                  "image/png",
                  "image/gif",
                  "image/webp",
                ],
                encryption_enabled: false,
                is_public: true,
              })
              .select()
              .single();

          if (createBucketError) {
            if (createBucketError.code === "23505") {
              console.log(
                `✅ Bucket database record already exists: ${bucketName}`
              );
              // Try to fetch the existing bucket
              const { data: existingBucket, error: fetchError } =
                await supabaseAdmin
                  .from("buckets")
                  .select("*")
                  .eq("name", bucketName)
                  .single();

              if (fetchError) {
                console.error(
                  "❌ Failed to fetch existing bucket record:",
                  fetchError.message
                );
                return res.status(500).json({
                  success: false,
                  message: "Failed to fetch existing bucket record",
                  error: fetchError.message,
                });
              }
              bucket = existingBucket;
            } else {
              console.error(
                "❌ Failed to create bucket database record:",
                createBucketError.message
              );
              return res.status(500).json({
                success: false,
                message: "Failed to create bucket database record",
                error: createBucketError.message,
              });
            }
          } else {
            bucket = newBucket;
            console.log(`✅ Created bucket database record`);
          }
        } else {
          console.error("❌ Failed to create bucket in both storage providers");
          return res.status(500).json({
            success: false,
            message: "Failed to create bucket in both storage providers",
          });
        }
      }

      // Validate file size
      if (bucket.size_limit && file.size > bucket.size_limit) {
        return res.status(413).json({
          success: false,
          message: `File size exceeds bucket limit of ${bucket.size_limit} bytes`,
        });
      }

      // Validate file type
      if (bucket.allowed_mime_types && bucket.allowed_mime_types.length > 0) {
        if (!bucket.allowed_mime_types.includes(file.mimetype)) {
          return res.status(415).json({
            success: false,
            message: `File type ${file.mimetype} not allowed for avatars`,
          });
        }
      }

      const userFolderName = `${user.first_name}_${user.last_name}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_");
      const timestamp = Date.now();
      const fileExtension = file.originalname.split(".").pop();
      const avatarFileName = `avatar_${timestamp}.${fileExtension}`;
      const objectKey = `${userFolderName}/${avatarFileName}`;

      let supabaseSuccess = false;
      let minioSuccess = false;
      let supabaseUrl = null;
      let supabaseSignedUrl = null;
      let minioUrl = null;
      let avatarUrlForUser = null;
      let userUpdateSuccess = false;

      // Parse metadata
      let parsedMetadata = {
        type: "user_avatar",
        userId: targetUserId,
        userName: `${user.first_name} ${user.last_name}`,
        folder: userFolderName,
      };

      try {
        if (metadata) {
          const userMetadata =
            typeof metadata === "string" ? JSON.parse(metadata) : metadata;
          parsedMetadata = { ...parsedMetadata, ...userMetadata };
        }
      } catch (parseError) {
        console.error("❌ Metadata parsing failed:", parseError.message);
        return res.status(400).json({
          success: false,
          message: "Invalid metadata format. Must be valid JSON.",
          error: parseError.message,
        });
      }

      // Upload to MinIO
      try {
        if (!s3) {
          console.warn(
            "⚠️ MinIO S3 client not configured, skipping MinIO upload"
          );
        } else {
          console.log(
            `📤 Attempting MinIO upload to bucket: ${bucketName}, key: ${objectKey}`
          );

          const uploadParams = {
            Bucket: bucketName,
            Key: objectKey,
            Body: file.buffer,
            ContentType: file.mimetype,
            Metadata: Object.keys(parsedMetadata).reduce((acc, key) => {
              acc[key] = String(parsedMetadata[key]);
              return acc;
            }, {}),
          };

          if (bucket.encryption_enabled) {
            uploadParams.ServerSideEncryption =
              bucket.encryption_type || "AES256";
          }

          const result = await s3.upload(uploadParams).promise();
          minioSuccess = true;
          minioUrl = `https://s3.tybot.ma/${bucketName}/${objectKey}`;
          console.log(`✅ User avatar uploaded to MinIO: ${result.Location}`);
        }
      } catch (minioError) {
        console.error(
          "❌ MinIO user avatar upload failed:",
          minioError.message
        );
        console.error("MinIO error details:", {
          code: minioError.code,
          statusCode: minioError.statusCode,
          stack: minioError.stack,
        });
      }

      try {
        if (!supabaseAdmin || !supabaseAdmin.storage) {
          console.warn(
            "⚠️ Supabase admin client not properly configured, skipping Supabase upload"
          );
        } else {
          console.log(
            `📤 Attempting Supabase upload to bucket: ${bucketName}, key: ${objectKey}`
          );

          const { data, error } = await supabaseAdmin.storage
            .from(bucketName)
            .upload(objectKey, file.buffer, {
              contentType: file.mimetype,
              metadata: parsedMetadata,
              upsert: true,
            });

          if (error) {
            throw error;
          }

          supabaseSuccess = true;
          console.log(`✅ User avatar uploaded to Supabase: ${data.path}`);

          // Get public URL
          const { data: urlData } = supabaseAdmin.storage
            .from(bucketName)
            .getPublicUrl(objectKey);

          if (urlData && urlData.publicUrl) {
            supabaseUrl = urlData.publicUrl;
            console.log(`📝 Supabase public URL: ${supabaseUrl}`);
          }

          const { data: signedUrlData, error: signedUrlError } =
            await supabaseAdmin.storage
              .from(bucketName)
              .createSignedUrl(objectKey, 2147483647);

          if (!signedUrlError && signedUrlData) {
            supabaseSignedUrl = signedUrlData.signedUrl;
            console.log(`📝 Supabase signed URL created`);
          } else if (signedUrlError) {
            console.error(
              "❌ Failed to create signed URL:",
              signedUrlError.message
            );
          }
        }
      } catch (supabaseError) {
        console.error(
          "❌ Supabase user avatar upload failed:",
          supabaseError.message
        );
        console.error("Supabase error details:", {
          code: supabaseError.code,
          details: supabaseError.details,
          hint: supabaseError.hint,
          stack: supabaseError.stack,
        });
      }

      // Check if at least one upload succeeded
      if (!supabaseSuccess && !minioSuccess) {
        return res.status(500).json({
          success: false,
          message: "Failed to upload to both storage providers",
          storage: {
            supabase: supabaseSuccess,
            minio: minioSuccess,
          },
        });
      }

      // Store file record in database
      const { data: fileRecord, error: recordError } = await supabaseAdmin
        .from("storage_objects")
        .insert({
          bucket_id: bucket.id,
          object_key: objectKey,
          file_name: file.originalname,
          file_size: file.size,
          content_type: file.mimetype,
          minio_stored: minioSuccess,
          supabase_stored: supabaseSuccess,
          supabase_url: supabaseUrl,
          supabase_signed_url: supabaseSignedUrl,
          metadata: parsedMetadata,
          uploaded_by: userId,
        })
        .select()
        .single();

      if (recordError) {
        console.error("❌ Database record error:", recordError.message);
      }

      // Update user avatar URL if upload was successful (matching uploadAvatar pattern)
      if (supabaseSignedUrl && supabaseSuccess) {
        avatarUrlForUser = supabaseSignedUrl;
        try {
          const { error: userUpdateError } = await supabaseAdmin
            .from("system_users")
            .update({ avatar_url: supabaseSignedUrl })
            .eq("id", targetUserId);

          if (userUpdateError) {
            console.error(
              "❌ User avatar update error:",
              userUpdateError.message
            );
          } else {
            userUpdateSuccess = true;
            console.log(
              `✅ User avatar_url updated successfully for user ID: ${targetUserId}`
            );
          }
        } catch (userError) {
          console.error("❌ User update error:", userError.message);
        }
      }

      // Log audit event
      await logAuditEvent(
        "UPLOAD_USER_AVATAR",
        bucketName,
        objectKey,
        userId,
        supabaseSuccess && minioSuccess,
        null,
        {
          fileSize: file.size,
          contentType: file.mimetype,
          supabaseSuccess,
          minioSuccess,
          targetUserId,
          userFolder: userFolderName,
          avatarUpdated: userUpdateSuccess,
          avatarUrl: avatarUrlForUser,
          supabaseFailed: !supabaseSuccess,
        }
      );

      return res.json({
        success: true,
        message: `User avatar '${file.originalname}' uploaded successfully`,
        fileId: fileRecord?.id,
        objectKey,
        avatarUrl: avatarUrlForUser,
        userFolder: userFolderName,
        urls: {
          supabase: {
            public: supabaseUrl,
            signed: supabaseSignedUrl,
          },
          minio: minioUrl,
        },
        storage: {
          supabase: supabaseSuccess,
          minio: minioSuccess,
        },
        userUpdated: userUpdateSuccess,
      });
    } catch (error) {
      console.error("❌ Upload user avatar error:", error.message, error.stack);
      await logAuditEvent(
        "UPLOAD_USER_AVATAR",
        "users_avatars",
        objectKey || "unknown",
        userId,
        false,
        error.message
      );

      return res.status(500).json({
        success: false,
        message: "User avatar upload failed",
        error: error.message,
      });
    }
  },

  getBucketDocuments: async (req, res) => {
    const { bucketName } = req.params;
    const {
      page = 1,
      limit = 50,
      folder = "",
      fileType = "",
      sortBy = "created_at",
      sortOrder = "desc",
    } = req.query;
    const userId = req.user?.userId;

    try {
      if (!bucketName) {
        return res.status(400).json({
          success: false,
          message: "Bucket name is required",
        });
      }

      // Validate bucket exists
      const { data: bucket, error: bucketError } = await supabaseAdmin
        .from("buckets")
        .select("*")
        .eq("name", bucketName)
        .single();

      if (bucketError || !bucket) {
        return res.status(404).json({
          success: false,
          message: "Bucket not found or access denied",
        });
      }

      // Build query for storage objects
      let query = supabaseAdmin
        .from("storage_objects")
        .select(
          `
          id,
          object_key,
          file_name,
          file_size,
          content_type,
          metadata,
          supabase_url,
          supabase_signed_url,
          minio_stored,
          supabase_stored,
          created_at,
          updated_at,
          uploaded_by
        `
        )
        .eq("bucket_id", bucket.id);

      // Filter by folder if specified
      if (folder) {
        query = query.like("object_key", `${folder}%`);
      }

      // Filter by file type if specified
      if (fileType) {
        query = query.like("content_type", `${fileType}%`);
      }

      // Apply sorting
      query = query.order(sortBy, { ascending: sortOrder === "asc" });

      // Apply pagination
      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.range(offset, offset + parseInt(limit) - 1);

      const { data: files, error: filesError, count } = await query;

      if (filesError) {
        console.error(
          "❌ Error fetching bucket documents:",
          filesError.message
        );
        return res.status(500).json({
          success: false,
          message: "Failed to fetch bucket documents",
          error: filesError.message,
        });
      }

      // Get total count for pagination
      const { count: totalCount } = await supabaseAdmin
        .from("storage_objects")
        .select("*", { count: "exact", head: true })
        .eq("bucket_id", bucket.id);

      // Log audit event
      await logAuditEvent(
        "GET_BUCKET_DOCUMENTS",
        bucketName,
        null,
        userId,
        true,
        null,
        {
          page: parseInt(page),
          limit: parseInt(limit),
          folder,
          fileType,
          resultCount: files?.length || 0,
        }
      );

      return res.json({
        success: true,
        message: "Bucket documents retrieved successfully",
        data: {
          files: files || [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalCount || 0,
            totalPages: Math.ceil((totalCount || 0) / parseInt(limit)),
            hasNext: offset + parseInt(limit) < (totalCount || 0),
            hasPrev: parseInt(page) > 1,
          },
          bucket: {
            name: bucket.name,
            id: bucket.id,
          },
        },
      });
    } catch (error) {
      console.error("❌ Get bucket documents error:", error.message);
      await logAuditEvent(
        "GET_BUCKET_DOCUMENTS",
        bucketName,
        null,
        userId,
        false,
        error.message
      );

      return res.status(500).json({
        success: false,
        message: "Failed to retrieve bucket documents",
        error: error.message,
      });
    }
  },

  getFolderContents: async (req, res) => {
    const { bucketName, folderName } = req.params;
    const {
      page = 1,
      limit = 50,
      sortBy = "created_at",
      sortOrder = "desc",
    } = req.query;
    const userId = req.user?.userId;

    try {
      if (!bucketName || !folderName) {
        return res.status(400).json({
          success: false,
          message: "Bucket name and folder name are required",
        });
      }

      // Validate bucket exists
      const { data: bucket, error: bucketError } = await supabaseAdmin
        .from("buckets")
        .select("*")
        .eq("name", bucketName)
        .single();

      if (bucketError || !bucket) {
        return res.status(404).json({
          success: false,
          message: "Bucket not found or access denied",
        });
      }

      // Query files in specific folder
      let query = supabaseAdmin
        .from("storage_objects")
        .select(
          `
          id,
          object_key,
          file_name,
          file_size,
          content_type,
          metadata,
          supabase_url,
          supabase_signed_url,
          minio_stored,
          supabase_stored,
          created_at,
          updated_at,
          uploaded_by
        `
        )
        .eq("bucket_id", bucket.id)
        .like("object_key", `${folderName}/%`);

      // Apply sorting
      query = query.order(sortBy, { ascending: sortOrder === "asc" });

      // Apply pagination
      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.range(offset, offset + parseInt(limit) - 1);

      const { data: files, error: filesError } = await query;

      if (filesError) {
        console.error("❌ Error fetching folder contents:", filesError.message);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch folder contents",
          error: filesError.message,
        });
      }

      const { count: totalCount } = await supabaseAdmin
        .from("storage_objects")
        .select("*", { count: "exact", head: true })
        .eq("bucket_id", bucket.id)
        .like("object_key", `${folderName}/%`);

      await logAuditEvent(
        "GET_FOLDER_CONTENTS",
        bucketName,
        folderName,
        userId,
        true,
        null,
        {
          page: parseInt(page),
          limit: parseInt(limit),
          folderName,
          resultCount: files?.length || 0,
        }
      );

      return res.json({
        success: true,
        message: `Folder '${folderName}' contents retrieved successfully`,
        data: {
          files: files || [],
          folder: folderName,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalCount || 0,
            totalPages: Math.ceil((totalCount || 0) / parseInt(limit)),
            hasNext: offset + parseInt(limit) < (totalCount || 0),
            hasPrev: parseInt(page) > 1,
          },
          bucket: {
            name: bucket.name,
            id: bucket.id,
          },
        },
      });
    } catch (error) {
      console.error("❌ Get folder contents error:", error.message);
      await logAuditEvent(
        "GET_FOLDER_CONTENTS",
        bucketName,
        folderName,
        userId,
        false,
        error.message
      );

      return res.status(500).json({
        success: false,
        message: "Failed to retrieve folder contents",
        error: error.message,
      });
    }
  },
  createFolder: async (req, res) => {
    const { bucketName, folderPath, parentFolderId } = req.body;
    const userId = req.user?.userId;

    try {
      const { data: bucket, error: bucketError } = await supabaseAdmin
        .from("buckets")
        .select("*")
        .eq("name", bucketName)
        .single();

      if (bucketError || !bucket) {
        return res.status(404).json({
          success: false,
          message: "Bucket not found",
        });
      }

      const normalizedPath = folderPath.endsWith("/")
        ? folderPath
        : `${folderPath}/`;
      let supabaseSuccess = false;
      let minioSuccess = false;

      try {
        await s3
          .putObject({
            Bucket: bucketName,
            Key: normalizedPath,
            Body: "",
            ContentType: "application/x-directory",
          })
          .promise();
        minioSuccess = true;
      } catch (minioError) {
        console.error("❌ MinIO folder creation failed:", minioError.message);
      }

      try {
        const { data: folderRecord, error: folderError } = await supabaseAdmin
          .from("folders")
          .insert({
            bucket_id: bucket.id,
            folder_path: normalizedPath,
            parent_folder_id: parentFolderId,
            minio_created: minioSuccess,
            supabase_created: true,
            created_by: userId,
          })
          .select()
          .single();

        supabaseSuccess = true;
      } catch (supabaseError) {
        console.error(
          "❌ Supabase folder creation failed:",
          supabaseError.message
        );
      }

      await logAuditEvent(
        "CREATE_FOLDER",
        bucketName,
        normalizedPath,
        userId,
        supabaseSuccess && minioSuccess
      );

      return res.json({
        success: true,
        message: `Folder '${folderPath}' created successfully`,
        folderPath: normalizedPath,
        supabase: supabaseSuccess,
        minio: minioSuccess,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Folder creation failed",
        error: error.message,
      });
    }
  },

  deleteFile: async (req, res) => {
    const { bucketName, objectKey } = req.params;
    const userId = req.user?.userId;

    try {
      // lookup by name only
      const { data: bucket, error: bucketError } = await supabaseAdmin
        .from("buckets")
        .select("*")
        .eq("name", bucketName)
        .single();

      if (bucketError || !bucket) {
        return res.status(404).json({
          success: false,
          message: "Bucket not found",
        });
      }

      let supabaseSuccess = false;
      let minioSuccess = false;

      try {
        await s3
          .deleteObject({
            Bucket: bucketName,
            Key: objectKey,
          })
          .promise();
        minioSuccess = true;
      } catch (minioError) {
        console.error("❌ MinIO file deletion failed:", minioError.message);
      }

      try {
        const { error } = await supabaseAdmin.storage
          .from(bucketName)
          .remove([objectKey]);

        if (!error) supabaseSuccess = true;
      } catch (supabaseError) {
        console.error(
          "❌ Supabase file deletion failed:",
          supabaseError.message
        );
      }

      await supabaseAdmin
        .from("storage_objects")
        .delete()
        .eq("bucket_id", bucket.id)
        .eq("object_key", objectKey);

      await logAuditEvent(
        "DELETE_FILE",
        bucketName,
        objectKey,
        userId,
        supabaseSuccess && minioSuccess
      );

      return res.json({
        success: true,
        message: `File '${objectKey}' deleted successfully`,
        supabase: supabaseSuccess,
        minio: minioSuccess,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "File deletion failed",
        error: error.message,
      });
    }
  },

  deleteFolder: async (req, res) => {
    const { bucketName, folderPath } = req.params;
    const { recursive = false } = req.body;
    const userId = req.user?.userId;

    try {
      // lookup by name only
      const { data: bucket, error: bucketError } = await supabaseAdmin
        .from("buckets")
        .select("*")
        .eq("name", bucketName)
        .single();

      if (bucketError || !bucket) {
        return res.status(404).json({
          success: false,
          message: "Bucket not found",
        });
      }

      const normalizedPath = folderPath.endsWith("/")
        ? folderPath
        : `${folderPath}/`;

      if (!recursive) {
        const { data: contents } = await supabaseAdmin
          .from("storage_objects")
          .select("id")
          .eq("bucket_id", bucket.id)
          .ilike("object_key", `${normalizedPath}%`)
          .neq("object_key", normalizedPath)
          .limit(1);

        if (contents && contents.length > 0) {
          return res.status(400).json({
            success: false,
            message:
              "Folder is not empty. Use recursive=true to delete with contents.",
          });
        }
      }

      let supabaseSuccess = false;
      let minioSuccess = false;

      try {
        if (recursive) {
          const objects = await s3
            .listObjectsV2({
              Bucket: bucketName,
              Prefix: normalizedPath,
            })
            .promise();

          if (objects.Contents && objects.Contents.length > 0) {
            const deleteParams = {
              Bucket: bucketName,
              Delete: {
                Objects: objects.Contents.map((obj) => ({ Key: obj.Key })),
              },
            };
            await s3.deleteObjects(deleteParams).promise();
          }
        } else {
          await s3
            .deleteObject({
              Bucket: bucketName,
              Key: normalizedPath,
            })
            .promise();
        }
        minioSuccess = true;
      } catch (minioError) {
        console.error("❌ MinIO folder deletion failed:", minioError.message);
      }

      try {
        const { data: files } = await supabaseAdmin.storage
          .from(bucketName)
          .list(folderPath);

        if (files && files.length > 0) {
          const filePaths = files.map((file) =>
            folderPath ? `${folderPath}/${file.name}` : file.name
          );
          await supabaseAdmin.storage.from(bucketName).remove(filePaths);
        }
        supabaseSuccess = true;
      } catch (supabaseError) {
        console.error(
          "❌ Supabase folder deletion failed:",
          supabaseError.message
        );
      }

      if (recursive) {
        await supabaseAdmin
          .from("storage_objects")
          .delete()
          .eq("bucket_id", bucket.id)
          .ilike("object_key", `${normalizedPath}%`);
      }

      await supabaseAdmin
        .from("folders")
        .delete()
        .eq("bucket_id", bucket.id)
        .eq("folder_path", normalizedPath);

      await logAuditEvent(
        "DELETE_FOLDER",
        bucketName,
        normalizedPath,
        userId,
        supabaseSuccess && minioSuccess,
        null,
        {
          recursive,
        }
      );

      return res.json({
        success: true,
        message: `Folder '${folderPath}' deleted successfully`,
        supabase: supabaseSuccess,
        minio: minioSuccess,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Folder deletion failed",
        error: error.message,
      });
    }
  },

  listBuckets: async (req, res) => {
    try {
      const { data: buckets, error } = await supabaseAdmin
        .from("buckets")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return res.json({
        success: true,
        buckets: buckets || [],
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to list buckets",
        error: error.message,
      });
    }
  },

  listObjects: async (req, res) => {
    const { bucketName } = req.params;
    const { prefix = "", delimiter = "" } = req.query;
    const userId = req.user?.userId;

    try {
      const { data: bucket, error: bucketError } = await supabaseAdmin
        .from("buckets")
        .select("*")
        .eq("name", bucketName)
        .single();

      if (bucketError || !bucket) {
        return res.status(404).json({
          success: false,
          message: "Bucket not found",
        });
      }

      const { data: objects, error } = await supabaseAdmin
        .from("storage_objects")
        .select("*")
        .eq("bucket_id", bucket.id)
        .ilike("object_key", `${prefix}%`)
        .order("object_key");

      if (error) throw error;

      return res.json({
        success: true,
        objects: objects || [],
        bucket: bucket.name,
        prefix,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to list objects",
        error: error.message,
      });
    }
  },

  getFileUrl: async (req, res) => {
    const { bucketName, objectKey } = req.params;
    const userId = req.user?.userId;

    try {
      // Verify access by bucket name only
      const { data: bucket, error: bucketError } = await supabaseAdmin
        .from("buckets")
        .select("*")
        .eq("name", bucketName)
        .single();

      if (bucketError || !bucket) {
        return res.status(404).json({
          success: false,
          message: "Bucket not found",
        });
      }
      const minioUrl = s3.getSignedUrl("getObject", {
        Bucket: bucketName,
        Key: objectKey,
      });

      const { data: supabaseData } = await supabaseAdmin.storage
        .from(bucketName)
        .createSignedUrl(objectKey, parseInt(expiresIn));

      return res.json({
        success: true,
        urls: {
          minio: minioUrl,
          supabase: supabaseData?.signedUrl,
        },
        expiresIn: parseInt(expiresIn),
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate file URLs",
        error: error.message,
      });
    }
  },

  createMinioUser: async (req, res) => {
    const { username, policies = ["readonly"] } = req.body;
    const userId = req.user?.userId;

    try {
      if (!username) {
        return res.status(400).json({
          success: false,
          message: "Username is required",
        });
      }

      const accessKey = generateAccessKey(username);
      const secretKey = generateSecretKey();

      const { data: existingUser } = await supabaseAdmin
        .from("minio_users")
        .select("id")
        .eq("username", username)
        .single();

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "User already exists",
        });
      }

      const { data: newUser, error: userError } = await supabaseAdmin
        .from("minio_users")
        .insert({
          username,
          access_key: accessKey,
          secret_key: secretKey,
          policies,
          created_by: userId,
        })
        .select()
        .single();

      if (userError)
        throw new Error(`User creation failed: ${userError.message}`);

      await logAuditEvent("CREATE_MINIO_USER", null, null, userId, true, null, {
        username,
        policies,
      });

      return res.json({
        success: true,
        message: `MinIO user '${username}' created successfully`,
        user: {
          id: newUser.id,
          username,
          accessKey,
          secretKey,
          policies,
          isActive: true,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "MinIO user creation failed",
        error: error.message,
      });
    }
  },

  listMinioUsers: async (req, res) => {
    const userId = req.user?.userId;

    try {
      const { data: users, error } = await supabaseAdmin
        .from("minio_users")
        .select("id, username, access_key, is_active, policies, created_at")
        .eq("created_by", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return res.json({
        success: true,
        users: users || [],
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to list MinIO users",
        error: error.message,
      });
    }
  },
  deleteMinioUser: async (req, res) => {
    const { username } = req.params;
    const userId = req.user?.userId;

    try {
      const { data: user, error: userError } = await supabaseAdmin
        .from("minio_users")
        .select("*")
        .eq("username", username)
        .eq("created_by", userId)
        .single();

      if (userError || !user) {
        return res.status(404).json({
          success: false,
          message: "MinIO user not found or access denied",
        });
      }

      const { error: deleteError } = await supabaseAdmin
        .from("minio_users")
        .delete()
        .eq("id", user.id);

      if (deleteError) throw deleteError;

      await logAuditEvent("DELETE_MINIO_USER", null, null, userId, true, null, {
        username,
      });

      return res.json({
        success: true,
        message: `MinIO user '${username}' deleted successfully`,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "MinIO user deletion failed",
        error: error.message,
      });
    }
  },

  syncStatus: async (req, res) => {
    const { bucketName } = req.params;
    const userId = req.user?.userId;

    try {
      // lookup by name only
      const { data: bucket, error: bucketError } = await supabaseAdmin
        .from("buckets")
        .select("*")
        .eq("name", bucketName)
        .single();

      if (bucketError || !bucket) {
        return res.status(404).json({
          success: false,
          message: "Bucket not found",
        });
      }
      let minioExists = false;
      try {
        await s3.headBucket({ Bucket: bucketName }).promise();
        minioExists = true;
      } catch (error) {
        if (error.statusCode !== 404) {
          console.error("MinIO check error:", error.message);
        }
      }

      let supabaseExists = false;
      try {
        const { data: buckets } = await supabaseAdmin.storage.listBuckets();
        supabaseExists = buckets.some((b) => b.name === bucketName);
      } catch (error) {
        console.error("Supabase check error:", error.message);
      }

      await supabaseAdmin
        .from("buckets")
        .update({
          minio_created: minioExists,
          supabase_created: supabaseExists,
        })
        .eq("id", bucket.id);

      return res.json({
        success: true,
        sync: {
          minio: minioExists,
          supabase: supabaseExists,
          inSync: minioExists === supabaseExists,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Sync check failed",
        error: error.message,
      });
    }
  },
};

async function ensureMinioBucket(
  bucketName,
  encryption = true,
  encryptionType = "AES256"
) {
  try {
    try {
      await s3.headBucket({ Bucket: bucketName }).promise();
      console.log(`✅ MinIO bucket '${bucketName}' already exists`);
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        console.log(`🔄 Creating MinIO bucket '${bucketName}'...`);

        const params = {
          Bucket: bucketName,
          ACL: "private",
        };

        await s3.createBucket(params).promise();

        if (encryption) {
          const encryptionParams = {
            Bucket: bucketName,
            ServerSideEncryptionConfiguration: {
              Rules: [
                {
                  ApplyServerSideEncryptionByDefault: {
                    SSEAlgorithm: encryptionType,
                  },
                },
              ],
            },
          };
          await s3.putBucketEncryption(encryptionParams).promise();
        }

        console.log(`✅ MinIO bucket '${bucketName}' created successfully`);
        return true;
      } else {
        console.error(`❌ MinIO headBucket error:`, error.message);
        throw error;
      }
    }
  } catch (error) {
    console.error(
      `❌ MinIO bucket operation failed for '${bucketName}':`,
      error.message
    );
    throw new Error(`MinIO bucket creation failed: ${error.message}`);
  }
}

function generateAccessKey(username) {
  return `${username.toUpperCase()}_${crypto
    .randomBytes(8)
    .toString("hex")
    .toUpperCase()}`;
}

function generateSecretKey() {
  return crypto.randomBytes(20).toString("base64");
}

async function logAuditEvent(
  operation,
  bucketName,
  objectKey,
  userId,
  success,
  errorMessage,
  metadata = {}
) {
  try {
    await supabaseAdmin.from("storage_audit_logs").insert({
      operation,
      bucket_name: bucketName,
      object_key: objectKey,
      user_id: userId,
      success,
      error_message: errorMessage,
      metadata,
    });
  } catch (error) {
    console.error("Failed to log audit event:", error.message);
  }
}
  async function ensureFolder(bucketName, folderPath) {
  try {
    await s3.putObject({
      Bucket: bucketName,
      Key: `${folderPath}/`,
      Body: "",
      ContentType: "application/x-directory"
    }).promise();
    return true;
  } catch (error) {
    console.error(`Failed to create folder ${folderPath}:`, error);
    return false;
  }
}

module.exports = minioController;
