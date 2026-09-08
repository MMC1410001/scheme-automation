import React, { useState, useRef, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
    FileText,
    Upload as UploadIcon,
    X,
    Loader2,
    CheckCircle2,
    ArrowRight,
    ClipboardList,
    Plus,
    Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { uploadFileToApi } from "../uploadApi";

interface AdjustmentSet {
    id: string;
    schemeName: string;
    schemeMappingColumn: string;
    schemeMapping: boolean;
}

interface AdjustmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpload: (schemeName: string, schemeMapping: boolean, file: File, generatedFile: File) => Promise<void>;
}

const ProfessionalSwitch = React.memo(({ checked, onChange, label, subLabel, disabled }: {
    checked: boolean;
    onChange: (val: boolean) => void;
    label: string;
    subLabel: string;
    disabled?: boolean;
}) => (
    <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200 transition-all hover:bg-slate-100 group">
        <div className="space-y-0.5">
            <label className="text-xs font-bold text-slate-700">{label}</label>
            <p className="text-[10px] text-slate-500 font-medium">{subLabel}</p>
        </div>
        <button
            onClick={() => !disabled && onChange(!checked)}
            className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-200 focus:outline-none",
                checked ? "bg-blue-600" : "bg-slate-300"
            )}
            disabled={disabled}
        >
            <span
                className={cn(
                    "inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200",
                    checked ? "translate-x-5" : "translate-x-1"
                )}
            />
        </button>
    </div>
));

ProfessionalSwitch.displayName = "ProfessionalSwitch";

export const AdjustmentModal = ({ isOpen, onClose, onUpload }: AdjustmentModalProps) => {
    const [sets, setSets] = useState<AdjustmentSet[]>([
        { id: Math.random().toString(36).substr(2, 9), schemeName: "", schemeMappingColumn: "", schemeMapping: false }
    ]);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [schemeMappingFile, setSchemeMappingFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const schemeMappingInputRef = useRef<HTMLInputElement>(null);

    const handleAddSet = () => {
        setSets(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), schemeName: "", schemeMappingColumn: "", schemeMapping: false }]);
    };

    const handleRemoveSet = (id: string) => {
        if (sets.length > 1) {
            setSets(prev => prev.filter(s => s.id !== id));
        }
    };

    const updateSet = (id: string, updates: Partial<AdjustmentSet>) => {
        setSets(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        if (files.length > 0) {
            setSelectedFile(files[0]);
            toast.success("File attached successfully");
        }
    }, []);

    const handleSchemeMappingFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        if (files.length > 0) {
            setSchemeMappingFile(files[0]);
            toast.success("Scheme mapping file attached successfully");
        }
    }, []);

    const handleRemoveFile = useCallback(() => {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, []);

    const handleSubmit = async () => {
        const validSets = sets.filter(s => s.schemeName.trim());
        if (validSets.length === 0) {
            toast.error("Please enter at least one Scheme Name");
            return;
        }
        if (!selectedFile) {
            toast.error("Please select a supporting file");
            return;
        }

        setIsUploading(true);
        try {
            // Create a dictionary-like structure in the text file
            const dictionary: Record<string, string | string[]> = {};
            validSets.forEach((s) => {
                const key = s.schemeMappingColumn.trim() || `Unknown Column`;
                const value = s.schemeName.trim();
                if (dictionary[key] !== undefined) {
                    dictionary[key] = Array.isArray(dictionary[key])
                        ? [...(dictionary[key] as string[]), value]
                        : [dictionary[key] as string, value];
                } else {
                    dictionary[key] = value;
                }
            });

            const content = JSON.stringify(dictionary, null, 2);
            const generatedFile = new File([content], "manual_mappings.txt", { type: "text/plain" });

            // We use the first valid scheme name as a label for the upload process
            const uploadTasks: Promise<void>[] = [
                onUpload(validSets[0].schemeName, validSets[0].schemeMapping, selectedFile, generatedFile),
            ];

            if (schemeMappingFile) {
                uploadTasks.push(
                    uploadFileToApi(schemeMappingFile, {
                        id: "scheme_mapping_adjustment",
                        name: "Scheme Mapping Adjustment",
                        bucketPath: "scheme_mapping_adjustment",
                        allowedFormats: [],
                        maxSizeInBytes: 0,
                    })
                );
            }

            await Promise.all(uploadTasks);

            setSets([{ id: Math.random().toString(36).substr(2, 9), schemeName: "", schemeMappingColumn: "", schemeMapping: false }]);
            setSelectedFile(null);
            setSchemeMappingFile(null);
            onClose();
        } catch (error) {
            console.error("Adjustment upload failed:", error);
        } finally {
            setIsUploading(false);
        }
    };

    const isStep2Active = true;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !isUploading && !open && onClose()}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
                {/* Clean Header */}
                <div className="bg-slate-50 border-b border-slate-200 p-6 shrink-0">
                    <DialogHeader className="text-left">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-100 rounded-xl text-blue-600">
                                <ClipboardList className="w-6 h-6" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold text-slate-900">
                                    Scheme Adjustments
                                </DialogTitle>
                                <DialogDescription className="text-slate-500 font-medium text-xs mt-0.5">
                                    Enter multiple scheme adjustments and attach a single supporting document
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-slate-200">
                    {/* Sets Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Adjustment Sets</label>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleAddSet}
                                className="h-8 text-blue-600 hover:bg-blue-50 text-xs font-bold gap-1.5 rounded-lg"
                                disabled={isUploading}
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Add Set
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {sets.map((set) => (
                                <div key={set.id} className="relative group bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4 animate-in fade-in slide-in-from-left-2 duration-300">
                                    <div className="flex items-start gap-3">
                                        <div className="flex-1 space-y-2">
                                            <div className="relative">
                                                <Label className="text-xs font-bold text-slate-700">Scheme Name</Label>
                                                <Input
                                                    type="text"
                                                    value={set.schemeName}
                                                    onChange={(e) => updateSet(set.id, { schemeName: e.target.value })}
                                                    placeholder="Scheme Name (e.g. Q4 Loyalty)"
                                                    className="h-10 rounded-lg border-slate-200 bg-white shadow-none transition-all px-3 text-sm font-semibold text-slate-900 focus-visible:ring-blue-600/20 focus-visible:border-blue-600 disabled:bg-slate-50"
                                                    disabled={isUploading}
                                                />
                                                {set.schemeName.trim().length > 0 &&
                                                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                                                }
                                            </div>
                                            <Label className="text-xs font-bold text-slate-700">Scheme Mapping Columns</Label>
                                            <Input
                                                type="text"
                                                value={set.schemeMappingColumn}
                                                onChange={(e) => updateSet(set.id, { schemeMappingColumn: e.target.value })}
                                                placeholder="Scheme Mapping Column"
                                                className="h-10 rounded-lg border-slate-200 bg-white shadow-none transition-all px-3 text-sm font-semibold text-slate-900 focus-visible:ring-blue-600/20 focus-visible:border-blue-600 disabled:bg-slate-50"
                                                disabled={isUploading}
                                            />
                                        </div>
                                        {sets.length > 1 && (
                                            <button
                                                onClick={() => handleRemoveSet(set.id)}
                                                className="p-2 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-lg transition-all"
                                                disabled={isUploading}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* File Upload Section */}
                    <div className="space-y-6 pt-2 border-t border-slate-100">
                        {/* Shared Supporting Document */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 ml-1">
                                Working Adjustment <span className="text-red-500">*</span>
                            </label>
                            {!selectedFile ? (
                                <div
                                    onClick={() => !isUploading && isStep2Active && fileInputRef.current?.click()}
                                    className={cn(
                                        "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200",
                                        isStep2Active
                                            ? "border-blue-200 bg-blue-50/30 hover:bg-blue-50/50 hover:border-blue-400"
                                            : "border-slate-100 bg-slate-50 opacity-50 grayscale cursor-not-allowed"
                                    )}
                                >
                                    <div className={cn(
                                        "p-4 rounded-full transition-all duration-200",
                                        isStep2Active ? "bg-blue-600 text-white shadow-md" : "bg-slate-200 text-slate-400"
                                    )}>
                                        <UploadIcon className="w-6 h-6" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-bold text-slate-900">Click to upload file</p>
                                        <p className="text-[11px] font-medium text-slate-500 mt-1 uppercase tracking-tight">.XLS, .XLSX</p>
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        className="hidden"
                                        disabled={isUploading || !isStep2Active}
                                    />
                                </div>
                            ) : (
                                <div className="flex items-center gap-4 p-5 bg-white rounded-xl border border-blue-200 shadow-sm transition-all animate-in fade-in slide-in-from-bottom-2">
                                    <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-900 truncate">{selectedFile.name}</p>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">{(selectedFile.size / 1024).toFixed(1)} KB • Attached</p>
                                    </div>
                                    <button
                                        onClick={handleRemoveFile}
                                        className="p-2 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-red-600"
                                        disabled={isUploading}
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Scheme Mapping Adjustment */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 ml-1">
                                Scheme Mapping Adjustment <span className="text-slate-400 normal-case font-normal">(optional)</span>
                            </label>
                            {!schemeMappingFile ? (
                                <div
                                    onClick={() => !isUploading && isStep2Active && schemeMappingInputRef.current?.click()}
                                    className={cn(
                                        "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200",
                                        isStep2Active
                                            ? "border-purple-200 bg-purple-50/30 hover:bg-purple-50/50 hover:border-purple-400"
                                            : "border-slate-100 bg-slate-50 opacity-50 grayscale cursor-not-allowed"
                                    )}
                                >
                                    <div className={cn(
                                        "p-4 rounded-full transition-all duration-200",
                                        isStep2Active ? "bg-purple-600 text-white shadow-md" : "bg-slate-200 text-slate-400"
                                    )}>
                                        <UploadIcon className="w-6 h-6" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-bold text-slate-900">Click to upload file</p>
                                        <p className="text-[11px] font-medium text-slate-500 mt-1 uppercase tracking-tight">.XLS, .XLSX</p>
                                    </div>
                                    <input
                                        type="file"
                                        ref={schemeMappingInputRef}
                                        onChange={handleSchemeMappingFileChange}
                                        className="hidden"
                                        disabled={isUploading || !isStep2Active}
                                    />
                                </div>
                            ) : (
                                <div className="flex items-center gap-4 p-5 bg-white rounded-xl border border-purple-200 shadow-sm transition-all animate-in fade-in slide-in-from-bottom-2">
                                    <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-900 truncate">{schemeMappingFile.name}</p>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">{(schemeMappingFile.size / 1024).toFixed(1)} KB • Attached</p>
                                    </div>
                                    <button
                                        onClick={() => { setSchemeMappingFile(null); if (schemeMappingInputRef.current) schemeMappingInputRef.current.value = ""; }}
                                        className="p-2 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-red-600"
                                        disabled={isUploading}
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-slate-50 border-t border-slate-200 p-6 flex items-center justify-between gap-4 shrink-0">
                    <button
                        onClick={onClose}
                        disabled={isUploading}
                        className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isUploading || !selectedFile || !isStep2Active}
                        className={cn(
                            "h-12 px-10 rounded-xl font-bold uppercase tracking-wider text-[10px] transition-all",
                            isUploading || !selectedFile || !isStep2Active
                                ? "bg-slate-200 text-slate-400 shadow-none cursor-not-allowed"
                                : "bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-[0.98]"
                        )}
                    >
                        {isUploading ? (
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Uploading...</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span>Save All Adjustments</span>
                                <ArrowRight className="w-4 h-4" />
                            </div>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
