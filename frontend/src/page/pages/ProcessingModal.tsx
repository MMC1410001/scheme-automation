import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2, FileText, Check, XCircle, AlertTriangle, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { UploadSlot } from '../../config/upload-slots';

type StepStatus = 'idle' | 'loading' | 'success' | 'error';

interface ProcessStep {
    id: string;
    label: string;
    status: StepStatus;
}

interface FileProcessState {
    slotId: string;
    fileName: string;
    fileSize: number;
    currentStepIndex: number;
    steps: ProcessStep[];
    overallStatus: 'pending' | 'processing' | 'completed' | 'failed';
    errorMessage?: string;
}

interface ProcessModalProps {
    isOpen: boolean;
    onClose: () => void;
    filesToDisplay: { slot: UploadSlot; file: File }[];
    onProcessFile: (file: File, slot: UploadSlot, moduleType?: "revised" | "normal", showToast?: boolean) => Promise<boolean>;
    onComplete: () => void;
}

export const ProcessModal = ({ isOpen, onClose, filesToDisplay, onProcessFile, onComplete }: ProcessModalProps) => {
    const [fileStates, setFileStates] = useState<FileProcessState[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAllComplete, setIsAllComplete] = useState(false);

    const hasFailures = fileStates.some(fs => fs.overallStatus === 'failed');

    // Retry handler for failed uploads
    const handleRetry = () => {
        // Reset failed files to pending status
        setFileStates(prev => prev.map(fs => {
            if (fs.overallStatus === 'failed') {
                return {
                    ...fs,
                    currentStepIndex: -1,
                    overallStatus: 'pending' as const,
                    errorMessage: undefined,
                    steps: fs.steps.map(step => ({ ...step, status: 'idle' as const }))
                };
            }
            return fs;
        }));
        // Reset to start processing from the first failed file
        const firstFailedIndex = fileStates.findIndex(fs => fs.overallStatus === 'failed');
        if (firstFailedIndex !== -1) {
            setCurrentIndex(firstFailedIndex);
            setIsAllComplete(false);
        }
    };

    // Initialize state when modal opens
    useEffect(() => {
        if (isOpen && filesToDisplay.length > 0) {
            const initialStates: FileProcessState[] = filesToDisplay.map(item => ({
                slotId: item.slot.id,
                fileName: item.file?.name || "Unknown File",
                fileSize: item.file?.size || 0,
                currentStepIndex: -1, // Not started
                overallStatus: 'pending',
                steps: [
                    { id: 'ready', label: 'Ready', status: 'idle' },
                    { id: 'validating', label: 'Validating', status: 'idle' },
                    { id: 'process', label: 'Processing', status: 'idle' },
                    { id: 'upload', label: 'Uploading', status: 'idle' },
                ]
            }));
            setFileStates(initialStates);
            setCurrentIndex(0);
            setIsAllComplete(false);
        }
    }, [isOpen, filesToDisplay]);

    // Processor Effect
    useEffect(() => {
        if (!isOpen || currentIndex >= fileStates.length) {
            if (isOpen && currentIndex > 0 && currentIndex === fileStates.length && !isAllComplete) {
                setIsAllComplete(true);
                onComplete();
            }
            return;
        }

        const currentFileState = fileStates[currentIndex];

        if (currentFileState.overallStatus !== 'pending') return;

        const processSteps = async () => {
            updateFileState(currentIndex, { overallStatus: 'processing', currentStepIndex: 0 });

            try {
                // Determine delays for simulation
                const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

                // Step 1: Ready
                updateStepStatus(currentIndex, 0, 'loading');
                await delay(300);
                updateStepStatus(currentIndex, 0, 'success');

                // Step 2: Validating
                updateFileState(currentIndex, { currentStepIndex: 1 });
                updateStepStatus(currentIndex, 1, 'loading');
                await delay(600);
                updateStepStatus(currentIndex, 1, 'success');

                // Step 3: Process
                updateFileState(currentIndex, { currentStepIndex: 2 });
                updateStepStatus(currentIndex, 2, 'loading');
                await delay(800);
                updateStepStatus(currentIndex, 2, 'success');

                // Step 4: Upload
                updateFileState(currentIndex, { currentStepIndex: 3 });
                updateStepStatus(currentIndex, 3, 'loading');

                const { file, slot } = filesToDisplay[currentIndex];
                const success = await onProcessFile(file, slot, undefined, false);

                if (success) {
                    updateStepStatus(currentIndex, 3, 'success');
                    updateFileState(currentIndex, { overallStatus: 'completed' });
                } else {
                    console.error(`✗ Failed to process: ${file.name}`);
                    updateStepStatus(currentIndex, 3, 'error');
                    updateFileState(currentIndex, { overallStatus: 'failed', errorMessage: 'Upload failed' });
                }

            } catch (error) {
                console.error(`Process error for ${filesToDisplay[currentIndex]?.file?.name}:`, error);
                updateFileState(currentIndex, { overallStatus: 'failed', errorMessage: 'Unexpected error' });
            } finally {
                setCurrentIndex(prev => prev + 1);
            }
        };

        processSteps();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentIndex, isOpen, fileStates]);

    const updateFileState = (index: number, updates: Partial<FileProcessState>) => {
        setFileStates(prev => {
            const newStates = [...prev];
            newStates[index] = { ...newStates[index], ...updates };
            return newStates;
        });
    };

    const updateStepStatus = (fileIndex: number, stepIndex: number, status: StepStatus) => {
        setFileStates(prev => {
            const newStates = [...prev];
            const newSteps = [...newStates[fileIndex].steps];
            newSteps[stepIndex] = { ...newSteps[stepIndex], status };
            newStates[fileIndex] = { ...newStates[fileIndex], steps: newSteps };
            return newStates;
        });
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    };

    const totalProgress = fileStates.length > 0
        ? ((currentIndex + (fileStates[currentIndex]?.currentStepIndex > 0 ? (fileStates[currentIndex].currentStepIndex / 4) : 0)) / fileStates.length) * 100
        : 0;

    return (
        <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && isAllComplete ? onClose() : null}>
            <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto p-6">
                <DialogHeader className="border-b pb-4">
                    <DialogTitle className="text-xl font-bold flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {isAllComplete ? (
                                hasFailures ? (
                                    <span className="text-orange-600 flex items-center gap-2">
                                        <AlertTriangle className="w-6 h-6" /> Completed with Errors
                                    </span>
                                ) : (
                                    <span className="text-green-600 flex items-center gap-2">
                                        <CheckCircle2 className="w-6 h-6" /> {fileStates.length > 1 ? 'Batch Processing Complete' : 'Processing Complete'}
                                    </span>
                                )
                            ) : (
                                <span className="flex items-center gap-2 text-slate-800">
                                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" /> Processing Files...
                                </span>
                            )}
                        </div>
                        <span className={cn(
                            "text-sm font-normal px-3 py-1 rounded-full",
                            isAllComplete && hasFailures ? "bg-orange-100 text-orange-700" : "text-slate-500 bg-slate-100"
                        )}>
                            {isAllComplete ? filesToDisplay.length : Math.max(0, currentIndex)}/{filesToDisplay.length} Processed
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Overall Progress Bar */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-semibold uppercase text-slate-500 tracking-wider">
                            <span>Overall Progress</span>
                            <span>{Math.round(isAllComplete ? 100 : totalProgress)}%</span>
                        </div>
                        <ProgressBar
                            value={isAllComplete ? 100 : totalProgress}
                            className="h-2 bg-slate-100"
                            style={{
                                '--progress-background': `hsl(${Math.min(120, (isAllComplete ? 100 : totalProgress) * 1.2)}, 75%, 45%)`,
                            } as React.CSSProperties}
                            indicatorClassName="bg-[var(--progress-background)] transition-colors duration-500"
                        />
                    </div>

                    {/* Files List Table-like Structure */}
                    <div className="border rounded-xl overflow-hidden bg-white shadow-sm ring-1 ring-slate-200">
                        {/* Header Row */}
                        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b text-xs font-semibold uppercase tracking-wider text-slate-500 text-center">
                            <div className="col-span-6">File Details</div>
                            <div className="col-span-6">Process Steps</div>
                        </div>

                        {/* File Rows */}
                        <div className="divide-y divide-slate-100">
                            {fileStates.map((fileState) => {
                                const fileProgress = fileState.overallStatus === 'completed' ? 100 :
                                    fileState.overallStatus === 'failed' ? 0 :
                                        Math.max(5, (fileState.currentStepIndex + 1) * 25);

                                return (
                                    <div
                                        key={fileState.slotId}
                                        className={cn(
                                            "grid grid-cols-12 gap-4 px-6 py-4 items-center transition-colors duration-300",
                                            fileState.overallStatus === 'processing' ? "bg-blue-50/40" : "bg-white"
                                        )}
                                    >
                                        {/* File Info & Progress */}
                                        <div className="col-span-6 min-w-0 space-y-3">
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 bg-slate-100 rounded-lg text-slate-500 mt-1">
                                                    <FileText className="w-4 h-4" />
                                                </div>
                                                <div className="min-w-0 flex flex-col">
                                                    <p className="font-semibold text-slate-900 truncate" title={fileState.fileName}>
                                                        {fileState.fileName}
                                                        <span className="text-xs text-slate-500"> - {formatSize(fileState.fileSize)}</span>
                                                    </p>
                                                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                                        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                                                            {filesToDisplay.find(f => f.slot.id === fileState.slotId)?.slot.name}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Individual File Progress */}
                                            <div>
                                                <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                                                    <span>Progress</span>
                                                    <span>{fileProgress}%</span>
                                                </div>
                                                <ProgressBar
                                                    value={fileProgress}
                                                    className="h-1.5 bg-slate-100"
                                                    indicatorClassName={fileState.overallStatus === 'completed' ? "bg-green-600" : undefined}
                                                />
                                            </div>
                                        </div>

                                        {/* Steps - Horizontal */}
                                        <div className="col-span-6 flex items-center justify-center flex-col gap-3">
                                            {/* Step Circles Row */}
                                            <div className="flex items-center justify-between relative px-2 w-full">
                                                {/* Connector Line */}
                                                <div className="absolute left-8 right-8 top-[11px] h-0.5 bg-slate-100 -z-10" />

                                                {fileState.steps.map((step) => (
                                                    <div key={step.id} className="flex flex-col items-center gap-1.5 bg-transparent flex-1">
                                                        <div className={cn(
                                                            "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-300 z-10 bg-white",
                                                            step.status === 'success' ? "bg-green-600 border-green-600 text-white" :
                                                                step.status === 'loading' ? "border-blue-600 border-t-transparent animate-spin" :
                                                                    step.status === 'error' ? "border-red-500 text-red-500" :
                                                                        "border-slate-200 text-slate-300"
                                                        )}>
                                                            {step.status === 'success' && <Check className="w-3.5 h-3.5" />}
                                                            {step.status === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
                                                            {step.status === 'error' && <XCircle className="w-3.5 h-3.5" />}
                                                            {step.status === 'idle' && <Circle className="w-2 h-2 fill-current" />}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Current Step Label - Single, Below All Circles */}
                                            <div className="text-center">
                                                <span className={cn(
                                                    "text-sm font-semibold transition-colors duration-300",
                                                    fileState.overallStatus === 'completed' ? "text-green-600" :
                                                        fileState.overallStatus === 'failed' ? "text-red-500" :
                                                            fileState.overallStatus === 'processing' ? "text-blue-600" :
                                                                "text-slate-500"
                                                )}>
                                                    {fileState.overallStatus === 'completed' ? 'Uploaded' :
                                                        fileState.overallStatus === 'failed' ? 'Failed' :
                                                            fileState.overallStatus === 'processing' && fileState.currentStepIndex >= 0 ?
                                                                fileState.steps[fileState.currentStepIndex]?.label :
                                                                'Pending'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    {isAllComplete && (
                        <div className="flex gap-2 pt-2 border-t">
                            <button
                                onClick={handleRetry}
                                disabled={!hasFailures}
                                className={cn(
                                    "flex-1 justify-center p-2 rounded-lg transition-all font-medium flex items-center gap-2 shadow-lg",
                                    hasFailures
                                        ? "bg-red-500 text-white hover:bg-red-600 shadow-red-900/10 cursor-pointer"
                                        : "bg-slate-50 cursor-not-allowed border-1 border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-500 hover:border-slate-300 "
                                )}
                            >
                                <RotateCcw className="w-4 h-4" />
                                Retry
                            </button>
                            <button
                                onClick={onClose}
                                className="flex-1 bg-slate-100 border-1 justify-center p-2 rounded-lg hover:bg-slate-200 transition-all font-medium flex items-center gap-2 shadow-lg shadow-slate-900/10 cursor-pointer"
                            >
                                Close Window
                            </button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog >
    );
};
