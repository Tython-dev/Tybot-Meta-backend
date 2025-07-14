const AWS = require("aws-sdk");
require("dotenv").config();

const s3 = new AWS.S3({
  endpoint: 's3.tybot.ma',     
  accessKeyId: 'b3Xe4DfurRmxPQLp5ElI',
  secretAccessKey: 'GSSaEFMfe2fziAt3INz8VU8tYTW1rdZiQF0hK4De',
  sslEnabled: true,      
  s3ForcePathStyle: true, 
  signatureVersion: "v4",
});

module.exports = s3;
