import React, { useState } from "react";
import {
    Card,
    CardContent,
    CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { schemeAutomationSlots, clientSectionSlots, type UploadSlot } from "../../config/upload-slots";
import { useUpload } from "../uploadHooks";
import type { FileStatus } from "../uploadTypes";
import { toast } from "sonner";
import {
    FileText,
    Upload as UploadIcon,
    X,
    RotateCcw,
    RefreshCw,
    PackageOpen,
    PackageCheck,
    PackageX,
    Package,
    Truck,
    PackagePlus,
    Play,
    Loader2,
    Plus,
    Minus,
    Check,
    ChevronDown,
} from "lucide-react";
import { AdjustmentModal } from "./AdjustmentModal";
import { uploadFileToApi } from "../uploadApi";
import { cn } from "@/lib/utils";
import { ProcessModal } from "./ProcessingModal";
import { ProcessRunningModal, type ProcessResult } from "./ProcessRunningModal";
import { fileRegistryService } from "../fileRegistry";
import { UploadMobile } from "./UploadMobile";
import { getApiBaseUrl } from "../../config/api-config";
import * as XLSX from "xlsx";

const parseCsvRows = (text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = "";
    let inQuotes = false;
    let i = 0;

    const pushCell = () => {
        currentRow.push(currentCell);
        currentCell = "";
    };

    const pushRow = () => {
        rows.push(currentRow);
        currentRow = [];
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

    return rows.filter((row) => row.some((value) => String(value || "").trim() !== ""));
};

const stringifyCsvRows = (rows: string[][]) =>
    rows
        .map((row) =>
            row
                .map((cell) => {
                    const value = String(cell ?? "");
                    if (/[",\n\r]/.test(value)) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                })
                .join(","),
        )
        .join("\n");

const SearchableSelect = ({ 
    value, 
    options, 
    onChange, 
    originalName 
}: { 
    value: string; 
    options: string[]; 
    onChange: (val: string) => void; 
    originalName: string; 
}) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredOptions = options.filter(opt => 
        opt.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="relative" ref={containerRef}>
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-full h-11 pl-4 pr-10 rounded-xl border bg-white text-sm font-medium text-slate-700 flex items-center cursor-pointer shadow-sm transition-all hover:border-blue-300",
                    isOpen ? "border-blue-500 ring-2 ring-blue-500/10" : "border-blue-200"
                )}
            >
                <span className="truncate">
                    {value === originalName ? `${value} (Original)` : value}
                </span>
                <div className="absolute right-4 text-blue-500">
                    <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", isOpen && "rotate-180")} />
                </div>
            </div>
            
            {isOpen && (
                <div className="absolute z-[100] mt-2 w-full bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                        <div className="relative">
                            <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 rotate-45" />
                            <input 
                                autoFocus
                                placeholder="Search stored columns..."
                                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
                        <div 
                            onClick={() => { onChange(originalName); setIsOpen(false); setSearch(""); }}
                            className={cn(
                                "px-3 py-2.5 text-sm rounded-lg cursor-pointer transition-colors flex items-center justify-between group",
                                value === originalName ? "bg-blue-50 text-blue-700 font-semibold" : "hover:bg-slate-50 text-slate-600"
                            )}
                        >
                            <span>{originalName} <span className="text-[10px] opacity-60 ml-1 font-normal">(Original)</span></span>
                            {value === originalName && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <div className="h-px bg-slate-100 my-1" />
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(opt => (
                                <div 
                                    key={opt}
                                    onClick={() => { onChange(opt); setIsOpen(false); setSearch(""); }}
                                    className={cn(
                                        "px-3 py-2.5 text-sm rounded-lg cursor-pointer transition-colors flex items-center justify-between group",
                                        value === opt ? "bg-blue-50 text-blue-700 font-semibold" : "hover:bg-slate-50 text-slate-600"
                                    )}
                                >
                                    <span className="truncate">{opt}</span>
                                    {value === opt && <Check className="w-3.5 h-3.5" />}
                                </div>
                            ))
                        ) : (
                            <div className="px-3 py-8 text-center text-xs text-slate-400 italic">
                                No matching columns found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};


export const Upload = () => {
    const { fileStatuses, columnMappings, handleFileSelection, uploadFile, retryUpload, resetToReady, clearMapping, setAppliedRenames } =
        useUpload();
    const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [processingFiles, setProcessingFiles] = useState<{ slot: UploadSlot; file: File }[]>([]);
    const [dragActive, setDragActive] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'scheme' | 'client'>('client');
    const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
    const [visibleSlotsCount, setVisibleSlotsCount] = useState<Record<string, number>>({});
    const [runningModuleType, setRunningModuleType] = useState<"normal" | "revised" | null>(null);
    const [processResult, setProcessResult] = useState<ProcessResult>(null);
    const [activeMappingRow, setActiveMappingRow] = useState<string | null>(null);
    const [renameDrafts, setRenameDrafts] = useState<Record<string, Record<number, { uploadedName: string; storedName: string }>>>({});
    // Per-mapping drafts of "null{N} -> stored column" picks shown in the
    // Unmatched section when no uploaded columns were detected (e.g. row 1 of
    // the sheet was blank). Local-only UI state; not sent to the backend.
    // Keyed by mappingKey, then by null-index (0-based for null1, null2, ...).
    const [nullMappingDrafts, setNullMappingDrafts] = useState<Record<string, Record<number, string>>>({});
    const serverConfirmedRunning = React.useRef<boolean>(false);
    const mappingKeySeparator = "::";

    const currentSlots = activeTab === 'scheme' ? schemeAutomationSlots : clientSectionSlots;

    React.useEffect(() => {
        if (!activeMappingRow) return;

        const mapping = columnMappings[activeMappingRow];
        if (!mapping || mapping.status !== "ready") return;

        setRenameDrafts((current) => {
            if (current[activeMappingRow]) return current;

            const items = getUploadedColumnItems(mapping).filter((item) => item.status !== "matched");
            const appliedRenames = new Map(
                (mapping.appliedRenames || []).map((entry) => [entry.originalUploadedColumn, entry.renamedColumn]),
            );

            return {
                ...current,
                [activeMappingRow]: Object.fromEntries(
                    items.map((item) => [
                        item.originalIndex,
                        {
                            uploadedName: appliedRenames.get(item.column) || item.column,
                            storedName: item.column,
                        },
                    ]),
                ),
            };
        });
    }, [activeMappingRow, columnMappings]);

    const updateRenameDraft = (
        rowKey: string,
        index: number,
        field: "uploadedName" | "storedName",
        value: string,
    ) => {
        setRenameDrafts((current) => ({
            ...current,
            [rowKey]: {
                ...(current[rowKey] || {}),
                [index]: {
                    uploadedName:
                        field === "uploadedName"
                            ? value
                            : current[rowKey]?.[index]?.uploadedName || "",
                    storedName:
                        field === "storedName"
                            ? value
                            : current[rowKey]?.[index]?.storedName || "",
                },
            },
        }));
    };

    const buildRenamePayload = (mappingKey: string) => {
        const mapping = columnMappings[mappingKey];
        if (!mapping) return [];

        const draftEntries = renameDrafts[mappingKey] || {};
        const uploadedItems = getUploadedColumnItems(mapping);
        return uploadedItems
            .map((item) => {
                const draft = draftEntries[item.originalIndex];
                const renamedColumn = draft?.uploadedName?.trim() || item.column;
                return {
                    originalUploadedColumn: item.column,
                    renamedColumn,
                    storedColumn:
                        mapping.renamedPairs.find((pair) => pair.uploadedColumn === item.column)?.storedColumn ||
                        mapping.exactMatches.find((pair) => pair.uploadedColumn === item.column)?.storedColumn ||
                        undefined,
                };
            })
            .filter((entry) => entry.renamedColumn && entry.renamedColumn !== entry.originalUploadedColumn);
    };

    const areRenamePayloadsEqual = (
        left: ReturnType<typeof buildRenamePayload>,
        right: NonNullable<(typeof columnMappings)[string]["appliedRenames"]>,
    ) => {
        if (left.length !== right.length) return false;

        const normalize = (items: Array<{
            originalUploadedColumn: string;
            renamedColumn: string;
            storedColumn?: string;
        }>) =>
            items
                .map((item) => [
                    item.originalUploadedColumn,
                    item.renamedColumn,
                    item.storedColumn || "",
                ].join("\u0000"))
                .sort();

        const normalizedLeft = normalize(left);
        const normalizedRight = normalize(right);
        return normalizedLeft.every((value, index) => value === normalizedRight[index]);
    };

    const persistRenameDrafts = async (mappingKey: string) => {
        const mapping = columnMappings[mappingKey];
        if (!mapping) return;

        const payload = buildRenamePayload(mappingKey);

        if (payload.length === 0) {
            return;
        }

        if (areRenamePayloadsEqual(payload, mapping.appliedRenames || [])) {
            return;
        }

        const draftEntries = renameDrafts[mappingKey] || {};
        const uploadedItems = getUploadedColumnItems(mapping);

        const rowKey = getBaseRowKey(mappingKey) || mappingKey;
        const uploadSlotId = rowKey.split("--")[0];
        const sourceSlot = currentSlots.find((slot) => slot.id === uploadSlotId);
        const sourceFile =
            (await fileRegistryService.getFileAsync(rowKey)) ||
            (await fileRegistryService.getFileAsync(mappingKey)) ||
            (await fileRegistryService.getFileAsync(`${rowKey}--0`));

        if (!sourceSlot || !sourceFile) {
            console.warn("[Rename] Unable to resolve workbook file", {
                mappingKey,
                rowKey,
                uploadSlotId,
                availableSlots: currentSlots.map((slot) => slot.id),
                knownFileStatuses: Object.keys(fileStatuses).filter((key) => key.startsWith(rowKey)),
            });
            throw new Error("Could not find the uploaded Excel file to update.");
        }

        if (!sourceFile.name.toLowerCase().endsWith(".xlsx") && !sourceFile.name.toLowerCase().endsWith(".xls")) {
            if (!sourceFile.name.toLowerCase().endsWith(".csv") && sourceFile.type !== "text/csv") {
                throw new Error("Column rename is only supported for Excel or CSV files.");
            }
        }

        if (mapping.headerRowIndex === undefined) {
            throw new Error("Rename metadata is missing for this upload. Please re-upload the file and try again.");
        }
        const headerRowIndex = mapping.headerRowIndex;

        const updatedHeaders = mapping.uploadedColumns.map((column, index) => {
            const draft = draftEntries[index];
            return draft?.uploadedName?.trim() || column;
        });

        let rewrittenFile: File;

        if (sourceFile.name.toLowerCase().endsWith(".csv") || sourceFile.type === "text/csv") {
            const csvText = await sourceFile.text();
            const rows = parseCsvRows(csvText);
            if (!rows[mapping.headerRowIndex]) {
                throw new Error("Could not find the CSV header row to update.");
            }
            rows[mapping.headerRowIndex] = updatedHeaders;
            const rewrittenCsv = stringifyCsvRows(rows);
            rewrittenFile = new File([rewrittenCsv], sourceFile.name, {
                type: "text/csv",
                lastModified: Date.now(),
            });
        } else {
            const workbook = XLSX.read(await sourceFile.arrayBuffer(), { type: "array", bookFiles: true });
            if (mapping.sheetName === undefined) {
                throw new Error("Rename metadata is missing for this upload. Please re-upload the file and try again.");
            }

            const sheet = workbook.Sheets[mapping.sheetName];
            if (!sheet) {
                throw new Error(`Could not find worksheet "${mapping.sheetName}" in the workbook.`);
            }

            const range = XLSX.utils.decode_range(sheet["!ref"] || `A1:A1`);
            updatedHeaders.forEach((header, index) => {
                const address = XLSX.utils.encode_cell({ r: headerRowIndex, c: index });
                sheet[address] = { t: "s", v: header };
            });

            for (let colIndex = updatedHeaders.length; colIndex <= range.e.c; colIndex += 1) {
                delete sheet[XLSX.utils.encode_cell({ r: headerRowIndex, c: colIndex })];
            }

            range.e.c = Math.max(range.e.c, updatedHeaders.length - 1);
            range.e.r = Math.max(range.e.r, headerRowIndex);
            sheet["!ref"] = XLSX.utils.encode_range(range);

            const bookType = sourceFile.name.toLowerCase().endsWith(".xls") ? "biff8" : "xlsx";
            const rewrittenBuffer = XLSX.write(workbook, {
                bookType,
                type: "array",
                compression: true,
            });
            rewrittenFile = new File([rewrittenBuffer], sourceFile.name, {
                type: sourceFile.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                lastModified: Date.now(),
            });
        }

        const loadingToast = toast.loading("Uploading renamed columns to the pipeline...");
        const moduleType = activeTab === 'scheme' ? 'revised' : 'normal';
        await fileRegistryService.setFile(rowKey, rewrittenFile);
        await uploadFileToApi(rewrittenFile, sourceSlot, moduleType);
        setAppliedRenames({
            slotId: mappingKey,
            appliedRenames: payload,
        });
        const appliedRenameByOriginal = new Map(
            payload.map((entry) => [entry.originalUploadedColumn, entry.renamedColumn]),
        );
        setRenameDrafts((current) => ({
            ...current,
            [mappingKey]: Object.fromEntries(
                uploadedItems.map((item) => [
                    item.originalIndex,
                    {
                        uploadedName: appliedRenameByOriginal.get(item.column) || item.column,
                        storedName:
                            mapping.renamedPairs.find((pair) => pair.uploadedColumn === item.column)?.storedColumn ||
                            mapping.exactMatches.find((pair) => pair.uploadedColumn === item.column)?.storedColumn ||
                            item.column,
                    },
                ]),
            ),
        }));
        toast.success("Renamed columns uploaded to the pipeline.", { id: loadingToast });
    };

    const getColumnPreview = (samples?: string[]) => {
        if (!samples || samples.length === 0) {
            return null;
        }

        return samples.slice(0, 3);
    };

    const getUploadedColumnItems = (mapping: NonNullable<(typeof columnMappings)[string]>) => {
        const uploadedStatusByColumn = new Map<string, "matched" | "rename" | "extra">();

        mapping.exactMatches.forEach((pair) => {
            uploadedStatusByColumn.set(pair.uploadedColumn, "matched");
        });

        mapping.renamedPairs.forEach((pair) => {
            uploadedStatusByColumn.set(pair.uploadedColumn, "rename");
        });

        mapping.extraUploadedColumns.forEach((column) => {
            uploadedStatusByColumn.set(column, "extra");
        });

        return mapping.uploadedColumns.map((column, index) => ({
            column,
            originalIndex: index,
            status: uploadedStatusByColumn.get(column) || "extra",
            preview: getColumnPreview(mapping.uploadedColumnSamples?.[index]),
        }));
    };

    const buildMappingKey = (rowKey: string, tableId?: string) => (
        tableId ? `${rowKey}${mappingKeySeparator}${tableId}` : rowKey
    );

    const getBaseRowKey = (mappingKey: string) => mappingKey.split(mappingKeySeparator)[0];

    const getComparisonTableId = (mappingKey: string) => mappingKey.split(mappingKeySeparator)[1];

    const openRenameWindow = (rowKey: string, tableId?: string) => {
        setActiveMappingRow(buildMappingKey(rowKey, tableId));
        window.requestAnimationFrame(() => {
            document.getElementById(`rename-window-${buildMappingKey(rowKey, tableId)}`)?.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });
        });
    };

    const clearRelatedMappings = (slot: UploadSlot) => {
        clearMapping(slot.id);
        (slot.comparisonTableIds || []).forEach((tableId) => {
            clearMapping(`${slot.id}::${tableId}`);
        });
    };

    // On mount: check sessionStorage and verify with server before showing modal
    React.useEffect(() => {
        const saved = sessionStorage.getItem("runningModuleType") as "normal" | "revised" | null;
        if (!saved) return;
        fetch(`${getApiBaseUrl()}/process-status`)
            .then(r => r.json())
            .then(data => {
                const isRunning = !!(data.normal?.isRunning || data.revised?.isRunning);
                if (isRunning) {
                    serverConfirmedRunning.current = true;
                    setRunningModuleType(saved);
                } else {
                    sessionStorage.removeItem("runningModuleType");
                }
            })
            .catch(() => sessionStorage.removeItem("runningModuleType"));
    }, []);

    // Poll only if THIS session triggered a process
    React.useEffect(() => {
        if (!runningModuleType) return;

        const poll = async () => {
            try {
                const res = await fetch(`${getApiBaseUrl()}/process-status`);
                if (res.ok) {
                    const data = await res.json();
                    const isRunning = !!(data.normal?.isRunning || data.revised?.isRunning);
                    if (isRunning) {
                        // Server confirmed it's running
                        serverConfirmedRunning.current = true;
                    } else if (serverConfirmedRunning.current) {
                        // Was running before, now stopped — process completed
                        setProcessResult("completed");
                        serverConfirmedRunning.current = false;
                        sessionStorage.removeItem("runningModuleType");
                    }
                }
            } catch { /* ignore */ }
        };
        const interval = setInterval(poll, 15000);
        return () => clearInterval(interval);
    }, [runningModuleType]);
    // Helper to get API URL
    const getApiUrl = () => getApiBaseUrl();

    // Detect mobile screen size
    React.useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);

        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Initialize file registry and restore persisted files
    React.useEffect(() => {
        const initializeStorage = async () => {
            await fileRegistryService.init();
            console.log("File storage initialized");
        };
        initializeStorage();
    }, []);

    // If mobile, render mobile view
    if (isMobile) {
        return <UploadMobile />;
    }

    const handleFileChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        slotConfig: UploadSlot
    ) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        if (files.length > 0) {
            handleFileSelection(files, slotConfig);
        }
        // Reset input
        e.target.value = "";
    };

    const handleDragEnter = (e: React.DragEvent, slotId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(slotId);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(null);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent, slotConfig: UploadSlot) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(null);

        const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
        if (files.length > 0) {
            handleFileSelection(files, slotConfig);
        }
    };

    // Check if all slots have the required files
    const hasReadyFiles = currentSlots.every((slot) => {
        if (slot.optional) return true;
        if (slot.multiple) {
            // For multi-file slots, check if we have maxFiles number of ready files
            const slotFiles = Object.entries(fileStatuses).filter(
                ([key, status]) => key.startsWith(`${slot.id}--`) && status.status === "ready"
            );
            return slotFiles.length >= 1;
        } else {
            // For single-file slots, check if the slot has a ready file
            const slotStatus = fileStatuses[slot.id];
            return slotStatus?.status === "ready";
        }
    });

    // Check if all slots have successfully uploaded files
    const hasUploadedFiles = currentSlots.every((slot) => {
        if (slot.optional) return true;
        if (slot.multiple) {
            // For multi-file slots, check if we have maxFiles number of uploaded files
            const slotFiles = Object.entries(fileStatuses).filter(
                ([key, status]) => key.startsWith(`${slot.id}--`) && status.status === "success"
            );
            return slotFiles.length >= 1;
        } else {
            // For single-file slots, check if the slot has an uploaded file
            const slotStatus = fileStatuses[slot.id];
            return slotStatus?.status === "success";
        }
    });

    const handleAdjustmentUpload = async (schemeName: string, _schemeMapping: boolean, file: File, generatedFile: File) => {
        const loadingToast = toast.loading(`Uploading adjustment for ${schemeName}...`);
        try {
            const adjustmentSlot = {
                id: "Adjustments",
                name: "Adjustment File",
                bucketPath: "Adjustments",
                allowedFormats: [],
                maxSizeInBytes: 0
            };

            const infoSlot = {
                id: "text_files",
                name: "Adjustment Info",
                bucketPath: "text_files",
                allowedFormats: [],
                maxSizeInBytes: 0
            };

            // Upload both files
            await Promise.all([
                uploadFileToApi(file, adjustmentSlot),
                uploadFileToApi(generatedFile, infoSlot)
            ]);

            toast.success(`Adjustment for ${schemeName} uploaded!`, { id: loadingToast });
        } catch (error) {
            console.error("Adjustment upload failed:", error);
            toast.error("Failed to upload adjustment", { id: loadingToast });
            throw error;
        }
    };

    const handleFileUpload = () => {
        if (!hasReadyFiles) {
            toast.error("Please fill all slots before uploading.");
            return;
        }
        const files = getFilesToUpload();
        setProcessingFiles(files);
        setIsProcessModalOpen(true);
    };

    const getFilesToUpload = () => {
        const files: { slot: UploadSlot; file: File }[] = [];
        const missingFiles: string[] = [];
        Object.entries(fileStatuses).forEach(([key, status]) => {
            if (status.status !== "ready") return;
            const slotId = key.split("--")[0];
            const originalSlot = currentSlots.find((s) => s.id === slotId);
            if (originalSlot) {
                const file = fileRegistryService.getFile(key);
                if (file) {
                    files.push({
                        slot: { ...originalSlot, id: key },
                        file,
                    });
                } else {
                    missingFiles.push(originalSlot.name);
                }
            }
        });
        if (missingFiles.length > 0) {
            toast.error(`Files missing from registry (re-select): ${missingFiles.join(", ")}`);
        }
        return files;
    };

    const getFilesToProcess = () => {
        const files: { slot: UploadSlot; file: File }[] = [];
        Object.entries(fileStatuses).forEach(([key, status]) => {
            if (status.status !== "success") return;
            const slotId = key.split("--")[0];
            const originalSlot = currentSlots.find((s) => s.id === slotId);
            if (originalSlot) {
                const file = fileRegistryService.getFile(key);
                if (file) {
                    files.push({
                        slot: { ...originalSlot, id: key },
                        file,
                    });
                }
            }
        });
        return files;
    };

    const [isProcessRunning, setIsProcessRunning] = useState(false);

    const handleRunProcess = async () => {
        const moduleType = activeTab === 'scheme' ? 'revised' : 'normal';
        setIsProcessRunning(true);
        setRunningModuleType(moduleType);
        sessionStorage.setItem("runningModuleType", moduleType);
        const toastId = toast.loading("Process running, check mail after some time...");
        try {
            const apiUrl = getApiUrl();
            console.log(`Calling API: ${apiUrl}/run-process with module: ${moduleType}`);
            const res = await fetch(`${apiUrl}/run-process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ module: moduleType })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || "Failed to start process");
            }
            toast.success("Process triggered successfully!", { id: toastId });
        } catch (error: unknown) {
            console.error("Run Process Error:", error);
            toast.error(error instanceof Error ? error.message : "Something went wrong", { id: toastId });
            setProcessResult("completed");
        } finally {
            setIsProcessRunning(false);
        }
    };

    const handleProcessComplete = () => {
        const uploadedFiles = processingFiles
            .map((f) => f.file.name)
            .join(", ");
        toast.success(`Files: ${uploadedFiles} are uploaded`);
    };

    const activeMapping =
        activeMappingRow ? columnMappings[activeMappingRow] : undefined;
    const activeAppliedRenames = activeMapping?.appliedRenames || [];
    const uploadedColumnItems = activeMapping
        ? getUploadedColumnItems(activeMapping)
        : [];
    const matchedColumnItems = uploadedColumnItems.filter(
        (item) => item.status === "matched",
    );
    const unmatchedColumnItems = uploadedColumnItems.filter(
        (item) => item.status !== "matched",
    );
    const storedColumnsNotMatchedCount = Math.max(
        0,
        (activeMapping?.storedColumns.length || 0) -
            (activeMapping?.exactMatches.length || 0),
    );
    const activeBaseRowKey = activeMappingRow ? getBaseRowKey(activeMappingRow) : null;
    const activeComparisonTableId = activeMappingRow ? getComparisonTableId(activeMappingRow) : undefined;
    const activeSlot = activeBaseRowKey ? currentSlots.find((slot) => slot.id === activeBaseRowKey) : undefined;



    return (
        <div className="flex flex-col min-h-screen">
            <Card className="border shadow-2xl bg-white/90 backdrop-blur-xl">
                <CardHeader>
                    <div className="max-w-5xl mx-auto">
                        <div className="text-center space-y-2">
                            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl text-blue-900/90">
                                Scheme Automation Console
                            </h1>
                            <p className="text-slate-500">
                                Securely upload and process your automation data files.
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-center mt-6">
                        <div className="flex items-center gap-4">
                            <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200 shadow-inner">
                                <button
                                    onClick={() => setActiveTab('scheme')}
                                    className={cn(
                                        "px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300",
                                        activeTab === 'scheme'
                                            ? "bg-white text-blue-600 shadow-lg scale-[1.02]"
                                            : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                                    )}
                                >
                                    Gross Sales Revenue
                                </button>
                                <button
                                    onClick={() => setActiveTab('client')}
                                    className={cn(
                                        "px-6 py-2 text-sm font-bold rounded-lg transition-all duration-300",
                                        activeTab === 'client'
                                            ? "bg-white text-blue-600 shadow-lg scale-[1.02]"
                                            : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                                    )}
                                >
                                    Revised Gross Sales Revenue
                                </button>
                            </div>
                        </div>
                    </div>

                </CardHeader>

                <CardContent className="m-6 bg-slate-50 rounded-lg border-x-4 border-blue-600">
                    <div className="divide-y divide-slate-100">
                        {/* Table Header */}
                        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50/50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                            <div className="col-span-3 text-center">Target Slot</div>
                            <div className="col-span-5 text-center">Selected File</div>
                            <div className="col-span-2 text-center">Status</div>
                            <div className="col-span-2 text-center">Actions</div>
                        </div>

                        {currentSlots.map((slot) => {
                            const relevantKeys = Object.keys(fileStatuses).filter((k) =>
                                slot.multiple ? k.startsWith(`${slot.id}--`) : k === slot.id
                            );

                            const rowsToRender: { key: string; status?: FileStatus; isIdle?: boolean }[] =
                                relevantKeys.map((k) => ({ key: k, status: fileStatuses[k] }));

                            if (slot.multiple) {
                                const extraRows = visibleSlotsCount[slot.id] || 0;
                                const maxRemaining = (slot.maxFiles || 1) - rowsToRender.length;
                                const idleToPush = Math.min(Math.max(rowsToRender.length === 0 ? 1 : 0, extraRows), maxRemaining);

                                for (let i = 0; i < idleToPush; i++) {
                                    rowsToRender.push({ key: `${slot.id}-idle-${i}`, isIdle: true });
                                }
                            } else if (rowsToRender.length === 0) {
                                rowsToRender.push({ key: slot.id, isIdle: true });
                            }

                            return (
                                <React.Fragment key={slot.id}>
                                    <input
                                        id={`file-${slot.id}`}
                                        type="file"
                                        className="hidden"
                                        onChange={(e) => handleFileChange(e, slot)}
                                        accept={slot.allowedFormats.join(",")}

                                        multiple={slot.multiple}
                                    />
                                    {rowsToRender.map((row) => {
                                        const status = row.status;
                                        const isReady = status?.status === "ready";
                                        const isMapping = status?.status === "mapping";
                                        const isSuccess = status?.status === "success";
                                        const isError = status?.status === "error";
                                        const isIdle = row.isIdle || !status || status.status === "idle";

                                        return (
                                            <div
                                                key={row.key}
                                                className={cn(
                                                    "group grid grid-cols-12 gap-4 px-6 py-4 items-center transition-all duration-200 hover:bg-slate-50 border-b border-dashed border-slate-200 last:border-0 first:rounded-lg last:rounded-lg",
                                                    isReady && "bg-blue-100/40 sync-pulse",
                                                    isMapping && "bg-amber-100/40 sync-pulse",
                                                    isSuccess && "bg-emerald-100/40 sync-pulse",
                                                    isError && "bg-red-100/40 sync-pulse",
                                                    isIdle && "bg-slate-100/40",
                                                    "hover:animate-none"
                                                )}
                                            >
                                                {/* Slot Name */}
                                                <div className="col-span-3">
                                                    <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                                        <div className={cn(
                                                            "w-2 h-2 rounded-full",
                                                            isReady ? "bg-blue-500 sync-ping" :
                                                                isMapping ? "bg-amber-500 sync-pulse-fast" :
                                                                    isSuccess ? "bg-green-500 sync-pulse-fast" :
                                                                        isError ? "bg-red-500 sync-pulse-fast" : "bg-slate-300"
                                                        )} />
                                                        {slot.name}
                                                        {slot.optional && (
                                                            <span className="text-[10px] text-slate-400 font-normal ml-1">(optional)</span>
                                                        )}
                                                        {slot.multiple && (
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={() => setVisibleSlotsCount(prev => ({
                                                                        ...prev,
                                                                        [slot.id]: (prev[slot.id] || 0) + 1
                                                                    }))}
                                                                    className="p-1 hover:bg-white rounded-full text-blue-500 shadow-sm transition-all"
                                                                    title="Add another file"
                                                                >
                                                                    <Plus className="w-3 h-3" />
                                                                </button>
                                                                {slot.multiple && (relevantKeys.length + (visibleSlotsCount[slot.id] || 0)) > 1 && (
                                                                    <button
                                                                        onClick={() => setVisibleSlotsCount(prev => ({
                                                                            ...prev,
                                                                            [slot.id]: Math.max(0, (prev[slot.id] || 0) - 1)
                                                                        }))}
                                                                        className="p-1 hover:bg-white rounded-full text-red-500 shadow-sm transition-all"
                                                                        title="Remove last slot"
                                                                    >
                                                                        <Minus className="w-3 h-3" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 font-mono mt-1 pl-4 tracking-wider">
                                                        {slot.bucketPath}
                                                    </div>
                                                </div>

                                                {/* Selected File Area */}
                                                <div className="col-span-5 relative group/file">
                                                    {!isIdle ? (
                                                        <div className="flex items-center gap-3">
                                                            <div
                                                                className={cn(
                                                                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm border",
                                                                    isReady
                                                                        ? "bg-blue-100/50 border-blue-200 text-blue-600"
                                                                        : isMapping
                                                                            ? "bg-amber-100/50 border-amber-200 text-amber-600"
                                                                            : isSuccess
                                                                                ? "bg-green-100/50 border-green-200 text-green-600"
                                                                                : isError
                                                                                    ? "bg-red-100/50 border-red-200 text-red-600"
                                                                                    : "bg-slate-100 border-slate-200 text-slate-500"
                                                                )}
                                                            >
                                                                <FileText className="w-4 h-4" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-medium text-slate-900 truncate">
                                                                    {status.fileName}
                                                                </p>
                                                                <p className="text-[10px] text-slate-500">
                                                                    {(status.fileSize || 0) / 1024 < 1024
                                                                        ? `${((status.fileSize || 0) / 1024).toFixed(1)} KB`
                                                                        : (status.fileSize || 0) / (1024 * 1024) < 1024
                                                                            ? `${((status.fileSize || 0) / (1024 * 1024)).toFixed(1)} MB`
                                                                            : `${((status.fileSize || 0) / (1024 * 1024 * 1024)).toFixed(1)} GB`}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            className="relative"
                                                            onDragEnter={(e) => handleDragEnter(e, slot.id)}
                                                            onDragLeave={handleDragLeave}
                                                            onDragOver={handleDragOver}
                                                            onDrop={(e) => handleDrop(e, slot)}
                                                        >
                                                            <label
                                                                htmlFor={`file-${slot.id}`}
                                                                className={cn(
                                                                    "flex items-center gap-2 text-sm cursor-pointer transition-all duration-200 py-2 border-2 border-dashed rounded-lg px-3",
                                                                    dragActive === slot.id
                                                                        ? "border-blue-500 bg-blue-100/50 text-blue-600 scale-[1.02]"
                                                                        : "border-slate-200 bg-slate-50/50 text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 hover:border-blue-300"
                                                                )}
                                                            >
                                                                <UploadIcon className="w-4 h-4" />
                                                                <div className="flex flex-col">
                                                                    <span>{dragActive === slot.id ? "Drop file here..." : "Drag & drop or click to select"}</span>
                                                                </div>
                                                            </label>
                                                        </div>
                                                    )}
                                                    {/* Input removed from here and moved up to React.Fragment */}
                                                </div>

                                                {/* Status Badge */}
                                                <div className="col-span-2 text-center hover:animate-none">
                                                    {isReady && (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 sync-bounce">
                                                            <Package className="w-3 h-3" />
                                                            Ready
                                                        </span>
                                                    )}
                                                    {isSuccess && (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                                            <PackageCheck className="w-3 h-3" />
                                                            Done
                                                        </span>
                                                    )}
                                                    {isError && (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                                            <PackageX className="w-3 h-3" />
                                                            Error
                                                        </span>
                                                    )}
                                                    {isIdle && (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-200 text-slate-700 border-dashed border-slate-900">
                                                            <PackageOpen className="w-3 h-3" />
                                                            Empty
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Actions */}
                                                <div className="col-span-2 flex justify-end items-start gap-2">
                                                    {!isIdle && (
                                                        <div className="flex flex-col items-end gap-2">
                                                            {columnMappings[row.key]?.status === "ready" && (
                                                                <div className="flex flex-col items-end gap-2">
                                                                    <button
                                                                        onClick={() => openRenameWindow(row.key)}
                                                                        className="px-3 py-1.5 rounded-full text-[10px] font-bold border border-blue-200 bg-blue-600 text-white transition-colors hover:bg-blue-700"
                                                                        title="Open rename window"
                                                                    >
                                                                        Map
                                                                    </button>
                                                                    {slot.comparisonTableIds?.includes("parent_child") && columnMappings[`${row.key}::parent_child`]?.status === "ready" && (
                                                                        <button
                                                                            onClick={() => openRenameWindow(row.key, "parent_child")}
                                                                            className="px-3 py-1.5 rounded-full text-[10px] font-bold border border-amber-200 bg-amber-500 text-white transition-colors hover:bg-amber-600"
                                                                            title="Open parent child mapping"
                                                                        >
                                                                            Parent Child
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}

                                                            <div className="flex items-center gap-2">
                                                                {isMapping && (
                                                         <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                                             <Loader2 className="w-3 h-3 animate-spin" />
                                                             Processing
                                                         </span>
                                                     )}
                                                     {isSuccess && (
                                                                    <button
                                                                        onClick={() => resetToReady(row.key)}
                                                                        className="p-1.5 rounded-md hover:bg-yellow-50 text-slate-400 hover:text-yellow-500 transition-colors"
                                                                        title="Refresh (reset to ready)"
                                                                    >
                                                                        <RefreshCw className="w-4 h-4" />
                                                                    </button>
                                                                )}

                                                                <label
                                                                    htmlFor={`file-input-${row.key}`}
                                                                    className="p-1.5 rounded-md hover:bg-slate-200 text-slate-400 hover:text-blue-600 cursor-pointer transition-colors"
                                                                    title="Replace File"
                                                                    onClick={() => {
                                                                        const slot = currentSlots.find((item) => item.id === row.key);
                                                                        if (slot) {
                                                                            clearRelatedMappings(slot);
                                                                        }
                                                                    }}
                                                                >
                                                                    <RotateCcw className="w-4 h-4" />
                                                                </label>
                                                                <input
                                                                    id={`file-input-${row.key}`}
                                                                    type="file"
                                                                    className="hidden"
                                                                    accept={slot.allowedFormats.join(",")}
                                                                    onChange={(e) => {
                                                                        const files = e.target.files ? Array.from(e.target.files) : [];
                                                                        if (files.length > 0) {
                                                                            const slot = currentSlots.find((item) => item.id === row.key);
                                                                            if (slot) {
                                                                                clearRelatedMappings(slot);
                                                                                retryUpload(row.key);
                                                                                handleFileSelection(files, slot);
                                                                            }
                                                                        }
                                                                        e.target.value = "";
                                                                    }}
                                                                />

                                                                <button
                                                                    onClick={() => {
                                                                        const slot = currentSlots.find((item) => item.id === row.key);
                                                                        if (slot) {
                                                                            clearRelatedMappings(slot);
                                                                        }
                                                                        retryUpload(row.key);
                                                                    }}
                                                                    className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                                                                    title="Remove"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            </div>

                                                            {columnMappings[row.key]?.status === "ready" && (
                                                                <div className="text-right text-[10px] text-slate-500 max-w-[220px]">
                                                                    <div className="font-bold text-slate-700 mb-1 flex items-center justify-end gap-1">
                                                                        <Check className="w-3 h-3 text-emerald-500" />
                                                                        Mapping ready
                                                                    </div>
                                                                    <p className="truncate">
                                                                        {columnMappings[row.key].exactMatches.length} exact, {columnMappings[row.key].renamedPairs.length} rename pair(s)
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                            </div>
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </CardContent>

                <div className="sticky bottom-0 z-10 p-6 m-7 rounded-xl flex justify-between items-center bg-white/10 backdrop-blur-sm border-t border-slate-200/50">
                    <div className="text-sm text-slate-500">
                        {
                            hasUploadedFiles ? (
                                <span className="ml-2 text-slate-900">{getFilesToProcess().length} files are ready for processing</span>
                            ) : (
                                <span className="font-semibold text-slate-900">
                                    <span className="underline">{getFilesToUpload().length} </span>
                                    files are ready for uploading
                                </span>
                            )
                        }
                    </div>
                    <div className="flex gap-3 items-center">
                        <Button
                            size="lg"
                            className={cn(
                                "gap-2 shadow-xl transition-all duration-300",
                                hasReadyFiles
                                    ? "bg-blue-400 hover:bg-blue-500"
                                    : "bg-slate-300 text-slate-400 cursor-not-allowed"
                            )}
                            onClick={handleFileUpload}
                            disabled={!hasReadyFiles}
                        >
                            <div className="relative">
                                {hasReadyFiles && <div className="absolute inset-0 bg-white/20 sync-ping rounded-full" />}
                            </div>
                            {hasReadyFiles ? (
                                <>
                                    <Truck className="w-4 h-4 fill-current relative z-10 text-slate-700" />
                                    Upload Files
                                </>
                            ) : (
                                <>
                                    <PackagePlus className="w-4 h-4" />
                                    <span>Add Files</span>
                                </>
                            )}
                        </Button>
                        {activeTab === 'client' && (
                            <div className="flex gap-2">
                                <Button
                                    size="lg"
                                    variant="outline"
                                    onClick={() => setIsAdjustmentModalOpen(true)}
                                    className="border-blue-200 text-blue-600 hover:bg-blue-600 hover:text-white transition-all font-bold gap-2 shadow-sm h-11 px-5 rounded-xl border-2 active:scale-95"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Adjustment
                                </Button>
                            </div>
                        )}
                        <Button
                            size="lg"
                            className={cn(
                                "gap-2 shadow-xl shadow-green-900/40 transition-all duration-300",
                                hasUploadedFiles && !isProcessRunning
                                    ? "bg-green-500 hover:bg-green-600"
                                    : isProcessRunning
                                    ? "bg-green-600 cursor-not-allowed"
                                    : "bg-slate-300 text-slate-400 cursor-not-allowed"
                            )}
                            onClick={handleRunProcess}
                            disabled={!hasUploadedFiles || isProcessRunning}
                        >
                            {isProcessRunning ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Running...
                                </>
                            ) : (
                                <>
                                    <div className="relative">
                                        {hasUploadedFiles && <div className="absolute inset-0 bg-white/20 sync-ping rounded-full" />}
                                    </div>
                                    <Play className="w-4 h-4 relative z-10" />
                                    Run Process
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </Card >

            {activeMappingRow && columnMappings[activeMappingRow]?.status === "ready" && (
                <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div id={`rename-window-${activeMappingRow}`} className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Rename Window</p>
                                <h2 className="mt-1 text-2xl font-bold text-slate-900">
                                    {activeSlot?.name || activeBaseRowKey || activeMappingRow}
                                </h2>
                                {activeComparisonTableId && (
                                    <p className="mt-1 text-sm font-semibold text-amber-600">
                                        Comparing against {activeComparisonTableId.replace(/_/g, " ")}
                                    </p>
                                )}
                                <p className="mt-1 text-sm text-slate-500">
                                    Matched columns are shown as read-only. Only unmatched uploaded columns can be renamed.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!activeMappingRow) return;
                                    try {
                                        await persistRenameDrafts(activeMappingRow);
                                        setActiveMappingRow(null);
                                    } catch (error) {
                                        toast.error((error as Error).message || "Failed to save renamed columns.");
                                    }
                                }}
                                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
                            >
                                Save &amp; Close
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-5">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                <div className="lg:col-span-1 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Summary</p>
                                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                                        <p>Exact matches: {columnMappings[activeMappingRow].exactMatches.length}</p>
                                        <p>To rename: {unmatchedColumnItems.length}</p>
                                        <p>Stored columns: {columnMappings[activeMappingRow].storedColumns.length}</p>
                                        <p>Uploaded columns: {columnMappings[activeMappingRow].uploadedColumns.length}</p>
                                    </div>

                                    <div className="mt-5 rounded-2xl border border-amber-200 bg-white p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="min-w-0 truncate text-xs font-bold uppercase tracking-wider text-amber-700">
                                                Stored columns not matched
                                            </p>
                                            <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-700">
                                                {storedColumnsNotMatchedCount}
                                            </span>
                                        </div>

                                        <div className="mt-3 max-h-56 overflow-y-auto pr-1 flex flex-wrap gap-2">
                                            {columnMappings[activeMappingRow].missingStoredColumns.length > 0 ? (
                                                columnMappings[activeMappingRow].missingStoredColumns.map((column) => (
                                                    <span
                                                        key={column}
                                                        title={column}
                                                        className="inline-flex max-w-full items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
                                                    >
                                                        <span className="block max-w-[220px] whitespace-normal break-words text-left leading-snug">
                                                            {column}
                                                        </span>
                                                    </span>
                                                ))
                                            ) : (
                                                <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                                                    All stored columns were matched.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-5 rounded-2xl border border-blue-200 bg-white p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="min-w-0 truncate text-xs font-bold uppercase tracking-wider text-blue-700">
                                                Applied renames
                                            </p>
                                            <span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold text-blue-700">
                                                {activeAppliedRenames.length}
                                            </span>
                                        </div>

                                        <div className="mt-3 space-y-2">
                                            {activeAppliedRenames.length > 0 ? (
                                                activeAppliedRenames.map((item) => (
                                                    <div
                                                        key={`${item.originalUploadedColumn}-${item.renamedColumn}`}
                                                        className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-slate-700"
                                                    >
                                                        <div className="font-semibold break-words">
                                                            {item.renamedColumn}
                                                        </div>
                                                        <div className="mt-1 text-[11px] text-slate-600">
                                                            From: {item.originalUploadedColumn}
                                                        </div>
                                                        {item.storedColumn && (
                                                            <div className="mt-1 text-[11px] text-blue-700">
                                                                Matched to stored column: {item.storedColumn}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                                                    No renames have been applied yet.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="lg:col-span-2 space-y-4">
                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Matched columns</p>
                                                <p className="mt-1 text-sm text-emerald-700">
                                                    These columns already match after cleaning, so they are shown as read-only.
                                                </p>
                                            </div>
                                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                                                {matchedColumnItems.length} matched
                                            </span>
                                        </div>

                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {matchedColumnItems.length > 0 ? (
                                                matchedColumnItems.map((item) => (
                                                    <span
                                                        key={item.column}
                                                        title={item.column}
                                                        className="inline-flex max-w-full items-center rounded-full border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
                                                    >
                                                        <span className="block max-w-[220px] whitespace-normal break-words text-left leading-snug">
                                                            {item.column}
                                                        </span>
                                                    </span>
                                                ))
                                            ) : (
                                                <div className="rounded-xl border border-dashed border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-700">
                                                    No columns matched automatically.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Unmatched columns</p>
                                                <p className="mt-1 text-sm text-slate-500">
                                                    These uploaded columns did not match and can be renamed directly.
                                                </p>
                                            </div>
                                            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
                                                {unmatchedColumnItems.length} pending
                                            </span>
                                        </div>

                                        <div className="mt-4 space-y-3">
                                            {unmatchedColumnItems.length > 0 ? (
                                                unmatchedColumnItems.filter(item => item.column !== "").map((item) => {
                                                    const originalIdx = item.originalIndex;
                                                    const draft = renameDrafts[activeMappingRow]?.[originalIdx] || {
                                                        uploadedName: item.column,
                                                        storedName: item.column,
                                                    };
                                                    const savedRename = activeAppliedRenames.find(
                                                        (entry) => entry.originalUploadedColumn === item.column,
                                                    );

                                                    return (
                                                        <div
                                                            key={`${item.column}-${originalIdx}`}
                                                            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                                                        Uploaded column
                                                                    </p>
                                                                    <p
                                                                        title={savedRename ? `${item.column} → ${savedRename.renamedColumn}` : item.column}
                                                                        className="whitespace-normal break-words text-sm font-semibold text-slate-900 leading-snug"
                                                                    >
                                                                        {item.column}
                                                                    </p>
                                                                    {savedRename && (
                                                                        <p className="mt-1 text-[11px] text-blue-600">
                                                                            Saved as: {savedRename.renamedColumn}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <span
                                                                    className={cn(
                                                                        "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                                                                        item.status === "rename"
                                                                            ? "bg-blue-100 text-blue-700"
                                                                            : "bg-amber-100 text-amber-700",
                                                                    )}
                                                                >
                                                                    {item.status === "rename" ? "Rename" : "Unmatched"}
                                                                </span>
                                                            </div>

                                                            <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
                                                                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                                                                    Data preview
                                                                </p>
                                                                {item.preview && item.preview.length > 0 ? (
                                                                    <>
                                                                        <p className="mt-2 text-xs text-blue-800">
                                                                            Showing the first few non-empty values from this column.
                                                                        </p>
                                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                                            {item.preview.map((sample, sampleIndex) => (
                                                                                <span
                                                                                    key={`${item.column}-preview-${sampleIndex}`}
                                                                                    className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 border border-blue-100"
                                                                                >
                                                                                    {sample}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <p className="mt-2 text-sm text-blue-700">
                                                                        No preview data was captured for this column.
                                                                    </p>
                                                                )}
                                                            </div>

                                                            <div className="mt-4 space-y-2">
                                                                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
                                                                    Rename uploaded column
                                                                </p>
                                                                <SearchableSelect 
                                                                    value={draft.uploadedName}
                                                                    originalName={item.column}
                                                                    options={columnMappings[activeMappingRow].missingStoredColumns}
                                                                    onChange={(val) => updateRenameDraft(activeMappingRow, originalIdx, "uploadedName", val)}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : columnMappings[activeMappingRow].uploadedColumns.length === 0 &&
                                                columnMappings[activeMappingRow].missingStoredColumns.length > 0 ? (
                                                columnMappings[activeMappingRow].missingStoredColumns.map((_storedColumn, index) => {
                                                    const nullLabel = `null${index + 1}`;
                                                    const draftValue = nullMappingDrafts[activeMappingRow]?.[index];
                                                    const selectedStored = draftValue && draftValue !== nullLabel ? draftValue : "";
                                                    return (
                                                        <div
                                                            key={nullLabel}
                                                            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                                                        Uploaded column
                                                                    </p>
                                                                    <p
                                                                        title={nullLabel}
                                                                        className="whitespace-normal break-words text-sm font-semibold text-slate-900 leading-snug"
                                                                    >
                                                                        {nullLabel}
                                                                    </p>
                                                                    {selectedStored && (
                                                                        <p className="mt-1 text-[11px] text-blue-600">
                                                                            Mapped to: {selectedStored}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                                                                    Unmatched
                                                                </span>
                                                            </div>

                                                            <div className="mt-4 space-y-2">
                                                                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
                                                                    Map to stored column
                                                                </p>
                                                                <SearchableSelect
                                                                    value={draftValue || nullLabel}
                                                                    originalName={nullLabel}
                                                                    options={columnMappings[activeMappingRow].missingStoredColumns}
                                                                    onChange={(val) => {
                                                                        setNullMappingDrafts((current) => {
                                                                            const next = { ...current };
                                                                            const inner = { ...(next[activeMappingRow] || {}) };
                                                                            if (!val || val === nullLabel) {
                                                                                delete inner[index];
                                                                            } else {
                                                                                inner[index] = val;
                                                                            }
                                                                            next[activeMappingRow] = inner;
                                                                            return next;
                                                                        });
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                                                    No unmatched uploaded columns were found for this file.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3 bg-slate-50">
                            <p className="text-sm text-slate-500">
                                Matched columns are read-only. Use the inputs above only for unmatched uploaded headers.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <ProcessModal
                isOpen={isProcessModalOpen}
                onClose={() => setIsProcessModalOpen(false)}
                filesToDisplay={processingFiles}
                onProcessFile={(file, slot, _module, showToast) => uploadFile(file, slot, activeTab === 'scheme' ? 'revised' : 'normal', showToast)}
                onComplete={handleProcessComplete}
            />
            <AdjustmentModal
                isOpen={isAdjustmentModalOpen}
                onClose={() => setIsAdjustmentModalOpen(false)}
                onUpload={handleAdjustmentUpload}
            />
            <ProcessRunningModal
                isOpen={runningModuleType !== null || processResult !== null}
                moduleType={runningModuleType}
                result={processResult}
                onClose={() => {
                    setProcessResult(null);
                    setRunningModuleType(null);
                    sessionStorage.removeItem("runningModuleType");
                }}
            />

        </div>
    );
};
