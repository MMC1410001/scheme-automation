export interface UploadSlot {
  id: string;
  name: string;
  bucketPath: string;
  allowedFormats: string[];
  maxSizeInBytes: number;
  multiple?: boolean;
  maxFiles?: number;
  bigQueryDatasetId?: string;
  bigQueryTableId?: string;
  comparisonTableIds?: string[];
}

export type FileStatusType =
  | "idle"
  | "ready"
  | "mapping"
  | "uploading"
  | "success"
  | "error";

export interface FileStatus {
  status: FileStatusType;
  message?: string;
  fileName?: string;
  fileSize?: number;
}

export interface UploadState {
  fileStatuses: Record<string, FileStatus>;
  columnMappings: Record<string, ColumnMappingState>;
}

export type ColumnMappingDecision =
  | "auto_map"
  | "rename_uploaded_column"
  | "rename_stored_column"
  | "manual_review";

export interface ColumnMappingAction {
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
}

export interface ColumnMappingPair {
  storedColumn?: string;
  uploadedColumn: string;
  action: "auto_map" | "review_rename";
  recommendedChangeTarget?: "new_upload" | "stored_schema";
  alternateChangeTarget?: "new_upload" | "stored_schema";
  suggestedStoredName?: string;
  suggestedUploadedName?: string;
}

export interface ColumnMappingState {
  status: "idle" | "loading" | "ready" | "error";
  datasetId?: string;
  tableId?: string;
  sheetName?: string;
  headerRowIndex?: number;
  appliedRenames?: Array<{
    originalUploadedColumn: string;
    renamedColumn: string;
    storedColumn?: string;
  }>;
  storedColumns: string[];
  uploadedColumns: string[];
  uploadedColumnSamples: string[][];
  exactMatches: Array<{
    storedColumn: string;
    uploadedColumn: string;
    action: "auto_map";
  }>;
  renamedPairs: ColumnMappingPair[];
  extraUploadedColumns: string[];
  missingStoredColumns: string[];
  duplicateStoredColumns: Array<{
    normalizedName: string;
    columns: string[];
  }>;
  duplicateUploadedColumns: Array<{
    normalizedName: string;
    columns: string[];
  }>;
  actions: ColumnMappingAction[];
  selectedDecision?: ColumnMappingDecision;
  error?: string;
}
