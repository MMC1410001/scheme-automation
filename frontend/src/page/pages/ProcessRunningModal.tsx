import { Loader2, Mail, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ProcessResult = "completed" | null;

interface ProcessRunningModalProps {
    isOpen: boolean;
    moduleType: "normal" | "revised" | null;
    result: ProcessResult;
    onClose: () => void;
}

export const ProcessRunningModal = ({ isOpen, moduleType, result, onClose }: ProcessRunningModalProps) => {
    if (!isOpen) return null;

    const moduleName = moduleType === "revised" ? "Revised Gross Sales Revenue" : "Gross Sales Revenue";

    if (result === "completed") {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full mx-4 flex flex-col items-center gap-6 text-center">
                    <div className="w-20 h-20 rounded-full bg-slate-50 border-4 border-slate-200 flex items-center justify-center">
                        <Bell className="w-10 h-10 text-slate-500" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-xl font-bold text-slate-800">Process Finished</h2>
                        <p className="text-slate-500 text-sm">
                            <span className="font-semibold text-slate-700">{moduleName}</span> automation has finished running.
                        </p>
                    </div>
                    <p className="text-sm text-slate-500">Check your email for the result — success or failure details will be in your inbox.</p>
                    <Button onClick={onClose} className="w-full bg-slate-700 hover:bg-slate-800 text-white">
                        Close
                    </Button>
                </div>
            </div>
        );
    }

    // Running state
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full mx-4 flex flex-col items-center gap-6 text-center">
                <div className="relative flex items-center justify-center">
                    <span className="absolute inline-flex h-24 w-24 rounded-full bg-blue-100 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-20 w-20 rounded-full bg-blue-50 border-4 border-blue-200 items-center justify-center">
                        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                    </span>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-bold text-slate-800">Process Running</h2>
                    <p className="text-slate-500 text-sm">
                        <span className="font-semibold text-blue-600">{moduleName}</span> automation is currently in progress.
                    </p>
                </div>

                <div className="w-full bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 flex items-start gap-3 text-left">
                    <Mail className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-600">
                        You will receive an email once the process finishes. You can safely leave this page.
                    </p>
                </div>

                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ animation: "progress 2s ease-in-out infinite" }} />
                </div>

                <p className="text-xs text-slate-400">This may take several minutes to hours depending on data size.</p>
            </div>

            <style>{`
                @keyframes progress {
                    0% { width: 0%; margin-left: 0%; }
                    50% { width: 70%; margin-left: 15%; }
                    100% { width: 0%; margin-left: 100%; }
                }
            `}</style>
        </div>
    );
};
