const { BigQuery } = require("@google-cloud/bigquery");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const parseJsonMap = (value, fallback) => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const bigQueryProjectId =
  process.env.BQ_PROJECT_ID ||
  process.env.GCP_PROJECT_ID ||
  process.env.project_id ||
  "";

const readServiceAccountEmail = (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return "";
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed.client_email === "string" ? parsed.client_email : "";
  } catch {
    return "";
  }
};

const bigQueryDatasetId =
  process.env.BQ_DATASET_ID ||
  process.env.BIGQUERY_DATASET_ID ||
  "your_dataset_id";

const bigQueryTableMap = parseJsonMap(process.env.BQ_TABLE_MAP_JSON, {
  incentive_scheme_sku: "incentive_scheme_sku",
  category_b_sku: "category_b_sku",
  contractor_loyalty: "contractor_loyalty",
  sales_system_export: "sales_system_export",
  mapping_of_franchise: "mapping_of_franchise",
  working_file: "working_file",
  parent_child: "parent_child",
  missed_inbill: "missed_inbill",
  scheme_mapping: "scheme_mapping",
});

const bigQueryClientEmail = process.env.client_email || process.env.GCP_CLIENT_EMAIL || "";
const bigQueryPrivateKey = (process.env.private_key || process.env.GCP_PRIVATE_KEY || "")
  .split(String.raw`\n`)
  .join("\n");

// Optional: path to a service-account JSON key file. Leave unset to authenticate
// with the project_id / client_email / private_key variables from .env instead.
const configuredCredentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
const resolvedCredentialPath =
  configuredCredentialPath && fs.existsSync(configuredCredentialPath)
    ? configuredCredentialPath
    : "";
const fileCredentialEmail = readServiceAccountEmail(resolvedCredentialPath);
const bigQueryEffectiveClientEmail =
  fileCredentialEmail || bigQueryClientEmail || "";
const bigQueryCredentialSource = configuredCredentialPath
  ? (resolvedCredentialPath
      ? "GOOGLE_APPLICATION_CREDENTIALS"
      : "GOOGLE_APPLICATION_CREDENTIALS_missing")
  : "env_credentials";

const bigQueryAuthOptions =
  resolvedCredentialPath
    ? {
        keyFilename: resolvedCredentialPath,
      }
    : bigQueryClientEmail && bigQueryPrivateKey
      ? {
          credentials: {
            client_email: bigQueryClientEmail,
            private_key: bigQueryPrivateKey,
          },
        }
      : {};

// BigQuery setup intentionally follows the same credential source as Storage/GoogleAuth.
const bigquery = new BigQuery({
  projectId: bigQueryProjectId,
  ...bigQueryAuthOptions,
});

console.log(
  `[BigQuery] project=${bigQueryProjectId || "unset"} dataset=${bigQueryDatasetId} source=${bigQueryCredentialSource} client=${bigQueryEffectiveClientEmail || "unset"}`,
);

module.exports = {
  bigquery,
  bigQueryProjectId,
  bigQueryDatasetId,
  bigQueryTableMap,
  bigQueryClientEmail,
  bigQueryEffectiveClientEmail,
  bigQueryCredentialSource,
  bigQueryCredentialPath: resolvedCredentialPath,
};
