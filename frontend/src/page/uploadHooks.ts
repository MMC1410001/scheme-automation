import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store";
import type { UploadSlot } from "./uploadTypes";
import * as XLSX from "xlsx";
import {
  setFileStatus,
  uploadFileThunk,
  // resetFileStatus,
  removeFileStatus,
  resetFileStatus,
  compareColumnMappingsThunk,
  setColumnMappingDecision,
  clearColumnMapping,
  setAppliedRenames,
} from "./uploadSlice";
import { toast } from "sonner";
import { fileRegistryService } from "./fileRegistry";
import {
  buildHierarchicalColumnNames,
  finalizeColumnNames,
  finalizeColumnNamesWithOffset,
} from "./columnCleaner";

type HeaderExtractionResult = {
  headers: string[];
  columnSamples: string[][];
  sheetName?: string;
  headerRowIndex: number;
};

type WorksheetRowsResult = {
  rows: string[][];
  rowNumbers: number[];
};

type RawXlsxFileEntry = {
  content?: Uint8Array;
};

const WORKING_FILE_SHEET_NAMES = ["working file", "workingfile"];
const MAPPING_SHEET_NAMES = ["mapping", "map"];

class MappingParentChildMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MappingParentChildMissingError";
  }
}

type RowProfile = {
  row: string[];
  filled: string[];
  total: number;
  textCount: number;
  mixedCount: number;
  numericCount: number;
  otherCount: number;
  uniqueCount: number;
  avgLength: number;
  headerTokenCount: number;
};

const HEADER_TOKENS = new Set([
  "code",
  "name",
  "type",
  "date",
  "amount",
  "value",
  "region",
  "zone",
  "state",
  "city",
  "town",
  "dealer",
  "firm",
  "customer",
  "client",
  "party",
  "product",
  "sku",
  "item",
  "qty",
  "quantity",
  "rate",
  "price",
  "id",
  "number",
  "no",
  "status",
  "month",
  "year",
  "day",
  "franchise",
  "scheme",
  "branch",
  "district",
  "area",
  "category",
  "description",
  "reference",
]);

const classifyCell = (cell: string) => {
  const value = cell.trim();
  if (!value) return "blank";

  const hasLetter = /[A-Za-z]/.test(value);
  const hasDigit = /\d/.test(value);
  const isNumericLike = /^[-+]?[\d,.%]+$/.test(value);
  const hasCodeLikeChars = /[+/()_-]/.test(value);

  if (isNumericLike && !hasLetter) return "numeric";
  if (hasDigit && hasLetter) return "mixed";
  if (hasCodeLikeChars && hasDigit) return "mixed";
  if (hasLetter) return "text";
  return "other";
};

const profileRow = (row: string[]): RowProfile => {
  const values = row.map((cell) => cell.trim());
  const filled = values.filter(Boolean);
  const kinds = filled.map(classifyCell);
  const total = filled.length;
  const textCount = kinds.filter((kind) => kind === "text").length;
  const mixedCount = kinds.filter((kind) => kind === "mixed").length;
  const numericCount = kinds.filter((kind) => kind === "numeric").length;
  const otherCount = kinds.filter((kind) => kind === "other").length;
  const uniqueCount = new Set(filled.map((cell) => cell.toLowerCase())).size;
  const avgLength =
    total > 0 ? filled.reduce((sum, cell) => sum + cell.length, 0) / total : 0;
  const headerTokenCount = filled.reduce((sum, cell) => {
    const tokens = cell.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);
    return sum + tokens.filter((token) => HEADER_TOKENS.has(token)).length;
  }, 0);

  return {
    row: values,
    filled,
    total,
    textCount,
    mixedCount,
    numericCount,
    otherCount,
    uniqueCount,
    avgLength,
    headerTokenCount,
  };
};

const countFilledCells = (row: string[]) =>
  row.reduce((sum, cell) => sum + (String(cell || "").trim() ? 1 : 0), 0);

const isRowNumeric = (row: string[]): boolean => {
  const filled = row.filter((cell) => String(cell || "").trim());
  if (filled.length === 0) return false;
  return filled.every((cell) => /^\d+(\.\d+)?$/.test(cell.trim()));
};

const findWorkingFileParentRowIndex = (
  rows: string[][],
  leafRowIndex: number,
) => {
  const leafProfile = profileRow(rows[leafRowIndex] || []);
  const leafFilledCount = countFilledCells(leafProfile.row);

  for (let index = leafRowIndex - 1; index >= 0; index -= 1) {
    const candidateRow = rows[index] || [];
    const candidateProfile = profileRow(candidateRow);
    const candidateFilledCount = countFilledCells(candidateProfile.row);

    if (candidateProfile.total < 2) {
      continue;
    }

    if (candidateFilledCount >= leafFilledCount) {
      continue;
    }

    // Skip purely numeric rows (section-number rows like "2", "3", "4" etc.)
    // so we land on the actual section-name row (e.g. "Value Slab", "Early Bird")
    if (isRowNumeric(candidateRow)) {
      continue;
    }

    return index;
  }

  return undefined;
};

const resolveWorkingFileHeaderRows = (rows: string[][], selectedIndex: number) => {
  const currentProfile = profileRow(rows[selectedIndex] || []);
  const currentFilledCount = countFilledCells(currentProfile.row);
  const nextIndex = selectedIndex + 1;
  const nextProfile =
    nextIndex < rows.length ? profileRow(rows[nextIndex] || []) : undefined;

  if (
    nextProfile &&
    countFilledCells(nextProfile.row) >= currentFilledCount &&
    nextProfile.textCount + nextProfile.mixedCount >=
      currentProfile.textCount + currentProfile.mixedCount &&
    nextProfile.headerTokenCount >= currentProfile.headerTokenCount
  ) {
    return {
      parentRowIndex: selectedIndex,
      leafRowIndex: nextIndex,
    };
  }

  return {
    parentRowIndex: findWorkingFileParentRowIndex(rows, selectedIndex),
    leafRowIndex: selectedIndex,
  };
};

const normalizeSheetName = (sheetName: string) =>
  sheetName.trim().toLowerCase().replace(/[_\s]+/g, " ");

const findWorksheetName = (sheetNames: string[], preferredNames: string[]) => {
  return sheetNames.find((sheetName) => {
    const normalized = normalizeSheetName(sheetName);
    return preferredNames.some(
      (preferred) => normalized === preferred || normalized.includes(preferred),
    );
  });
};

export const useUpload = () => {
  const dispatch = useDispatch<AppDispatch>();
  const fileStatuses = useSelector(
    (state: RootState) => state.upload.fileStatuses,
  );
  const columnMappings = useSelector(
    (state: RootState) => state.upload.columnMappings,
  );

  const handleFileSelection = (files: File[], slotConfig: UploadSlot) => {
    const { id, allowedFormats, maxSizeInBytes, multiple, maxFiles } =
      slotConfig;

    if (multiple) {
      const currentCount = Object.keys(fileStatuses).filter((key) =>
        key.startsWith(`${id}--`),
      ).length;

      if (maxFiles && currentCount + files.length > maxFiles) {
        toast.error(`Maximum ${maxFiles} files allowed for ${slotConfig.name}`);
        return;
      }
    }

    files.forEach((file, index) => {
      // Create derived ID for multi-file slots, or use original for single
      const targetId = multiple ? `${id}--${Date.now()}-${index}` : id;

      if (file.size > maxSizeInBytes) {
        dispatch(
          setFileStatus({
            slotId: targetId,
            status: {
              status: "error",
              message: `File too large. Max allowed: ${maxSizeInBytes / (1024 * 1024)}MB`,
              fileName: file.name,
              fileSize: file.size,
            },
          }),
        );
        toast.error(`File too large for ${slotConfig.name}`);
        return;
      }

      const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
      const isAllowed = allowedFormats.some(
        (format) => format.toLowerCase() === fileExt,
      );

      if (!isAllowed) {
        dispatch(
          setFileStatus({
            slotId: targetId,
            status: {
              status: "error",
              message: `Invalid file type. Allowed: ${allowedFormats.join(", ")}`,
              fileName: file.name,
              fileSize: file.size,
            },
          }),
        );
        toast.error(`Invalid file type for ${slotConfig.name}`);
        return;
      }

      fileRegistryService.setFile(targetId, file);

      dispatch(
        setFileStatus({
          slotId: targetId,
          status: { status: "ready", fileName: file.name, fileSize: file.size },
        }),
      );

      if (slotConfig.bigQueryTableId) {
        void (async () => {
          try {
            const comparisonTableIds = [
              slotConfig.bigQueryTableId,
              ...(slotConfig.comparisonTableIds || []),
            ];

            for (let comparisonIndex = 0; comparisonIndex < comparisonTableIds.length; comparisonIndex += 1) {
              const tableId = comparisonTableIds[comparisonIndex];
              
              // Set status to mapping to show loader
              dispatch(
                setFileStatus({
                  slotId: targetId,
                  status: { 
                    status: "mapping", 
                    fileName: file.name, 
                    fileSize: file.size,
                    message: "Analyzing structure..." 
                  },
                }),
              );

              const {
                headers: uploadedColumns,
                columnSamples,
                sheetName,
                headerRowIndex,
              } = await extractHeaders(
                file,
                slotConfig,
                tableId,
              );
              console.info(
                `[Upload] Sending ${uploadedColumns.length} columns for ${slotConfig.name} (${tableId}).`,
                uploadedColumns,
              );
              const comparisonSlotId =
                comparisonIndex === 0 ? targetId : `${targetId}::${tableId}`;
              await dispatch(
                compareColumnMappingsThunk({
                  slotId: comparisonSlotId,
                  tableId,
                  uploadedColumns,
                  uploadedColumnSamples: columnSamples,
                  sheetName,
                  headerRowIndex,
                }),
              );
            }
            
            // Mapping is done, reset status to ready
            dispatch(
              setFileStatus({
                slotId: targetId,
                status: { status: "ready", fileName: file.name, fileSize: file.size },
              }),
            );
          } catch (error) {
            console.error(
              `[Upload] Header extraction failed for ${slotConfig.name} (${slotConfig.bigQueryTableId})`,
              error,
            );
            if (error instanceof MappingParentChildMissingError) {
              const comparisonTableIds = [
                slotConfig.bigQueryTableId,
                ...(slotConfig.comparisonTableIds || []),
              ];
              comparisonTableIds.forEach((tableId, idx) => {
                const slotId = idx === 0 ? targetId : `${targetId}::${tableId}`;
                dispatch(clearColumnMapping(slotId));
              });
              dispatch(removeFileStatus(targetId));
              void fileRegistryService.removeFile(targetId);
              toast.error(
                "Please upload a proper file with Parent and Child columns in the mapping sheet.",
              );
              return;
            }
            dispatch(
              setFileStatus({
                slotId: targetId,
                status: {
                  status: "error",
                  message: `Could not read column headers: ${(error as Error).message}`,
                  fileName: file.name,
                  fileSize: file.size,
                },
              }),
            );
            toast.error(`Could not read headers for ${slotConfig.name}`);
          }
        })();
      }
    });
  };

  const extractHeaders = async (
    file: File,
    slotConfig?: UploadSlot,
    tableId?: string,
  ): Promise<HeaderExtractionResult> => {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".csv") || file.type === "text/csv") {
      const text = await file.text();
      const parsedCsv = parseCsvRows(text);
      // All non-Working-File slots strictly use the first physical line as the
      // header. If line 1 is blank, return no headers (→ 0 matched columns).
      if (slotConfig?.bigQueryTableId && slotConfig.bigQueryTableId !== "working_file") {
        const firstRow =
          parsedCsv.rowNumbers[0] === 0 ? parsedCsv.rows[0] ?? [] : [];
        return {
          headers: finalizeColumnNames(firstRow),
          columnSamples: firstRow.length
            ? buildColumnSamples(parsedCsv.rows, 0)
            : [],
          headerRowIndex: 0,
        };
      }
      const selection = selectHeaderRow(parsedCsv.rows);
      if (!selection) {
        throw new Error("Could not find a usable header row in the CSV file.");
      }
          return {
            headers: finalizeColumnNames(selection.row),
            columnSamples: buildColumnSamples(parsedCsv.rows, selection.index),
            headerRowIndex: parsedCsv.rowNumbers[selection.index] ?? selection.index,
          };
    }

    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", bookFiles: true });
      return extractHeadersFromSheetJs(workbook, file, slotConfig, tableId);
    }

    throw new Error("Unsupported file format for header extraction");
  };

  const parseCsvRows = (text: string): WorksheetRowsResult => {
    const rows: string[][] = [];
    const rowNumbers: number[] = [];
    let currentRow: string[] = [];
    let currentCell = "";
    let inQuotes = false;
    let i = 0;
    let rowNumber = 0;

    const pushCell = () => {
      currentRow.push(currentCell.trim());
      currentCell = "";
    };

    const pushRow = () => {
      if (currentRow.length > 0) {
        rows.push(currentRow);
        rowNumbers.push(rowNumber);
      }
      currentRow = [];
      rowNumber += 1;
    };

    while (i < text.length) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i += 2;
          continue;
        }
        inQuotes = !inQuotes;
        i += 1;
        continue;
      }

      if (!inQuotes && char === ",") {
        pushCell();
        i += 1;
        continue;
      }

      if (!inQuotes && (char === "\n" || char === "\r")) {
        pushCell();
        pushRow();
        if (char === "\r" && nextChar === "\n") {
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }

      currentCell += char;
      i += 1;
    }

    pushCell();
    pushRow();

    const filteredRows: string[][] = [];
    const filteredRowNumbers: number[] = [];
    rows.forEach((row, index) => {
      if (row.some((value) => value !== "")) {
        filteredRows.push(row);
        filteredRowNumbers.push(rowNumbers[index] ?? index);
      }
    });

    return {
      rows: filteredRows,
      rowNumbers: filteredRowNumbers,
    };
  };

  const extractHeadersFromSheetJs = (
    workbook: XLSX.WorkBook,
    file: File,
    slotConfig?: UploadSlot,
    tableId?: string,
  ): HeaderExtractionResult => {
    const isWorkingFileSlot =
      slotConfig?.bigQueryTableId === "working_file" && tableId === "working_file";
    const isParentChildSlot =
      slotConfig?.bigQueryTableId === "working_file" && tableId === "parent_child";
    // Every slot other than the Working File (and its parent_child secondary
    // comparison) must read the header strictly from the first physical row.
    const isStrictFirstRowSlot = !isWorkingFileSlot && !isParentChildSlot;
    console.info(
      `[Upload] Workbook sheets for ${slotConfig?.name || file.name}: ${workbook.SheetNames.join(", ")}`,
    );
    const targetSheetName =
      (isWorkingFileSlot
        ? findWorksheetName(workbook.SheetNames, WORKING_FILE_SHEET_NAMES)
        : isParentChildSlot
          ? findWorksheetName(workbook.SheetNames, MAPPING_SHEET_NAMES)
          : undefined) || workbook.SheetNames[0];

    if (!targetSheetName) {
      return { headers: [], columnSamples: [], sheetName: workbook.SheetNames[0], headerRowIndex: -1 };
    }

    console.info(
      `[Upload] Selected sheet for ${slotConfig?.name || file.name}: "${targetSheetName}"`,
    );

    const sheet = workbook.Sheets[targetSheetName];
    const worksheetRows = readWorksheetRows(workbook, targetSheetName, sheet, 50);
    const normalizedRows = worksheetRows.rows;

    // Every non-Working-File slot strictly uses the FIRST physical row of the
    // sheet as the header — no scoring heuristic, no skipping blank rows. If
    // row 1 is empty (i.e. the real header sits on row 2+), we return no
    // headers so the comparison reports 0 matched columns instead of guessing
    // a lower row.
    if (isStrictFirstRowSlot) {
      const firstRow =
        worksheetRows.rowNumbers[0] === 0 ? normalizedRows[0] ?? [] : [];
      return {
        headers: finalizeColumnNames(firstRow),
        columnSamples: firstRow.length
          ? buildColumnSamples(normalizedRows, 0)
          : [],
        sheetName: targetSheetName,
        headerRowIndex: 0,
      };
    }

    const selection = selectHeaderRow(normalizedRows);

    if (!selection || selection.row.length === 0) {
      throw new Error(
        `Could not find a usable header row in the "${targetSheetName}" sheet for ${slotConfig?.name || "this slot"}.`,
      );
    }

    console.info(
      `[Upload] Header row selected for ${slotConfig?.name || file.name} from sheet "${targetSheetName}" with ${selection.row.length} columns.`,
      selection.row,
    );

    if (isWorkingFileSlot) {
      const resolvedRows = resolveWorkingFileHeaderRows(
        normalizedRows,
        selection.index,
      );
      // Use selection.index to determine leaf row, not a hardcoded row number
      // (the header detection already found the best candidate row)
      const leafRowIndex = selection.index;
      // Parent row: one row above the leaf row (which contains the actual section-name headers)
      // Row structure: [metadata] → [parent section names] → [leaf row with column names]
      const parentRowIndex = leafRowIndex >= 1 ? leafRowIndex - 1 : resolvedRows.parentRowIndex;
      const leafRow = normalizedRows[leafRowIndex] || selection.row;
      const parentRow =
        parentRowIndex !== undefined ? normalizedRows[parentRowIndex] || [] : [];

      // Log raw rows 0-2 with ALL columns for parent detection
      for (let rowIdx = 0; rowIdx < 3; rowIdx++) {
        const row = normalizedRows[rowIdx] || [];
        const filledCols = row
          .map((v, c) => (v ? `[${c}]="${v}"` : null))
          .filter(Boolean)
          .join(" | ");
        console.info(`[Upload] Row ${rowIdx} (excelRow=${worksheetRows.rowNumbers[rowIdx]}): ${filledCols || "(all empty)"}`);
      }
      console.info(`[Upload] Resolved: parentRowIndex=${parentRowIndex} (excelRow=${parentRowIndex !== undefined ? worksheetRows.rowNumbers[parentRowIndex] : "none"}), leafRowIndex=${leafRowIndex} (excelRow=${worksheetRows.rowNumbers[leafRowIndex] ?? "none"})`);

      // Build parent row from sheet !merges: captures section headers that live in a
      // different row from parentRowIndex (e.g. multi-row merged title cells).
      // Only record the START column of each merge — filling the full range would
      // let an oversized merge for one section bleed into and mask the next section.
const sheetRefForMerges = sheet["!ref"] || "A1";
const sheetColOffset = XLSX.utils.decode_range(sheetRefForMerges).s.c;

const sheetMerges: XLSX.Range[] =
  (sheet["!merges"] as XLSX.Range[] | undefined) ?? [];

console.info(`[Upload] Sheet merges count: ${sheetMerges.length}`);

const mergeStartRow: string[] = Array(leafRow.length).fill("");

for (const merge of sheetMerges) {
  // scan ALL rows of merge
  let mergeValue = "";

  for (let row = merge.s.r; row <= merge.e.r; row++) {
    const cell = sheet[
      XLSX.utils.encode_cell({
        r: row,
        c: merge.s.c,
      })
    ];

    const raw = String(cell?.w ?? cell?.v ?? "").trim();

    if (raw && shouldUseWorkingFileParent(raw)) {
      mergeValue = raw;
      break;
    }
  }

  if (!mergeValue) continue;

  // assign ONLY at merge start
  const startIndex = merge.s.c - sheetColOffset;

  if (startIndex >= 0 && startIndex < mergeStartRow.length) {
    mergeStartRow[startIndex] = mergeValue;
  }
}

console.info(
  "MERGE START ROW:",
  mergeStartRow.join(","),
);   
      console.info(`[Upload] mergeStartRow sample [8..30]: ${mergeStartRow.slice(8, 30).join(" | ")}`);

      // Actual non-forward-filled values from the parent row: these are the real
      // section-header cells (e.g. "Value Slab (1-31Mar)", "Early Bird").
      const rawParentActual: string[] = Array(leafRow.length).fill("");
      for (let i = 0; i < Math.min(parentRow.length, leafRow.length); i++) {
        const cell = String(parentRow[i] || "").trim();
        if (cell && shouldUseWorkingFileParent(cell)) rawParentActual[i] = cell;
      }

      // Scan ALL rows before the leaf row for valid section header cells.
      // This catches headers that live in a row other than pandasParentRowIndex,
      // or that are beyond parentRow.length in a sparse XML-parsed array.
      // Last-wins: the row closest to the leaf row takes precedence.
      const broadParentScan: string[] = Array(leafRow.length).fill("");
      for (let rowIdx = 0; rowIdx < leafRowIndex; rowIdx++) {
        const candidateRow = normalizedRows[rowIdx] || [];
        for (let colIdx = 0; colIdx < Math.min(candidateRow.length, leafRow.length); colIdx++) {
          const cell = String(candidateRow[colIdx] || "").trim();
          if (cell && shouldUseWorkingFileParent(cell)) {
            broadParentScan[colIdx] = cell;
          }
        }
      }

      console.info(
        "[Upload] broadParentScan (all rows scan):",
        broadParentScan.map((val, idx) => `[${idx}]=${val}`).filter(v => !v.endsWith("=")).join(" | "),
      );

      // Build effectiveParentRow by forward-filling from anchor points.
      // Priority: actual raw cell value > merge start > broad scan > carry-forward.
      // This correctly handles single-cell (non-merged) section headers AND
      // prevents an oversized merge from masking the following section.
      const effectiveParentRow: string[] = Array(leafRow.length).fill("");
      let effectiveCurrentParent = "";
      for (let i = 0; i < leafRow.length; i++) {
        const anchor = rawParentActual[i] || mergeStartRow[i] || broadParentScan[i];
        if (anchor) effectiveCurrentParent = anchor;
        effectiveParentRow[i] = effectiveCurrentParent;

        if (anchor) {
          console.info(
            `[Upload] Column ${i}: anchor="${anchor}" (from ${rawParentActual[i] ? "rawParentActual" : mergeStartRow[i] ? "mergeStartRow" : "broadParentScan"}), filled="${effectiveCurrentParent}"`,
          );
        }
      }
      let workingFileHeaders = effectiveParentRow.some((v) => v !== "")
        ? buildHierarchicalColumnNames(effectiveParentRow, leafRow, 1)
        : finalizeColumnNamesWithOffset(leafRow, 1);

      // Strip leading empty columns (blank first cell in the Excel leaf row)
      const firstNonEmpty = workingFileHeaders.findIndex((c) => c !== "");
      if (firstNonEmpty > 0) {
        workingFileHeaders = workingFileHeaders.slice(firstNonEmpty);
      }

      console.info(
        `[Upload] Working File header rows: parent=${worksheetRows.rowNumbers[parentRowIndex ?? -1] ?? "none"}, leaf=${worksheetRows.rowNumbers[leafRowIndex] ?? leafRowIndex}.`,
      );
      console.info(
        "[Upload] Working File header preview.",
        {
          rawParent: parentRow.slice(8, 30),
          parent: effectiveParentRow.slice(8, 30),
          leaf: leafRow.slice(8, 30),
          merged: workingFileHeaders.slice(8, 30),
        },
      );
      console.info(
        "[Upload] Working File merged header preview:",
        workingFileHeaders.slice(8, 30).join(", "),
      );
      console.info(
        `[Upload] Working File ALL columns (${workingFileHeaders.length} total):`,
        workingFileHeaders.map((col, i) => `[${i}] ${col}`).join("\n"),
      );

      return {
        headers: workingFileHeaders,
        columnSamples: buildColumnSamples(normalizedRows, leafRowIndex),
        sheetName: targetSheetName,
        headerRowIndex: worksheetRows.rowNumbers[leafRowIndex] ?? leafRowIndex,
      };
    }

    if (isParentChildSlot) {
      const lowerHeaders = selection.row.map((cell) => cell.toLowerCase());
      const hasParent = lowerHeaders.some((cell) => cell.includes("parent"));
      const hasChild = lowerHeaders.some((cell) => cell.includes("child"));
      if (!hasParent || !hasChild) {
        throw new MappingParentChildMissingError(
          `Mapping sheet "${targetSheetName}" must contain Parent and Child columns.`,
        );
      }
      return {
        headers: finalizeColumnNames(selection.row),
        columnSamples: buildColumnSamples(normalizedRows, selection.index),
        sheetName: targetSheetName,
        headerRowIndex: worksheetRows.rowNumbers[selection.index] ?? selection.index,
      };
    }

    return {
      headers: finalizeColumnNames(selection.row),
      columnSamples: buildColumnSamples(normalizedRows, selection.index),
      sheetName: targetSheetName,
      headerRowIndex: worksheetRows.rowNumbers[selection.index] ?? selection.index,
    };
  };

  const selectHeaderRow = (
    normalizedRows: string[][],
  ): { row: string[]; index: number } | undefined => {
    const headerTokens = new Set([
      "code",
      "name",
      "type",
      "date",
      "amount",
      "value",
      "region",
      "zone",
      "state",
      "city",
      "town",
      "dealer",
      "firm",
      "customer",
      "client",
      "party",
      "product",
      "sku",
      "item",
      "qty",
      "quantity",
      "rate",
      "price",
      "id",
      "number",
      "no",
      "status",
      "month",
      "year",
      "day",
      "franchise",
      "scheme",
      "branch",
      "district",
      "area",
      "category",
      "description",
      "reference",
    ]);

    const classifyCell = (cell: string) => {
      const value = cell.trim();
      if (!value) return "blank";

      const hasLetter = /[A-Za-z]/.test(value);
      const hasDigit = /\d/.test(value);
      const isNumericLike = /^[-+]?[\d,.%]+$/.test(value);
      const hasCodeLikeChars = /[+/()_-]/.test(value);

      if (isNumericLike && !hasLetter) return "numeric";
      if (hasDigit && hasLetter) return "mixed";
      if (hasCodeLikeChars && hasDigit) return "mixed";
      if (hasLetter) return "text";
      return "other";
    };

    const profileRow = (row: string[]) => {
      const values = row.map((cell) => cell.trim());
      const filled = values.filter(Boolean);
      const kinds = filled.map(classifyCell);
      const total = filled.length;
      const textCount = kinds.filter((kind) => kind === "text").length;
      const mixedCount = kinds.filter((kind) => kind === "mixed").length;
      const numericCount = kinds.filter((kind) => kind === "numeric").length;
      const otherCount = kinds.filter((kind) => kind === "other").length;
      const uniqueCount = new Set(filled.map((cell) => cell.toLowerCase())).size;
      const avgLength =
        total > 0 ? filled.reduce((sum, cell) => sum + cell.length, 0) / total : 0;
      const headerTokenCount = filled.reduce((sum, cell) => {
        const tokens = cell.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);
        return sum + tokens.filter((token) => headerTokens.has(token)).length;
      }, 0);
      const alphaOnlyCount = kinds.filter((kind) => kind === "text").length;

      return {
        row: values,
        filled,
        kinds,
        total,
        textCount,
        mixedCount,
        numericCount,
        otherCount,
        uniqueCount,
        avgLength,
        headerTokenCount,
        alphaOnlyCount,
      };
    };

    return normalizedRows
      .slice(0, 30)
      .reduce<{ row: string[]; index: number; score: number } | null>(
        (best, row, index, sourceRows) => {
          const current = profileRow(row);
          if (current.total < 2) {
            return best;
          }

          const nextRows = sourceRows
            .slice(index + 1, index + 4)
            .map(profileRow)
            .filter((candidate) => candidate.total >= 2);

          let transitionScore = 0;
          let comparisons = 0;

          nextRows.forEach((candidate) => {
            const maxColumns = Math.max(current.row.length, candidate.row.length);
            for (let colIndex = 0; colIndex < maxColumns; colIndex += 1) {
              const currentCell = (current.row[colIndex] || "").trim();
              const nextCell = (candidate.row[colIndex] || "").trim();
              if (!currentCell) {
                continue;
              }

              const currentKind = classifyCell(currentCell);
              const nextKind = classifyCell(nextCell);

              if (currentKind === "text" && (nextKind === "numeric" || nextKind === "mixed" || nextKind === "blank")) {
                transitionScore += 2;
              } else if (currentKind === "text" && nextKind === "text") {
                transitionScore += 0.2;
              } else if (currentKind === "mixed" && (nextKind === "numeric" || nextKind === "blank")) {
                transitionScore += 0.5;
              } else if (currentKind === "numeric" && nextKind === "text") {
                transitionScore -= 1.5;
              }

              comparisons += 1;
            }
          });

          const normalizedTransition =
            comparisons > 0 ? transitionScore / comparisons : 0;

          const densityScore = Math.min(current.total, 8) * 0.75;
          const labelScore =
            current.textCount * 5 +
            current.mixedCount * 1 +
            current.headerTokenCount * 3 +
            current.uniqueCount * 0.4;
          const penalty =
            current.numericCount * 8 +
            current.otherCount * 1.5 +
            Math.max(0, current.avgLength - 24) * 0.35;
          const positionBias = Math.max(0, 24 - index) * 0.2;
          const continuityPenalty =
            nextRows.length > 0
              ? nextRows.reduce((sum, candidate) => {
                  const maxColumns = Math.max(current.row.length, candidate.row.length);
                  let sameKindCount = 0;
                  let overlapCount = 0;
                  for (let colIndex = 0; colIndex < maxColumns; colIndex += 1) {
                    const currentCell = (current.row[colIndex] || "").trim();
                    const nextCell = (candidate.row[colIndex] || "").trim();
                    if (!currentCell || !nextCell) continue;
                    overlapCount += 1;
                    if (classifyCell(currentCell) === classifyCell(nextCell)) {
                      sameKindCount += 1;
                    }
                  }
                  return sum + (overlapCount > 0 ? sameKindCount / overlapCount : 0);
                }, 0) / nextRows.length
              : 0;

          const score =
            labelScore +
            densityScore +
            normalizedTransition * 8 +
            positionBias -
            penalty -
            continuityPenalty * 6;

          if (!best || score > best.score) {
            return { row: current.row, index, score };
          }

          return best;
        },
        null,
      ) || undefined;
  };

  const buildColumnSamples = (
    rows: string[][],
    headerRowIndex: number,
    maxSamples = 3,
  ): string[][] => {
    if (headerRowIndex < 0) {
      return [];
    }

    const headerRow = rows[headerRowIndex] || [];
    return headerRow.map((_, columnIndex) => {
      const samples: string[] = [];
      for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
        const value = String(rows[rowIndex]?.[columnIndex] ?? "").trim();
        if (value) {
          samples.push(value);
        }
        if (samples.length >= maxSamples) {
          break;
        }
      }
      return samples;
    });
  };

  const shouldUseWorkingFileParent = (value: string): boolean => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    // Reject purely numeric values (section numbers like "2", "3.0" embedded in the sheet)
    if (/^\d+(\.\d+)?$/.test(normalized)) {
      return false;
    }

    // Reject metadata/title rows: values starting with or containing patterns like "scheme working", "march", "file"
    // These appear in row 0-1 but are NOT real parent section headers
    const metadataPatterns = [
      /^scheme\s+working/i,  // "Scheme Working ..." at the very start
      /^march/i,              // "March..." - temporal metadata
      /^file\s*$/i,           // "File" alone or with whitespace
      /^header/i,             // "Header..."
      /^data\s*$/i,           // "Data" alone
      /^title/i,              // "Title..."
    ];
    if (metadataPatterns.some(pattern => pattern.test(normalized))) {
      return false;
    }

    // Reject known column header names (these shouldn't be parent headers)
    const ignoredParentCells = new Set([
      "zone",
      "region",
      "depot",
      "depot code",
      "parent code",
      "customer name",
      "gsr",
      "slabs",
      "od y/n",
    ]);

    return !ignoredParentCells.has(normalized);
  };

  const readWorksheetRows = (
    workbook: XLSX.WorkBook,
    targetSheetName: string,
    sheet: XLSX.WorkSheet,
    maxRows = 50,
  ): WorksheetRowsResult => {
    const ref = sheet["!ref"] || sheet["!fullref"];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      const rows: string[][] = [];
      const rowNumbers: number[] = [];
      const endRow = Math.min(range.e.r, range.s.r + maxRows - 1);

      for (let rowIndex = range.s.r; rowIndex <= endRow; rowIndex += 1) {
        const values: string[] = Array(range.e.c - range.s.c + 1).fill("");
        for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
          const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
          const cell = sheet[cellAddress];
          const rawValue = cell?.w ?? cell?.v ?? "";
          const value = String(rawValue).trim();
          if (value) {
            values[colIndex - range.s.c] = value;
          }
        }

        if (values.some((value) => value)) {
          rows.push(values);
          rowNumbers.push(rowIndex);
        }
      }

      console.info(
        `[Upload] Read ${rows.length} populated rows from sheet with range ${ref}.`,
      );

      return { rows, rowNumbers };
    }

    console.warn("[Upload] Worksheet has no !ref or !fullref range. Falling back to raw XML parsing.");
    return readRowsFromRawSheetXml(workbook, targetSheetName, sheet, maxRows);
  };

  const readRowsFromRawSheetXml = (
    workbook: XLSX.WorkBook,
    targetSheetName: string,
    sheet: XLSX.WorkSheet,
    maxRows = 50,
  ): WorksheetRowsResult => {
    const rawWorkbook = workbook as any;
    const sheetIndex = workbook.SheetNames.indexOf(targetSheetName);
    const sheetMeta = rawWorkbook.Workbook?.Sheets?.[sheetIndex];
    const rawFileMap = (rawWorkbook.files || {}) as Record<string, RawXlsxFileEntry>;
    const resolvedSheetPath = resolveWorksheetXmlPath(rawFileMap, targetSheetName);
    const candidatePaths = [
      resolvedSheetPath,
      `xl/worksheets/sheet${sheetIndex + 1}.xml`,
      sheetMeta?.sheetId ? `xl/worksheets/sheet${sheetMeta.sheetId}.xml` : "",
    ].filter((path): path is string => Boolean(path));

    const rawFileEntry = candidatePaths
      .map((path) => rawFileMap[path])
      .find(Boolean);

    if (!rawFileEntry?.content) {
      console.warn(
        `[Upload] Raw worksheet XML not found for "${targetSheetName}". Candidates: ${candidatePaths.join(", ")}. Available files: ${Object.keys(rawFileMap).filter((key) => key.includes("xl/worksheets")).join(", ")}`,
      );
      return { rows: [], rowNumbers: [] };
    }

    const rawSheetPath =
      candidatePaths.find((path) => rawFileMap[path]?.content) || "unknown";
    console.info(
      `[Upload] Raw XML path for "${targetSheetName}": ${rawSheetPath}`,
    );
    console.info(
      `[Upload] Raw XML byte length for "${targetSheetName}": ${rawFileEntry.content?.length || 0}`,
    );

    const sharedStrings = Array.isArray(rawWorkbook.Strings)
      ? rawWorkbook.Strings.map((item: any) => String(item?.t ?? item?.v ?? ""))
      : [];

    const rowsResult = applyMergedCellValues(
      extractRowsFromXmlBytes(rawFileEntry.content, sharedStrings, maxRows),
      [
        ...(sheet["!merges"] || []),
        ...extractMergeRangesFromXmlBytes(rawFileEntry.content),
      ],
    );
    console.info(
      `[Upload] Read ${rowsResult.rows.length} populated rows from raw XML for sheet "${targetSheetName}".`,
    );

    return rowsResult;
  };

  const extractMergeRangesFromXmlBytes = (xmlBytes: Uint8Array): XLSX.Range[] => {
    const decoder = new TextDecoder("utf-8");
    const chunkSize = 1024 * 1024;
    const overlapSize = 256;
    const ranges: XLSX.Range[] = [];
    let tail = "";

    for (let byteOffset = 0; byteOffset < xmlBytes.length; byteOffset += chunkSize) {
      const nextOffset = Math.min(xmlBytes.length, byteOffset + chunkSize);
      const chunkText =
        tail +
        decoder.decode(xmlBytes.slice(byteOffset, nextOffset), {
          stream: nextOffset < xmlBytes.length,
        });
      const mergeRegex = /<mergeCell\b[^>]*\bref=(?:"([^"]+)"|'([^']+)')[^>]*\/?>/gi;
      let match: RegExpExecArray | null;

      while ((match = mergeRegex.exec(chunkText)) !== null) {
        const ref = match[1] || match[2];
        if (!ref) {
          continue;
        }

        try {
          ranges.push(XLSX.utils.decode_range(ref));
        } catch {
          // Ignore malformed merge refs from unusual workbook producers.
        }
      }

      tail = chunkText.slice(-overlapSize);
    }

    console.info(`[Upload] Parsed ${ranges.length} merge ranges from worksheet XML.`);
    return ranges;
  };

  const applyMergedCellValues = (
    result: WorksheetRowsResult,
    merges: XLSX.Range[],
  ): WorksheetRowsResult => {
    if (!merges.length) {
      return result;
    }

    const rowPositionByNumber = new Map<number, number>();
    result.rowNumbers.forEach((rowNumber, index) => {
      rowPositionByNumber.set(rowNumber, index);
    });

    const rows = result.rows.map((row) => [...row]);
    let appliedMergeCount = 0;
    merges.forEach((merge) => {
      if (merge.s.r !== merge.e.r) {
        return;
      }

      const rowIndex = rowPositionByNumber.get(merge.s.r);
      if (rowIndex === undefined) {
        return;
      }

      const row = rows[rowIndex];
      const mergeValue = String(row[merge.s.c] || "").trim();
      if (!mergeValue) {
        return;
      }

      for (let colIndex = merge.s.c + 1; colIndex <= merge.e.c; colIndex += 1) {
        if (!String(row[colIndex] || "").trim()) {
          row[colIndex] = mergeValue;
        }
      }
      appliedMergeCount += 1;
    });

    console.info(`[Upload] Applied ${appliedMergeCount} horizontal merge ranges to parsed worksheet rows.`);

    return {
      rows,
      rowNumbers: result.rowNumbers,
    };
  };

  const resolveWorksheetXmlPath = (
    rawFileMap: Record<string, RawXlsxFileEntry>,
    targetSheetName: string,
  ): string | undefined => {
    const workbookXml = readRawFileText(rawFileMap, "xl/workbook.xml");
    const workbookRelsXml = readRawFileText(rawFileMap, "xl/_rels/workbook.xml.rels");
    if (!workbookXml || !workbookRelsXml) {
      return undefined;
    }

    const relationships = new Map<string, string>();
    const relationshipRegex = /<Relationship\b([^>]*)\/?>/gi;
    let relationshipMatch: RegExpExecArray | null;
    while ((relationshipMatch = relationshipRegex.exec(workbookRelsXml)) !== null) {
      const attributes = parseXmlAttributes(relationshipMatch[1] || "");
      const id = attributes.Id || attributes.id;
      const target = attributes.Target;
      if (id && target) {
        relationships.set(id, normalizeWorksheetTargetPath(target));
      }
    }

    const normalizedTargetSheetName = normalizeSheetName(targetSheetName);
    const sheetRegex = /<sheet\b([^>]*)\/?>/gi;
    let sheetMatch: RegExpExecArray | null;
    while ((sheetMatch = sheetRegex.exec(workbookXml)) !== null) {
      const attributes = parseXmlAttributes(sheetMatch[1] || "");
      const relationshipId = attributes["r:id"] || attributes.id;
      if (
        relationshipId &&
        normalizeSheetName(attributes.name || "") === normalizedTargetSheetName
      ) {
        return relationships.get(relationshipId);
      }
    }

    return undefined;
  };

  const readRawFileText = (
    rawFileMap: Record<string, RawXlsxFileEntry>,
    path: string,
  ): string => {
    const content = rawFileMap[path]?.content;
    return content ? new TextDecoder("utf-8").decode(content) : "";
  };

  const normalizeWorksheetTargetPath = (target: string): string => {
    const withoutLeadingSlash = target.replace(/^\/+/, "");
    if (withoutLeadingSlash.startsWith("xl/")) {
      return withoutLeadingSlash;
    }
    return `xl/${withoutLeadingSlash}`.replace(/\/xl\/\.\.\//g, "/");
  };

  const normalizeSheetName = (name: string): string =>
    name.trim().toLowerCase().replace(/[_\s]+/g, " ");

  const parseXmlAttributes = (attributesText: string): Record<string, string> => {
    const attributes: Record<string, string> = {};
    const attributeRegex = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match: RegExpExecArray | null;
    while ((match = attributeRegex.exec(attributesText)) !== null) {
      attributes[match[1]] = decodeXmlEntities(match[2] ?? match[3] ?? "");
    }
    return attributes;
  };

  const extractRowsFromXmlBytes = (
    xmlBytes: Uint8Array,
    sharedStrings: string[],
    maxRows = 50,
  ): WorksheetRowsResult => {
    const rows: string[][] = [];
    const rowNumbers: number[] = [];
    const decoder = new TextDecoder("utf-8");
    const chunkSize = 1024 * 1024;
    let xmlBuffer = "";
    let byteOffset = 0;

    while (byteOffset < xmlBytes.length && rows.length < maxRows) {
      const nextOffset = Math.min(xmlBytes.length, byteOffset + chunkSize);
      xmlBuffer += decoder.decode(xmlBytes.slice(byteOffset, nextOffset), {
        stream: nextOffset < xmlBytes.length,
      });
      byteOffset = nextOffset;

      let rowEndIndex = findRowEndIndex(xmlBuffer);
      while (rowEndIndex >= 0 && rows.length < maxRows) {
        const rowStartIndex = xmlBuffer.search(/<(?:[A-Za-z0-9_]+:)?row\b/i);
        if (rowStartIndex < 0 || rowStartIndex > rowEndIndex) {
          xmlBuffer = xmlBuffer.slice(rowEndIndex + 1);
          rowEndIndex = findRowEndIndex(xmlBuffer);
          continue;
        }

        const rowXml = xmlBuffer.slice(rowStartIndex, rowEndIndex + 1);
        const row = extractRowFromXml(rowXml, sharedStrings);
        if (row.values.some((value) => value)) {
          rows.push(row.values);
          rowNumbers.push(row.rowNumber);
        }

        xmlBuffer = xmlBuffer.slice(rowEndIndex + 1);
        rowEndIndex = findRowEndIndex(xmlBuffer);
      }

      if (xmlBuffer.length > chunkSize * 4) {
        const rowStartIndex = xmlBuffer.search(/<(?:[A-Za-z0-9_]+:)?row\b/i);
        xmlBuffer = rowStartIndex >= 0 ? xmlBuffer.slice(rowStartIndex) : "";
      }
    }

    console.info(
      `[Upload] Streaming XML fallback extracted ${rows.length} populated rows from worksheet XML.`,
    );

    return { rows, rowNumbers };
  };

  const findRowEndIndex = (xmlText: string): number => {
    const closingMatch = /<\/(?:[A-Za-z0-9_]+:)?row>/i.exec(xmlText);
    const selfClosingMatch = /<(?:[A-Za-z0-9_]+:)?row\b[^>]*\/>/i.exec(xmlText);
    const earliestMatch = [closingMatch, selfClosingMatch]
      .filter((match): match is RegExpExecArray => Boolean(match))
      .sort((left, right) => left.index - right.index)[0];

    if (earliestMatch) {
      return earliestMatch.index + earliestMatch[0].length - 1;
    }

    return -1;
  };

  const extractRowFromXml = (
    rowXml: string,
    sharedStrings: string[],
  ): { values: string[]; rowNumber: number } => {
    const values: string[] = [];
    const rowAttributes = parseXmlAttributes(
      rowXml.match(/<(?:[A-Za-z0-9_]+:)?row\b([^>]*)/i)?.[1] || "",
    );
    const rowNumber = Math.max(0, Number(rowAttributes.r || "1") - 1);
    // Match either self-closing cells <c attrs/> OR cells with content <c attrs>...</c>
    // The attributes capture is non-greedy and stops at the first `/` or `>` to avoid
    // swallowing subsequent self-closing cells into a single match.
    const cellRegex = /<(?:[A-Za-z0-9_]+:)?c\b([^>/]*)(?:\/>|>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?c>)/gi;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
      const cellAttributes = parseXmlAttributes(cellMatch[1] || "");
      const cellInnerXml = cellMatch[2] || "";
      const cellType = cellAttributes.t || "";
      const cellIndex = cellAttributes.r ? XLSX.utils.decode_cell(cellAttributes.r).c : values.length;

      let value = "";
      if (cellType === "inlineStr" || cellType === "str") {
        value = extractTextNodes(cellInnerXml);
      } else if (cellType === "s") {
        const sharedMatch = cellInnerXml.match(/<(?:[A-Za-z0-9_]+:)?v[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?v>/i);
        const sharedIndex = Number(sharedMatch?.[1] || "");
        value = sharedStrings[sharedIndex] || "";
      } else {
        const valueMatch = cellInnerXml.match(/<(?:[A-Za-z0-9_]+:)?v[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?v>/i);
        value = valueMatch?.[1] || extractTextNodes(cellInnerXml);
      }

      const normalized = decodeXmlEntities(String(value)).trim();
      if (normalized) {
        values[cellIndex] = normalized;
      }
    }

    return {
      values: Array.from({ length: values.length }, (_, index) => values[index] || ""),
      rowNumber,
    };
  };

  const extractTextNodes = (xmlText: string): string =>
    Array.from(xmlText.matchAll(/<(?:[A-Za-z0-9_]+:)?t[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?t>/gi))
      .map((match) => match[1] || "")
      .join("");

  const decodeXmlEntities = (value: string): string =>
    value
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
        String.fromCharCode(Number.parseInt(code, 16)),
      );

  const uploadFile = async (
    file: File,
    slotConfig: UploadSlot,
    moduleType?: "revised" | "normal",
    showToast: boolean = true,
  ) => {
    const resultAction = await dispatch(
      uploadFileThunk({ file, slotConfig, moduleType }),
    );
    if (uploadFileThunk.fulfilled.match(resultAction)) {
      if (showToast) {
        toast.success(
          `Successful: ${file.name} uploaded to ${slotConfig.name}`,
        );
      }
      return true;
    } else {
      toast.error(`Upload failed for ${slotConfig.name}`);
      return false;
    }
  };

  const retryUpload = (slotId: string) => {
    fileRegistryService.removeFile(slotId);
    dispatch(removeFileStatus(slotId));
    dispatch(clearColumnMapping(slotId));
  };

  const reupload = (slotId: string) => {
    fileRegistryService.removeFile(slotId);
    dispatch(removeFileStatus(slotId));
    dispatch(clearColumnMapping(slotId));
  };

  const resetToReady = (slotId: string) => {
    dispatch(resetFileStatus(slotId));
  };

  const compareColumnMappings = async (
    slotId: string,
    tableId: string,
    uploadedColumns: string[],
    uploadedColumnSamples: string[][] = [],
    sheetName?: string,
    headerRowIndex: number = -1,
  ) => {
    return dispatch(
      compareColumnMappingsThunk({
        slotId,
        tableId,
        uploadedColumns,
        uploadedColumnSamples,
        sheetName,
        headerRowIndex,
      }),
    );
  };

  const setMappingDecision = (
    slotId: string,
    decision: "auto_map" | "rename_uploaded_column" | "rename_stored_column" | "manual_review",
  ) => {
    dispatch(setColumnMappingDecision({ slotId, decision }));
  };

  const clearMapping = (slotId: string) => {
    dispatch(clearColumnMapping(slotId));
  };

  return {
    fileStatuses,
    columnMappings,
    handleFileSelection,
    uploadFile,
    retryUpload,
    reupload,
    resetToReady,
    compareColumnMappings,
    setMappingDecision,
    clearMapping,
    setAppliedRenames,
  };
};
