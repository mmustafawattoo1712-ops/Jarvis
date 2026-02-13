
import React from 'react';
import { ChatMessage, Sender } from '../types';

interface TranscriptionDisplayProps {
  messages: ChatMessage[];
  currentPartialTranscription: { user: string; jarvis: string };
  isListening: boolean;
  isSpeaking: boolean;
}

const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({
  messages,
  currentPartialTranscription,
  isListening,
  isSpeaking,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-200px)] custom-scrollbar">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.sender === Sender.USER ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-md p-3 rounded-lg shadow-md ${
              msg.sender === Sender.USER
                ? 'bg-blue-600 text-white'
                : 'bg-gradient-to-br from-indigo-800 to-purple-900 text-purple-100'
            }`}
          >
            <p className="text-sm font-medium">{msg.text}</p>
            <span className="text-xs opacity-75 mt-1 block">
              {msg.timestamp.toLocaleTimeString()}
            </span>
          </div>
        </div>
      ))}
      {currentPartialTranscription.user && (
        <div className="flex justify-end">
          <div className="max-w-md p-3 rounded-lg shadow-md bg-blue-500 text-white animate-pulse">
            <p className="text-sm italic">{currentPartialTranscription.user}...</p>
          </div>
        </div>
      )}
      {currentPartialTranscription.jarvis && (
        <div className="flex justify-start">
          <div className="max-w-md p-3 rounded-lg shadow-md bg-gradient-to-br from-indigo-700 to-purple-800 text-purple-200 animate-pulse">
            <p className="text-sm italic">{currentPartialTranscription.jarvis}...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TranscriptionDisplay;
