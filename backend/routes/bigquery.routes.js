const express = require("express");
const path = require("path");
const {
  bigquery,
  bigQueryDatasetId,
  bigQueryTableMap,
  bigQueryProjectId,
  bigQueryClientEmail,
  bigQueryEffectiveClientEmail,
  bigQueryCredentialSource,
  bigQueryCredentialPath,
} = require("../config/bigquery");
const {
  finalizeColumnNames,
  getComparisonKeyVariants,
} = require("../utils/columnCleaner");
const { upload } = require("../middleware/multer");
const { extractXlsxRows } = require("../utils/extractXlsxRows");

const router = express.Router();

const buildComparison = (storedColumns, uploadedColumns) => {
  const cleanedStoredColumns = finalizeColumnNames(storedColumns);
  const cleanedUploadedColumns = finalizeColumnNames(uploadedColumns);
  const storedVariantSets = cleanedStoredColumns.map((column) =>
    new Set(getComparisonKeyVariants(column)),
  );
  const uploadedVariantSets = cleanedUploadedColumns.map((column) =>
    new Set(getComparisonKeyVariants(column)),
  );

  const scoredPairs = [];

  const pairScore = (storedIndex, uploadedIndex) => {
    const storedColumn = cleanedStoredColumns[storedIndex];
    const uploadedColumn = cleanedUploadedColumns[uploadedIndex];

    if (!storedColumn || !uploadedColumn) {
      return 0;
    }

    if (storedColumn === uploadedColumn) {
      return 100;
    }

    const storedVariants = storedVariantSets[storedIndex];
    const uploadedVariants = uploadedVariantSets[uploadedIndex];
    const hasVariantOverlap = [...storedVariants].some((variant) =>
      uploadedVariants.has(variant),
    );

    if (!hasVariantOverlap) {
      return 0;
    }

    const exactCoreMatch =
      storedColumn.replace(/_\d+$/g, "") === uploadedColumn.replace(/_\d+$/g, "");

    return exactCoreMatch ? 95 : 90;
  };

  for (let storedIndex = 0; storedIndex < cleanedStoredColumns.length; storedIndex += 1) {
    for (let uploadedIndex = 0; uploadedIndex < cleanedUploadedColumns.length; uploadedIndex += 1) {
      const score = pairScore(storedIndex, uploadedIndex);
      if (score > 0) {
        scoredPairs.push({ storedIndex, uploadedIndex, score });
      }
    }
  }

  scoredPairs.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.storedIndex !== right.storedIndex) return left.storedIndex - right.storedIndex;
    return left.uploadedIndex - right.uploadedIndex;
  });

  const matchedStoredIndexes = new Set();
  const matchedUploadedIndexes = new Set();
  const exactMatches = [];

  scoredPairs.forEach(({ storedIndex, uploadedIndex }) => {
    if (matchedStoredIndexes.has(storedIndex) || matchedUploadedIndexes.has(uploadedIndex)) {
      return;
    }

    matchedStoredIndexes.add(storedIndex);
    matchedUploadedIndexes.add(uploadedIndex);

    exactMatches.push({
      storedColumn: cleanedStoredColumns[storedIndex],
      uploadedColumn: cleanedUploadedColumns[uploadedIndex],
      action: "auto_map",
    });
  });

  const unmatchedStored = cleanedStoredColumns.filter(
    (_, index) => !matchedStoredIndexes.has(index),
  );
  const unmatchedUploaded = cleanedUploadedColumns.filter(
    (_, index) => !matchedUploadedIndexes.has(index),
  );

  const renamedPairs = [];
  const renameCount = Math.min(unmatchedStored.length, unmatchedUploaded.length);

  for (let index = 0; index < renameCount; index += 1) {
    const storedColumn = unmatchedStored[index];
    const uploadedColumn = unmatchedUploaded[index];

    renamedPairs.push({
      storedColumn,
      uploadedColumn,
      action: "review_rename",
      suggestedName: storedColumn,
    });
  }

  const extraUploadedColumns = unmatchedUploaded;
  const missingStoredColumns = unmatchedStored;

  return {
    storedColumns: cleanedStoredColumns,
    uploadedColumns: cleanedUploadedColumns,
    exactMatches,
    renamedPairs,
    extraUploadedColumns,
    missingStoredColumns,
    duplicateStoredColumns: [],
    duplicateUploadedColumns: [],
    actions: renamedPairs.map((pair) => ({
      type: "rename_uploaded_column",
      storedColumn: pair.storedColumn,
      uploadedColumn: pair.uploadedColumn,
      suggestedName: pair.suggestedName,
      reason: "Rename the incoming column to match the stored schema.",
      recommendedChangeTarget: "new_upload",
    })),
  };
};

router.get("/bigquery/config", (req, res) => {
  return res.status(200).json({
    projectId: bigQueryProjectId,
    datasetId: bigQueryDatasetId,
    tableMap: bigQueryTableMap,
  });
});

router.post("/bigquery/extract-rows", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    const { sheetName, maxRows = "50" } = req.body;
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext !== ".xlsx" && ext !== ".xls") {
      return res.status(400).json({
        message: "Only Excel files are supported for server-side row extraction.",
      });
    }

    const result = extractXlsxRows(req.file.buffer, sheetName, Number(maxRows) || 50);
    return res.status(200).json(result);
  } catch (error) {
    console.error("[BigQuery] extract-rows failed:", error);
    return res.status(500).json({
      message: "Failed to extract rows from workbook.",
      error: error.message,
    });
  }
});

router.get("/bigquery/debug-auth", (req, res) => {
  return res.status(200).json({
    projectId: bigQueryProjectId,
    datasetId: bigQueryDatasetId,
    credentialSource: bigQueryCredentialSource,
    credentialPath: bigQueryCredentialPath,
    configuredClientEmail: bigQueryClientEmail || null,
    effectiveClientEmail: bigQueryEffectiveClientEmail || null,
    tableMap: bigQueryTableMap,
  });
});

router.get("/bigquery/probe", async (req, res) => {
  const datasetId = req.query.datasetId || bigQueryDatasetId;
  const tableId = req.query.tableId || bigQueryTableMap.trip_scheme_sku;

  try {
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableId);
    const [metadata] = await table.getMetadata();

    return res.status(200).json({
      ok: true,
      projectId: bigQueryProjectId,
      datasetId,
      tableId,
      credentialSource: bigQueryCredentialSource,
      credentialPath: bigQueryCredentialPath,
      effectiveClientEmail: bigQueryEffectiveClientEmail || null,
      tableExists: Boolean(metadata?.id),
      tableFullId: metadata?.id || null,
      schemaFieldCount: Array.isArray(metadata?.schema?.fields)
        ? metadata.schema.fields.length
        : 0,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      projectId: bigQueryProjectId,
      datasetId,
      tableId,
      credentialSource: bigQueryCredentialSource,
      credentialPath: bigQueryCredentialPath,
      effectiveClientEmail: bigQueryEffectiveClientEmail || null,
      error: {
        message: error.message,
        code: error.code || null,
        errors: error.errors || null,
      },
    });
  }
});

router.post("/bigquery/compare-columns", async (req, res) => {
  try {
    const { datasetId, tableId, slotId, uploadedColumns } = req.body;

    const resolvedDatasetId = datasetId || bigQueryDatasetId;
    const resolvedTableId = tableId || (slotId ? bigQueryTableMap[slotId] : "");

    if (!resolvedDatasetId || !resolvedTableId) {
      return res.status(400).json({
        message: "datasetId or mapped tableId is required.",
      });
    }

    if (!Array.isArray(uploadedColumns)) {
      return res.status(400).json({
        message: "uploadedColumns must be an array.",
      });
    }

    const dataset = bigquery.dataset(resolvedDatasetId);
    const table = dataset.table(resolvedTableId);
    const [metadata] = await table.getMetadata();

    const storedColumns = Array.isArray(metadata?.schema?.fields)
      ? metadata.schema.fields.map((field) => field.name)
      : [];

    const comparison = buildComparison(storedColumns, uploadedColumns);

    return res.status(200).json({
      datasetId: resolvedDatasetId,
      tableId: resolvedTableId,
      ...comparison,
    });
  } catch (error) {
    console.error("[BigQuery] Compare columns failed:", error);
    const permissionHint =
      error?.code === 403
        ? `BigQuery rejected metadata access for ${bigQueryClientEmail || "the configured service account"}. Make sure that exact principal has at least BigQuery metadata access on ${bigQueryProjectId}:${bigQueryDatasetId}.`
        : "";
    return res.status(500).json({
      message: "Failed to compare columns with BigQuery.",
      hint: permissionHint,
      error: error.message,
    });
  }
});

module.exports = router;
