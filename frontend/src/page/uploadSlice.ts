import {
  createSlice,
  type PayloadAction,
  createAsyncThunk,
} from "@reduxjs/toolkit";
import type {
  UploadState,
  UploadSlot,
  FileStatus,
  ColumnMappingState,
  ColumnMappingDecision,
} from "./uploadTypes";
import { uploadFileToApi, compareColumnsWithBigQuery } from "./uploadApi";

const STORAGE_KEY = "fileUploadStatuses";

// Load initial state from localStorage
const loadPersistedState = (): UploadState => {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (serialized) {
      const parsed = JSON.parse(serialized);
      const columnMappings = Object.fromEntries(
        Object.entries(parsed.columnMappings || {}).map(([slotId, mapping]) => [
          slotId,
          {
            ...(mapping as Record<string, unknown>),
            uploadedColumnSamples:
              (mapping as { uploadedColumnSamples?: string[][] })
                ?.uploadedColumnSamples || [],
          },
        ]),
      ) as Record<string, ColumnMappingState>;
      return {
        fileStatuses: parsed.fileStatuses || {},
        columnMappings,
      };
    }
  } catch (error) {
    console.error("Failed to load persisted state:", error);
  }
  return { fileStatuses: {}, columnMappings: {} };
};

// Save state to localStorage
const saveStateToLocalStorage = (state: UploadState) => {
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    console.error("Failed to save state:", error);
  }
};

const initialState: UploadState = loadPersistedState();

export const uploadFileThunk = createAsyncThunk<
  { slotId: string; fileName: string; fileSize: number },
  { file: File; slotConfig: UploadSlot; moduleType?: "revised" | "normal" }
>(
  "upload/uploadFile",
  async ({ file, slotConfig, moduleType }, { rejectWithValue }) => {
    try {
      await uploadFileToApi(file, slotConfig, moduleType || "normal");
      return {
        slotId: slotConfig.id,
        fileName: file.name,
        fileSize: file.size,
      };
    } catch (error) {
      return rejectWithValue({
        slotId: slotConfig.id,
        fileName: file.name,
        fileSize: file.size,
        error: (error as Error).message,
      });
    }
  },
);

export const compareColumnMappingsThunk = createAsyncThunk<
  { slotId: string; mapping: ColumnMappingState },
  {
    slotId: string;
    tableId?: string;
    uploadedColumns: string[];
    uploadedColumnSamples: string[][];
    sheetName?: string;
    headerRowIndex: number;
  }
>(
  "upload/compareColumnMappings",
  async (
    { slotId, tableId, uploadedColumns, uploadedColumnSamples, sheetName, headerRowIndex },
    { rejectWithValue },
  ) => {
    try {
      const result = await compareColumnsWithBigQuery({
        slotId,
        tableId,
        uploadedColumns,
      });

      return {
        slotId,
        mapping: {
          status: "ready",
          datasetId: result.datasetId,
          tableId: result.tableId,
          sheetName,
          headerRowIndex,
          storedColumns: result.storedColumns,
          uploadedColumns: result.uploadedColumns,
          uploadedColumnSamples,
          exactMatches: result.exactMatches,
          renamedPairs: result.renamedPairs,
          extraUploadedColumns: result.extraUploadedColumns,
          missingStoredColumns: result.missingStoredColumns,
          duplicateStoredColumns: result.duplicateStoredColumns,
          duplicateUploadedColumns: result.duplicateUploadedColumns,
          actions: result.actions,
        },
      };
    } catch (error) {
      return rejectWithValue({
        slotId,
        error: (error as Error).message,
      });
    }
  },
);

const uploadSlice = createSlice({
  name: "upload",
  initialState,
  reducers: {
    setFileStatus: (
      state,
      action: PayloadAction<{ slotId: string; status: FileStatus }>,
    ) => {
      state.fileStatuses[action.payload.slotId] = action.payload.status;
      saveStateToLocalStorage(state);
    },
    resetFileStatus: (state, action: PayloadAction<string>) => {
      if (state.fileStatuses[action.payload]) {
        state.fileStatuses[action.payload] = {
          ...state.fileStatuses[action.payload],
          status: "ready",
          message: undefined,
        };
        saveStateToLocalStorage(state);
      }
    },
  removeFileStatus: (state, action: PayloadAction<string>) => {
      delete state.fileStatuses[action.payload];
      saveStateToLocalStorage(state);
    },
    setAppliedRenames: (
      state,
      action: PayloadAction<{
        slotId: string;
        appliedRenames: Array<{
          originalUploadedColumn: string;
          renamedColumn: string;
          storedColumn?: string;
        }>;
      }>,
    ) => {
      const existing = state.columnMappings[action.payload.slotId];
      if (!existing) {
        return;
      }

      existing.appliedRenames = action.payload.appliedRenames;
      saveStateToLocalStorage(state);
    },
    restoreFileStatuses: (
      state,
      action: PayloadAction<Record<string, FileStatus>>,
    ) => {
      state.fileStatuses = action.payload;
      saveStateToLocalStorage(state);
    },
    setColumnMappingDecision: (
      state,
      action: PayloadAction<{
        slotId: string;
        decision: ColumnMappingDecision;
      }>,
    ) => {
      const existing = state.columnMappings[action.payload.slotId];
      if (!existing) {
        return;
      }

      existing.selectedDecision = action.payload.decision;
      saveStateToLocalStorage(state);
    },
    clearColumnMapping: (state, action: PayloadAction<string>) => {
      delete state.columnMappings[action.payload];
      saveStateToLocalStorage(state);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(uploadFileThunk.pending, (state, action) => {
        const { id } = action.meta.arg.slotConfig;
        if (state.fileStatuses[id]) {
          state.fileStatuses[id].status = "uploading";
        }
      })
      .addCase(uploadFileThunk.fulfilled, (state, action) => {
        const { slotId, fileName, fileSize } = action.payload;
        state.fileStatuses[slotId] = {
          status: "success",
          message: "Uploaded successfully",
          fileName,
          fileSize,
        };
        saveStateToLocalStorage(state);
      })
      .addCase(uploadFileThunk.rejected, (state, action) => {
        const payload = action.payload as
          | {
              slotId: string;
              fileName: string;
              fileSize: number;
              error: string;
            }
          | undefined;
        if (payload) {
          state.fileStatuses[payload.slotId] = {
            status: "error",
            message: payload.error || "Upload failed",
            fileName: payload.fileName,
            fileSize: payload.fileSize,
          };
        }
      });
    builder
      .addCase(compareColumnMappingsThunk.pending, (state, action) => {
        const { slotId } = action.meta.arg;
        const existing = state.columnMappings[slotId];
        state.columnMappings[slotId] = {
          status: "loading",
          datasetId: undefined,
          tableId: action.meta.arg.tableId,
          sheetName: action.meta.arg.sheetName,
          headerRowIndex: action.meta.arg.headerRowIndex,
          appliedRenames: existing?.appliedRenames || [],
          storedColumns: [],
          uploadedColumns: action.meta.arg.uploadedColumns,
          uploadedColumnSamples: action.meta.arg.uploadedColumnSamples,
          exactMatches: [],
          renamedPairs: [],
          extraUploadedColumns: [],
          missingStoredColumns: [],
          duplicateStoredColumns: [],
          duplicateUploadedColumns: [],
          actions: [],
        };
        saveStateToLocalStorage(state);
      })
      .addCase(compareColumnMappingsThunk.fulfilled, (state, action) => {
        const existing = state.columnMappings[action.payload.slotId];
        state.columnMappings[action.payload.slotId] = action.payload.mapping;
        if (existing?.appliedRenames?.length) {
          state.columnMappings[action.payload.slotId].appliedRenames = existing.appliedRenames;
        }
        saveStateToLocalStorage(state);
      })
      .addCase(compareColumnMappingsThunk.rejected, (state, action) => {
        const payload = action.payload as
          | {
              slotId: string;
              error: string;
            }
          | undefined;

        if (payload) {
          state.columnMappings[payload.slotId] = {
            status: "error",
            appliedRenames: state.columnMappings[payload.slotId]?.appliedRenames || [],
            storedColumns: [],
            uploadedColumns: [],
            uploadedColumnSamples: [],
            exactMatches: [],
            renamedPairs: [],
            extraUploadedColumns: [],
            missingStoredColumns: [],
            duplicateStoredColumns: [],
            duplicateUploadedColumns: [],
            actions: [],
            error: payload.error,
          };
          saveStateToLocalStorage(state);
        }
      });
  },
});

export const {
  setFileStatus,
  resetFileStatus,
  removeFileStatus,
  restoreFileStatuses,
  setColumnMappingDecision,
  clearColumnMapping,
  setAppliedRenames,
} = uploadSlice.actions;
export default uploadSlice.reducer;
