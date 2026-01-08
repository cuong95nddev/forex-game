import { Loader2 } from 'lucide-react';

interface BlockingLoaderProps {
  isLoading: boolean;
  message?: string;
}

export const BlockingLoader = ({ isLoading, message = "Connecting to Exchange..." }: BlockingLoaderProps) => {
  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b0f13]/90 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
        <div className="relative">
          <div className="absolute inset-0 bg-[#f59e0b] blur-xl opacity-20 rounded-full animate-pulse"></div>
          <Loader2 className="w-12 h-12 text-[#f59e0b] animate-spin relative z-10" />
        </div>
        <div className="text-white font-bold text-lg tracking-wider uppercase">
          {message}
        </div>
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#1e293b] animate-bounce [animation-delay:-0.3s]"></div>
          <div className="w-2 h-2 rounded-full bg-[#f59e0b] animate-bounce [animation-delay:-0.15s]"></div>
          <div className="w-2 h-2 rounded-full bg-[#1e293b] animate-bounce"></div>
        </div>
      </div>
    </div>
  );
};
