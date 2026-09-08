import { decrypt } from "./encryption/decrypt";

/**
 * Gets the base API URL for the application.
 * Handles decryption of VITE_API_URL and ensures it ends with /api.
 * Defaults to /api for local development.
 */
export const getApiBaseUrl = (): string => {
  const password = import.meta.env.VITE_CONFIG_PASSWORD;
  const encryptedApiUrl = import.meta.env.VITE_API_URL;

  console.log("API Base URL Environment Variable:", encryptedApiUrl);

  let baseUrl = "/api";

  if (encryptedApiUrl && encryptedApiUrl.startsWith("http")) {
    baseUrl = encryptedApiUrl;
  } else if (password && encryptedApiUrl) {
    const decrypted = decrypt(encryptedApiUrl, password);
    if (decrypted) {
      baseUrl = decrypted;
    }
  }

  // Ensure it ends with /api
  if (!baseUrl.endsWith("/api")) {
    // Remove trailing slash if present
    const normalized = baseUrl.replace(/\/$/, "");
    baseUrl = `${normalized}/api`;
  }
  
  console.log("Final API Base URL:", baseUrl);
  console.log("[API] Frontend resolved backend URL:", baseUrl);

  return baseUrl;
};
