import React, { useState, useEffect } from "react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "../../components/ui/button";
import {
    Loader2,
    FileText,
    Upload as UploadIcon,
    X,
    RotateCcw,
    Package,
    PackageCheck,
    Truck,
    Plus,
    Minus
} from "lucide-react";
import { schemeAutomationSlots, clientSectionSlots, type UploadSlot } from "../../config/upload-slots";
import { useUpload } from "../uploadHooks";
import { AdjustmentModal } from "./AdjustmentModal";
import { uploadFileToApi } from "../uploadApi";
import type { FileStatus } from "../uploadTypes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ProcessModal } from "./ProcessingModal";
import { fileRegistryService } from "../fileRegistry";

export const UploadMobile = () => {
    const { fileStatuses, handleFileSelection, uploadFile, retryUpload, reupload } = useUpload();
    const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'scheme' | 'client'>('client');
    const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
    const [isRunningProcess, setIsRunningProcess] = useState<Record<string, boolean>>({
        normal: false,
        revised: false,
    });
    const [processingFiles, setProcessingFiles] = useState<{ slot: UploadSlot; file: File }[]>([]);
    const [visibleSlotsCount, setVisibleSlotsCount] = useState<Record<string, number>>({});

    const currentSlots = activeTab === 'scheme' ? schemeAutomationSlots : clientSectionSlots;

    useEffect(() => {
        const initializeStorage = async () => {
            await fileRegistryService.init();
            console.log("File storage initialized (mobile)");
        };
        initializeStorage();
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, slotConfig: UploadSlot) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        if (files.length > 0) {
            handleFileSelection(files, slotConfig);
        }
        e.target.value = "";
    };

    const hasReadyFiles = currentSlots.every((slot) => {
        if (slot.optional) return true;
        if (slot.multiple) {
            const slotFiles = Object.entries(fileStatuses).filter(
                ([key, status]) => key.startsWith(`${slot.id}--`) && status.status === "ready"
            );
            return slotFiles.length >= 1;
        } else {
            const slotStatus = fileStatuses[slot.id];
            return slotStatus?.status === "ready";
        }
    });

    const handleAdjustmentUpload = async (schemeName: string, _schemeMapping: boolean, file: File, generatedFile: File) => {
        const loadingToast = toast.loading(`Uploading adjustment for ${schemeName}...`);
        try {
            const adjustmentSlot = { id: "text_files", name: "Adj File", bucketPath: "text_files", allowedFormats: [], maxSizeInBytes: 0 };
            const infoSlot = { id: "text_files", name: "Adj Info", bucketPath: "text_files", allowedFormats: [], maxSizeInBytes: 0 };
            await Promise.all([uploadFileToApi(file, adjustmentSlot), uploadFileToApi(generatedFile, infoSlot)]);
            toast.success(`Adjustment for ${schemeName} uploaded!`, { id: loadingToast });
        } catch (error) {
            toast.error("Failed to upload adjustment", { id: loadingToast });
            throw error;
        }
    };

    const handleRunUpload = () => {
        if (!hasReadyFiles) {
            toast.error("Please fill all slots before uploading.");
            return;
        }
        const files = getFilesToProcess();
        setProcessingFiles(files);
        setIsProcessModalOpen(true);
    };

    const getFilesToProcess = () => {
        const files: { slot: UploadSlot; file: File }[] = [];
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
                }
            }
        });
        return files;
    };

    const handleProcessComplete = () => {
        const uploadedFiles = processingFiles.map((f) => f.file.name).join(", ");
        toast.success(`Files: ${uploadedFiles} are uploaded`);
        const moduleType = activeTab === 'scheme' ? 'revised' : 'normal';
        setIsRunningProcess(prev => ({ ...prev, [moduleType]: false }));
    };

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 pb-32">
            <AdjustmentModal
                isOpen={isAdjustmentModalOpen}
                onClose={() => setIsAdjustmentModalOpen(false)}
                onUpload={handleAdjustmentUpload}
            />



            <div className="p-4 space-y-4">
                {/* Header Card */}
                <Card className="border-none shadow-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white overflow-hidden rounded-3xl">
                    <CardHeader className="pb-6 pt-8 text-center relative">
                        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                            <Package className="absolute -left-4 -top-4 w-24 h-24 rotate-12" />
                            <PackageCheck className="absolute -right-4 -bottom-4 w-24 h-24 -rotate-12" />
                        </div>
                        <CardTitle className="text-2xl font-bold tracking-tight">Automation Tool</CardTitle>
                        <p className="text-blue-100/80 text-sm mt-1">Scheme Automation</p>
                    </CardHeader>

                    <div className="px-4 pb-4">
                        <div className="flex p-1.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/5">
                            <button
                                onClick={() => setActiveTab('client')}
                                className={cn(
                                    "flex-1 py-2.5 text-xs font-bold rounded-xl transition-all duration-300",
                                    activeTab === 'client'
                                        ? "bg-white text-blue-600 shadow-lg scale-[1.02]"
                                        : "text-white/70 hover:text-white hover:bg-white/5"
                                )}
                            >
                                Automation
                            </button>
                            <button
                                onClick={() => setActiveTab('scheme')}
                                className={cn(
                                    "flex-1 py-2.5 text-xs font-bold rounded-xl transition-all duration-300",
                                    activeTab === 'scheme'
                                        ? "bg-white text-blue-600 shadow-lg scale-[1.02]"
                                        : "text-white/70 hover:text-white hover:bg-white/5"
                                )}
                            >
                                New Automation
                            </button>
                        </div>
                    </div>
                </Card>

                {/* Upload Slots */}
                <div className="space-y-4">
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
                                {rowsToRender.map((row) => {
                                    const status = row.status;
                                    const isReady = status?.status === "ready";
                                    const isSuccess = status?.status === "success";
                                    const isError = status?.status === "error";
                                    const isIdle = row.isIdle || !status || status.status === "idle";

                                    return (
                                        <Card
                                            key={row.key}
                                            className={cn(
                                                "rounded-3xl border-none transition-all duration-300 overflow-hidden",
                                                !isIdle ? "shadow-md ring-1 ring-slate-200" : "shadow-sm bg-white/50"
                                            )}
                                        >
                                            <CardContent className="p-5">
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className={cn(
                                                            "w-2.5 h-2.5 rounded-full",
                                                            isReady ? "bg-blue-500 animate-pulse" :
                                                                isSuccess ? "bg-emerald-500" :
                                                                    isError ? "bg-red-500" : "bg-slate-300"
                                                        )} />
                                                        <span className="text-sm font-bold text-slate-800 truncate">
                                                            {slot.name}
                                                            {slot.optional && (
                                                                <span className="text-[10px] text-slate-400 font-normal ml-1">(optional)</span>
                                                            )}
                                                        </span>
                                                        {slot.multiple && (
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={() => setVisibleSlotsCount(prev => ({
                                                                        ...prev,
                                                                        [slot.id]: (prev[slot.id] || 0) + 1
                                                                    }))}
                                                                    className="p-1 bg-blue-50 hover:bg-white rounded-full text-blue-500 shadow-sm transition-all"
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
                                                                        className="p-1 bg-red-50 hover:bg-white rounded-full text-red-500 shadow-sm transition-all"
                                                                        title="Remove last slot"
                                                                    >
                                                                        <Minus className="w-3 h-3" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full border border-slate-200">
                                                        {slot.allowedFormats[0].replace('.', '').toUpperCase()}
                                                    </span>
                                                </div>

                                                {!isIdle ? (
                                                    <div className="space-y-4">
                                                        <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                            <div className={cn(
                                                                "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm transition-colors",
                                                                isReady ? "bg-blue-600 text-white" :
                                                                    isSuccess ? "bg-emerald-600 text-white" :
                                                                        "bg-slate-200 text-slate-500"
                                                            )}>
                                                                <FileText className="w-5 h-5" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-bold text-slate-900 truncate">{status.fileName}</p>
                                                                <p className="text-[11px] text-slate-500 font-medium">{formatFileSize(status.fileSize || 0)}</p>
                                                            </div>
                                                            <button
                                                                onClick={() => retryUpload(row.key)}
                                                                className="p-2 hover:bg-red-50 rounded-xl transition-all text-slate-300 hover:text-red-500"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>

                                                        <div className="flex gap-2">
                                                            {isSuccess && (
                                                                <Button
                                                                    onClick={() => reupload(row.key)}
                                                                    variant="outline"
                                                                    className="flex-1 h-10 rounded-xl border-slate-200 text-slate-600 font-bold text-xs gap-2"
                                                                >
                                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                                    Re-upload
                                                                </Button>
                                                            )}
                                                            {!isSuccess && (
                                                                <Button
                                                                    variant="outline"
                                                                    onClick={() => document.getElementById(`file-${row.key}`)?.click()}
                                                                    className="flex-1 h-10 rounded-xl border-blue-100 text-blue-600 hover:bg-blue-50 font-bold text-xs gap-2"
                                                                >
                                                                    <UploadIcon className="w-3.5 h-3.5" />
                                                                    Replace File
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div
                                                        onClick={() => document.getElementById(`file-${row.key}`)?.click()}
                                                        className="py-8 px-4 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 flex flex-col items-center justify-center gap-2 active:scale-[0.98] transition-all"
                                                    >
                                                        <div className="p-3 bg-white rounded-2xl shadow-sm text-blue-600">
                                                            <UploadIcon className="w-6 h-6" />
                                                        </div>
                                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tap to select file</p>
                                                    </div>
                                                )}

                                                <input
                                                    id={`file-${row.key}`}
                                                    type="file"
                                                    className="hidden"
                                                    onChange={(e) => handleFileChange(e, slot)}
                                                    accept={slot.allowedFormats.join(",")}
                                                    multiple={slot.multiple}
                                                />
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* Sticky Footer */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-xl border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-50">
                <div className="flex gap-3 max-w-xl mx-auto">
                    {activeTab === 'client' && (
                        <Button
                            size="lg"
                            variant="outline"
                            onClick={() => setIsAdjustmentModalOpen(true)}
                            className="bg-white hover:bg-slate-50 border-slate-200 text-slate-700 h-14 px-4 rounded-2xl font-bold shadow-sm transition-all active:scale-95 shrink-0"
                        >
                            <Plus className="w-5 h-5 mr-1" />
                            <span className="hidden xs:inline">Adjustment</span>
                            <span className="xs:hidden">Adj</span>
                        </Button>
                    )}
                    <Button
                        size="lg"
                        className={cn(
                            "flex-1 h-14 rounded-2xl font-bold shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3",
                            hasReadyFiles
                                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200/50"
                                : "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none"
                        )}
                        onClick={handleRunUpload}
                        disabled={!hasReadyFiles || isRunningProcess[activeTab === 'scheme' ? 'revised' : 'normal']}
                    >
                        {isRunningProcess[activeTab === 'scheme' ? 'revised' : 'normal'] ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <>
                                <Truck className="w-6 h-6" />
                                <span>{hasReadyFiles ? "Upload Files" : "Missing Files"}</span>
                            </>
                        )}
                    </Button>
                </div>
            </div>

            <ProcessModal
                isOpen={isProcessModalOpen}
                onClose={() => setIsProcessModalOpen(false)}
                filesToDisplay={processingFiles}
                onProcessFile={(file, slot, _module, showToast) => uploadFile(file, slot, activeTab === 'scheme' ? 'revised' : 'normal', showToast)}
                onComplete={handleProcessComplete}
            />
        </div>
    );
};
