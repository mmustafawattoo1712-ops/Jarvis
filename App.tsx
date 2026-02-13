
import React, { useState, useEffect } from 'react';
import JarvisAssistant from './components/JarvisAssistant';

function App() {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loadingKeyCheck, setLoadingKeyCheck] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkApiKey = async () => {
      try {
        if (typeof window.aistudio !== 'undefined' && typeof window.aistudio.hasSelectedApiKey === 'function') {
          const selected = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(selected);
        } else {
          // If aistudio is not available, assume API_KEY env var is present or handle as an error
          if (process.env.API_KEY) {
            setHasApiKey(true);
          } else {
            setError("AI Studio API key selection not available and process.env.API_KEY is not set. Please ensure you're running in a valid environment.");
            setHasApiKey(false);
          }
        }
      } catch (e) {
        console.error("Error checking API key:", e);
        setError("Failed to check API key status. Ensure the AI Studio environment is configured correctly.");
        setHasApiKey(false);
      } finally {
        setLoadingKeyCheck(false);
      }
    };
    checkApiKey();
  }, []);

  const handleSelectApiKey = async () => {
    setError(null);
    try {
      if (typeof window.aistudio !== 'undefined' && typeof window.aistudio.openSelectKey === 'function') {
        await window.aistudio.openSelectKey();
        // Assume success after opening dialog due to race condition guidance
        setHasApiKey(true);
      } else {
        setError("AI Studio API key selection function is not available.");
      }
    } catch (e) {
      console.error("Error opening API key selection:", e);
      setError("Failed to open API key selection dialog.");
    }
  };

  if (loadingKeyCheck) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100">
        <div className="text-xl animate-pulse">Checking API Key...</div>
      </div>
    );
  }

  if (!hasApiKey && !error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-gray-100 p-4">
        <h1 className="text-4xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
          Welcome to Jarvis AI
        </h1>
        <p className="text-lg text-gray-300 mb-8 text-center max-w-md">
          To use the Jarvis AI, please select your paid Google Cloud API key.
          This enables powerful real-time conversational features.
        </p>
        <button
          onClick={handleSelectApiKey}
          className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-700 text-white font-semibold rounded-lg shadow-lg hover:from-blue-700 hover:to-purple-800 transition duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
        >
          Select API Key
        </button>
        <p className="mt-6 text-sm text-gray-400 text-center max-w-md">
          <a
            href="https://ai.google.dev/gemini-api/docs/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            Learn more about billing for the Gemini API.
          </a>
        </p>
      </div>
    );
  }

  if (error && !hasApiKey) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-red-400 p-4">
        <h1 className="text-4xl font-bold mb-6">Error</h1>
        <p className="text-lg text-center max-w-md mb-8">{error}</p>
        <button
          onClick={handleSelectApiKey}
          className="px-8 py-4 bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold rounded-lg shadow-lg hover:from-red-700 hover:to-red-800 transition duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900"
        >
          Try Select API Key Again
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-900">
      <JarvisAssistant />
    </div>
  );
}

export default App;
