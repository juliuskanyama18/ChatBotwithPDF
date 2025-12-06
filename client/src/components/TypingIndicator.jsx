import { Sparkles } from 'lucide-react';

export default function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex gap-3 max-w-3xl">
        {/* Avatar */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gray-200">
          <Sparkles className="w-5 h-5 text-primary-600" />
        </div>

        {/* Typing Animation */}
        <div className="bg-gray-100 rounded-2xl px-4 py-3">
          <div className="flex space-x-2">
            <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
