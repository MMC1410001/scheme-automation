const express = require("express");
const axios = require("axios");
const path = require("path");
const { upload } = require("../middleware/multer");
const { bucket } = require("../config/gcp");
const { GoogleAuth } = require("google-auth-library");

// Cloud Run targets are configured per environment. Set these in .env —
// see .env.example. GOOGLE_APPLICATION_CREDENTIALS, if set, is honoured by the
// Google auth library automatically for minting the ID token below.
const CLOUD_RUN_URL_NORMAL = process.env.CLOUD_RUN_URL_NORMAL || "";
const CLOUD_RUN_URL_REVISED = process.env.CLOUD_RUN_URL_REVISED || "";
const RUN_ID_NORMAL = process.env.RUN_ID_NORMAL || "normal_run";
const RUN_ID_REVISED = process.env.RUN_ID_REVISED || "revised_run";

const { sendBillingNotification } = require("../utils/email/email");

const router = express.Router();

// In-memory state for process status per module
let processStatus = {
  normal: { isRunning: false, startTime: null },
  revised: { isRunning: false, startTime: null },
};

// Helper to get current process statuses
const checkAllProcessStatuses = () => processStatus;

// Helper to get ID Token using GoogleAuth (using JSON file via GOOGLE_APPLICATION_CREDENTIALS)
const getIdToken = async (audience) => {
  try {
    const auth = new GoogleAuth();
    const client = await auth.getIdTokenClient(audience);
    const token = await client.idTokenProvider.fetchIdToken(audience);

    console.log(
      `[getIdToken] Successfully fetched ID-token for audience: ${audience}`,
    );

    if (!token) {
      throw new Error("Failed to fetch ID token");
    }
    return token;
  } catch (error) {
    console.error(`[getIdToken] Error fetching ID token:`, error.message);
    throw error;
  }
};

/**
 * @swagger
 * /api/process-status:
 *   get:
 *     summary: Check if the automation process is running
 *     tags: [Automation]
 *     responses:
 *       200:
 *         description: Current status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isRunning:
 *                   type: boolean
 *                 startTime:
 *                   type: number
 *                   nullable: true
 */
router.get("/process-status", (req, res) => {
  const statuses = checkAllProcessStatuses();
  res.json(statuses);
});

// Valid slot name pattern (alphanumeric, underscores, hyphens)
const SLOT_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * @swagger
 * /api/upload:
 *   post:
 *     summary: Upload an Excel file to GCP Storage
 *     description: Uploads a file to a specific slot folder in the 'uncleaned' subdirectory.
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The Excel file to upload.
 *               slot:
 *                 type: string
 *                 description: The slot identifier (folder name).
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    console.log(`[Upload] Received request to /api/upload`);

    if (!req.file) {
      console.warn("[Upload] No file uploaded in request.");
      return res.status(400).send("No file uploaded.");
    }

    const { slot, module: moduleType = "normal" } = req.body;

    console.log(
      `[Upload] Processing file: ${req.file.originalname}, slot: ${slot}, module: ${moduleType}`,
    );

    if (!slot || !SLOT_PATTERN.test(slot)) {
      console.warn(`[Upload] Invalid or missing slot name: ${slot}`);
      return res.status(400).send("Invalid slot name.");
    }

    const originalName = req.file.originalname;
    const ext = path.extname(originalName).toLowerCase();

    // Validate extension
    const allowedExtensions = [".xlsx", ".xls", ".txt", ".csv"];
    if (!allowedExtensions.includes(ext)) {
      console.warn(`[Upload] Invalid file extension: ${ext}`);
      return res
        .status(400)
        .send("Only Excel, CSV and Text files are allowed.");
    }

    // Determine GCS file name based on slot
    let gcsFileName;

    if (slot === "billing_extract") {
      gcsFileName = `billing_extract/uncleaned/billing_extract/${originalName}`;
    } else if (slot === "missed_inbill") {
      gcsFileName = `missed_inbill/uncleaned/missed_inbill/${originalName}`;
    } else if (slot === "scheme_mapping") {
      gcsFileName = `scheme_mapping/uncleaned/sm/${originalName}`;
    } else if (slot === "scheme_mapping_adjustment") {
      gcsFileName = `scheme_mapping_adjustment/uncleaned/${originalName}`;
    } else if (
      slot === "Adjustments" ||
      slot.toLowerCase().includes("adjustment")
    ) {
      gcsFileName = `working_adjustment/uncleaned/${originalName}`;
    } else {
      gcsFileName = `${slot}/uncleaned/${originalName}`;
    }
    console.log(`[Upload] Uploading to GCS path: ${gcsFileName}`);
    const file = bucket.file(gcsFileName);

    const stream = file.createWriteStream({
      metadata: {
        contentType: req.file.mimetype,
      },
      resumable: false,
    });

    stream.on("error", (err) => {
      console.error("[Upload] GCS Stream Error:", err);
      // Only send response if not already sent
      if (!res.headersSent) {
        res.status(500).send(`Storage upload failed: ${err.message}`);
      }
    });

    stream.on("finish", () => {
      console.log(
        `[Upload] Successfully uploaded ${originalName} to ${gcsFileName}`,
      );
      if (!res.headersSent) {
        res.status(200).send({
          message: `File uploaded successfully to slot ${slot}`,
          fileName: gcsFileName,
        });
      }
    });

    // Write buffer directly
    stream.end(req.file.buffer);
  } catch (error) {
    console.error("[Upload] Fatal Error:", error);
    if (!res.headersSent) {
      res.status(500).send(`Server error during upload: ${error.message}`);
    }
  }
});

/**
 * @swagger
 * /api/run-process:
 *   post:
 *     summary: Trigger the automation process
 *     description: Calls the external automation API to start processing (authenticated via service account).
 *     tags: [Automation]
 *     responses:
 *       200:
 *         description: Automation API triggered successfully
 *       409:
 *         description: A job is already running
 *       500:
 *         description: Server error or automation API failure
 */
router.post("/run-process", async (req, res) => {
  const { module: moduleType } = req.body;
  const targetModule = moduleType === "revised" ? "revised" : "normal";

  const statuses = checkAllProcessStatuses();

  try {
    let targetUrl = CLOUD_RUN_URL_NORMAL;
    let payload = {
      run_id: RUN_ID_NORMAL,
    };

    if (moduleType === "revised") {
      targetUrl = CLOUD_RUN_URL_REVISED;
      payload = {
        run_id: RUN_ID_REVISED,
      };
      console.log("[RunProcess] Using REVISED module configuration");
    } else {
      console.log("[RunProcess] Using NORMAL module configuration");
    }

    if (!targetUrl) {
      return res.status(503).json({
        message:
          "Cloud Run target is not configured. Set CLOUD_RUN_URL_NORMAL and CLOUD_RUN_URL_REVISED in your .env (see .env.example).",
      });
    }

    // Use targetUrl as audience for token generation
    const token = await getIdToken(targetUrl);

    console.log(`[RunProcess] Triggering URL: ${targetUrl}`);
    console.log(`[RunProcess] Sending payload: ${JSON.stringify(payload)}`);

    // Mark as running immediately
    processStatus[targetModule].isRunning = true;
    processStatus[targetModule].startTime = Date.now();

    // Fire and forget — no timeout, let Cloud Run respond whenever it finishes
    axios.post(targetUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    }).then((response) => {
      processStatus[targetModule].isRunning = false;
      processStatus[targetModule].startTime = null;
      sendBillingNotification(response.status, response.data).catch((err) =>
        console.error("[EmailError] Failed to send success notification:", err.message),
      );
    }).catch((error) => {
      processStatus[targetModule].isRunning = false;
      processStatus[targetModule].startTime = null;
      const errorDetails = error.response?.data || error.message;
      console.error("Cloud Run Trigger Error:", errorDetails);
      sendBillingNotification(
        error.response?.status || "ERROR",
        errorDetails,
      ).catch((err) =>
        console.error("[EmailError] Failed to send error notification:", err.message),
      );
    });

    // Send triggered email immediately without waiting for Cloud Run to finish
    sendBillingNotification("Triggered", { module: moduleType, message: "Process has been triggered and is now running." })
      .catch((err) => console.error("[EmailError] Failed to send triggered notification:", err.message));

    res.status(200).json({
      message: "Automation process triggered successfully.",
    });
  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error("[RunProcess] Outer catch error:", error.message, error.stack);
    res.status(500).json({
      message: "Failed to trigger automation process.",
      error: errorDetails,
    });
  }
});

/**
 * @swagger
 * /api/test-connection:
 *   get:
 *     summary: Test connectivity to the Cloud Run service
 *     description: Verifies that the backend can connect and authenticate to the Cloud Run service using the stored token. Does not trigger the job.
 *     tags: [Automation]
 *     responses:
 *       200:
 *         description: Connection successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 status:
 *                   type: integer
 *       401:
 *         description: Authentication failed (Invalid Token)
 *       500:
 *         description: Connection failed
 */
router.get("/test-connection", async (req, res) => {
  try {
    const targetUrl = CLOUD_RUN_URL_REVISED;

    const audience = process.env.AUDIENCE || targetUrl;
    const token = await getIdToken(audience);

    // We use a GET request to verify connectivity.
    const response = await axios.get(targetUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      validateStatus: function (status) {
        return true; // Resolve promise for all status codes
      },
    });

    // If we get here, we connected.
    if (response.status === 401 || response.status === 403) {
      return res.status(401).json({
        message: "Connected to Cloud Run, but authentication failed.",
        status: response.status,
        data: response.data,
      });
    }

    return res.status(200).json({
      message: "Successfully connected to Cloud Run service.",
      status: response.status,
      note: "A non-200 status from the service is expected if it only accepts POST, but confirms connectivity.",
    });
  } catch (error) {
    console.error("Connection Test Error:", error.message);
    res.status(500).json({
      message: "Failed to connect to Cloud Run service.",
      error: error.message,
    });
  }
});

module.exports = router;
