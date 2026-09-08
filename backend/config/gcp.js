const { Storage } = require("@google-cloud/storage");
require("dotenv").config();

// Google Cloud Storage Setup
// Using credentials from .env as requested: project_id, client_email, private_key
const storage = new Storage({
  projectId: process.env.project_id || process.env.GCP_PROJECT_ID,
  credentials: {
    client_email: process.env.client_email || process.env.GCP_CLIENT_EMAIL,
    // Handle newline characters in private key if they are escaped
    private_key: (process.env.private_key || process.env.GCP_PRIVATE_KEY || "")
      .split(String.raw`\n`)
      .join("\n"),
  },
});

const bucketName = process.env.GCP_BUCKET_NAME; // Ensure this is set in .env
const bucket = storage.bucket(bucketName);

module.exports = { bucket };
