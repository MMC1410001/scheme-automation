import { getApiBaseUrl } from "../config/api-config";
import type { UploadSlot } from "./uploadTypes";

export const uploadFileToApi = async (
  file: File,
  slotConfig: UploadSlot,
  moduleType: "revised" | "normal" = "normal",
): Promise<void> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("slot", slotConfig.bucketPath);
  formData.append("module", moduleType);

  const apiUrl = getApiBaseUrl();

  const response = await fetch(`${apiUrl}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Upload failed for ${file.name}:`, errorText);
    throw new Error(`Upload failed: ${response.statusText}`);
  }
};

export const compareColumnsWithBigQuery = async (params: {
  slotId: string;
  datasetId?: string;
  tableId?: string;
  uploadedColumns: string[];
}): Promise<{
  datasetId: string;
  tableId: string;
  storedColumns: string[];
  uploadedColumns: string[];
  exactMatches: Array<{
    storedColumn: string;
    uploadedColumn: string;
    action: "auto_map";
  }>;
  renamedPairs: Array<{
    storedColumn: string;
    uploadedColumn: string;
    action: "review_rename";
    recommendedChangeTarget?: "new_upload" | "stored_schema";
    alternateChangeTarget?: "new_upload" | "stored_schema";
    suggestedStoredName?: string;
    suggestedUploadedName?: string;
  }>;
  extraUploadedColumns: string[];
  missingStoredColumns: string[];
  actions: Array<{
    type:
      | "auto_map"
      | "rename_uploaded_column"
      | "rename_stored_column"
      | "extra_uploaded_column"
      | "missing_stored_column"
      | "duplicate_uploaded_column"
      | "duplicate_stored_column";
    storedColumn?: string;
    uploadedColumn?: string;
    suggestedName?: string;
    reason?: string;
    resolution?: string;
    recommendedChangeTarget?: "new_upload" | "stored_schema";
  }>;
  duplicateStoredColumns: Array<{
    normalizedName: string;
    columns: string[];
  }>;
  duplicateUploadedColumns: Array<{
    normalizedName: string;
    columns: string[];
  }>;
}> => {
  const apiUrl = getApiBaseUrl();
  const response = await fetch(`${apiUrl}/bigquery/compare-columns`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to compare columns with BigQuery");
  }

  return response.json();
};

export const extractWorkingFileRowsFromBackend = async (params: {
  file: File;
  sheetName?: string;
  maxRows?: number;
}): Promise<{
  sheetName: string;
  sheetPath: string;
  availableSheets: string[];
  rows: string[][];
}> => {
  const formData = new FormData();
  formData.append("file", params.file);
  if (params.sheetName) {
    formData.append("sheetName", params.sheetName);
  }
  formData.append("maxRows", String(params.maxRows ?? 50));

  const apiUrl = getApiBaseUrl();
  const response = await fetch(`${apiUrl}/bigquery/extract-rows`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to extract rows from workbook");
  }

  return response.json();
};
