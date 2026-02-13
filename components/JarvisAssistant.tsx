
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GeminiLiveService } from '../services/geminiLiveService';
import TranscriptionDisplay from './TranscriptionDisplay';
import { ChatMessage, Sender } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface JarvisAssistantProps {
  systemInstruction?: string;
}

const JarvisAssistant: React.FC<JarvisAssistantProps> = ({
  systemInstruction = "You are Jarvis, a helpful, intelligent, and sophisticated AI assistant. You respond concisely and always address the user as 'Sir' or 'Madam' based on your assessment of their voice, or politely as 'User' if unsure. Your primary function is to engage in conversation and assist with information.",
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // Indicates if Jarvis is generating or playing audio
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentPartialTranscription, setCurrentPartialTranscription] = useState<{ user: string; jarvis: string }>({ user: '', jarvis: '' });

  const liveServiceRef = useRef<GeminiLiveService | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const outputGainNodeRef = useRef<GainNode | null>(null);
  const nextOutputStartTimeRef = useRef<number>(0);
  const playingSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Initialize GeminiLiveService once
  useEffect(() => {
    liveServiceRef.current = new GeminiLiveService();
    liveServiceRef.current.setTranscriptionEnabled(true);

    // FIX: Use standard AudioContext, webkitAudioContext is deprecated.
    outputAudioContextRef.current = new window.AudioContext({
      sampleRate: 24000
    });
    outputGainNodeRef.current = outputAudioContextRef.current.createGain();
    outputGainNodeRef.current.connect(outputAudioContextRef.current.destination);

    return () => {
      // Cleanup on unmount
      liveServiceRef.current?.stopSession();
      playingSourcesRef.current.forEach(source => source.stop());
      playingSourcesRef.current.clear();
      outputAudioContextRef.current?.close().catch(e => console.error("Error closing output audio context on unmount", e));
    };
  }, []);

  const handleTranscriptionUpdate = useCallback((sender: 'user' | 'jarvis', text: string, isFinal: boolean) => {
    if (isFinal) {
      setMessages((prev) => [
        ...prev,
        { id: uuidv4(), sender: sender === 'user' ? Sender.USER : Sender.JARVIS, text, timestamp: new Date() },
      ]);
      setCurrentPartialTranscription((prev) => ({ ...prev, [sender]: '' }));
    } else {
      setCurrentPartialTranscription((prev) => ({ ...prev, [sender]: text }));
    }
  }, []);

  const handleAudioChunk = useCallback(async (base64Audio: string): Promise<void> => {
    if (!outputAudioContextRef.current || !outputGainNodeRef.current) return;

    setIsSpeaking(true); // Indicate Jarvis is speaking

    nextOutputStartTimeRef.current = Math.max(nextOutputStartTimeRef.current, outputAudioContextRef.current.currentTime);

    try {
      const { decode, decodeAudioData } = await import('../services/audioUtils');
      const audioBuffer = await decodeAudioData(
        decode(base64Audio),
        outputAudioContextRef.current,
        24000, // Output sample rate from Live API
        1,
      );
      const source = outputAudioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputGainNodeRef.current);
      source.addEventListener('ended', () => {
        playingSourcesRef.current.delete(source);
        if (playingSourcesRef.current.size === 0) {
          setIsSpeaking(false); // No more audio chunks playing
        }
      });

      source.start(nextOutputStartTimeRef.current);
      nextOutputStartTimeRef.current = nextOutputStartTimeRef.current + audioBuffer.duration;
      playingSourcesRef.current.add(source);
    } catch (err) {
      console.error("Error decoding or playing audio:", err);
      setIsSpeaking(false);
      setError("Error playing audio response.");
    }
  }, []);

  const handleSessionClose = useCallback((event: CloseEvent) => {
    console.log("Session closed:", event);
    setIsListening(false);
    setIsSpeaking(false);
    setError(`Session closed unexpectedly: ${event.code} - ${event.reason}`);
  }, []);

  const handleSessionError = useCallback((event: Event) => {
    console.error("Session error:", event);
    setIsListening(false);
    setIsSpeaking(false);
    setError("An error occurred during the session.");
  }, []);

  const startListening = async () => {
    if (isListening) return;

    setError(null);
    nextOutputStartTimeRef.current = 0; // Reset for new session
    playingSourcesRef.current.forEach(source => source.stop());
    playingSourcesRef.current.clear();
    setIsSpeaking(false);

    try {
      await liveServiceRef.current?.startSession(
        {
          onTranscriptionUpdate: handleTranscriptionUpdate,
          onAudioChunk: handleAudioChunk,
          onClose: handleSessionClose,
          onError: handleSessionError,
        },
        systemInstruction
      );
      setIsListening(true);
    } catch (e) {
      console.error("Failed to start session:", e);
      setError("Failed to start microphone or AI session. Please check permissions.");
    }
  };

  const stopListening = () => {
    liveServiceRef.current?.stopSession();
    setIsListening(false);
    setIsSpeaking(false);
    playingSourcesRef.current.forEach(source => source.stop());
    playingSourcesRef.current.clear();
    nextOutputStartTimeRef.current = 0;
    setCurrentPartialTranscription({ user: '', jarvis: '' }); // Clear any partial transcriptions
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-2xl bg-gray-800 rounded-lg shadow-2xl overflow-hidden p-6 relative">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
          Jarvis AI
        </h1>
        <button
          onClick={() => setMessages([])}
          className="px-4 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
          title="Clear Chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="bg-red-700 text-white p-3 rounded-md mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      <TranscriptionDisplay
        messages={messages}
        currentPartialTranscription={currentPartialTranscription}
        isListening={isListening}
        isSpeaking={isSpeaking}
      />

      <div className="sticky bottom-0 bg-gray-800 p-4 pt-6 flex justify-center items-center mt-auto border-t border-gray-700">
        <button
          onClick={toggleListening}
          className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 transform
            ${isListening || isSpeaking
              ? 'bg-gradient-to-br from-red-500 to-red-700 scale-110 shadow-lg ring-4 ring-red-400'
              : 'bg-gradient-to-br from-blue-600 to-purple-800 hover:scale-105 hover:shadow-lg ring-4 ring-gray-600'
            }
            focus:outline-none focus:ring-offset-2 focus:ring-offset-gray-900
          `}
          title={isListening ? 'Stop Jarvis' : 'Start Jarvis'}
        >
          {isListening ? (
            <div className="flex space-x-1">
              <span className="block w-2 h-8 bg-white rounded-full animate-pulse-mic"></span>
              <span className="block w-2 h-10 bg-white rounded-full animate-pulse-mic delay-100"></span>
              <span className="block w-2 h-6 bg-white rounded-full animate-pulse-mic delay-200"></span>
            </div>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-10 w-10 ${isSpeaking ? 'text-red-200' : 'text-white'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a7 7 0 01-7-7m7 7a7 7 0 007-7m-7 7V7m0 0a7 7 0 007 7m-7-7v4m0 0H8m4 0h4m-4-8a7 7 0 01-7-7m7 7a7 7 0 007-7"
              />
            </svg>
          )}
          {isListening && !isSpeaking && (
            <span className="absolute -bottom-6 text-sm text-blue-300 animate-pulse">Listening...</span>
          )}
          {isSpeaking && (
            <span className="absolute -bottom-6 text-sm text-red-300 animate-pulse">Jarvis Speaking...</span>
          )}
        </button>
      </div>
    </div>
  );
};

export default JarvisAssistant;
