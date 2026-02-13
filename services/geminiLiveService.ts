
import { GoogleGenAI, Modality, LiveServerMessage, LiveSession } from "@google/genai";
import { createPcmBlob, decode, decodeAudioData } from './audioUtils';

interface LiveSessionCallbacks {
  onTranscriptionUpdate: (sender: 'user' | 'jarvis', text: string, isFinal: boolean) => void;
  onAudioChunk: (base64Audio: string) => Promise<void>;
  onClose: (event: CloseEvent) => void;
  onError: (event: Event) => void;
}

const INPUT_AUDIO_SAMPLE_RATE = 16000;
const OUTPUT_AUDIO_SAMPLE_RATE = 24000;
const AUDIO_CHUNK_SIZE = 4096; // ScriptProcessorNode buffer size

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<LiveSession> | null = null;
  private mediaStream: MediaStream | null = null;
  private inputAudioContext: AudioContext | null = null;
  private scriptProcessorNode: ScriptProcessorNode | null = null;
  private inputSourceNode: MediaStreamAudioSourceNode | null = null;
  private currentInputTranscription: string = '';
  private currentOutputTranscription: string = '';
  private outputAudioContext: AudioContext | null = null; // Separate context for playback
  private outputGainNode: GainNode | null = null;
  private nextOutputStartTime: number = 0;
  private playingSources: Set<AudioBufferSourceNode> = new Set();
  private isTranscriptionEnabled: boolean = false;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  public async startSession(callbacks: LiveSessionCallbacks, systemInstruction: string) {
    if (this.sessionPromise) {
      console.warn("Session already active.");
      return;
    }

    try {
      // FIX: Use standard AudioContext, webkitAudioContext is deprecated.
      this.outputAudioContext = new window.AudioContext({
        sampleRate: OUTPUT_AUDIO_SAMPLE_RATE
      });
      this.outputGainNode = this.outputAudioContext.createGain();
      this.outputGainNode.connect(this.outputAudioContext.destination);

      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            console.log("Gemini Live session opened.");
            this.startMicrophone(this.sessionPromise as Promise<LiveSession>);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (this.isTranscriptionEnabled) {
              this.handleTranscription(message, callbacks);
            }
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              await this.handleAudioPlayback(message.serverContent.modelTurn.parts[0].inlineData.data);
            }

            if (message.serverContent?.interrupted) {
              console.log("Audio interrupted, stopping current playback.");
              this.stopAllPlaybackSources();
              this.nextOutputStartTime = 0; // Reset start time for next playback
            }
          },
          onerror: (e: Event) => {
            console.error("Gemini Live session error:", e);
            callbacks.onError(e);
            this.cleanup();
          },
          onclose: (e: CloseEvent) => {
            console.log("Gemini Live session closed:", e);
            callbacks.onClose(e);
            this.cleanup();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: systemInstruction,
          outputAudioTranscription: {}, // Enable transcription for model output
          inputAudioTranscription: {}, // Enable transcription for user input
        },
      });

      await this.sessionPromise; // Wait for the session to connect
    } catch (error) {
      console.error("Error starting Gemini Live session:", error);
      callbacks.onError(error as Event);
      this.cleanup();
      this.sessionPromise = null;
    }
  }

  public async stopSession() {
    if (this.sessionPromise) {
      const session = await this.sessionPromise;
      session.close();
      this.sessionPromise = null;
      this.cleanup();
    }
  }

  public setTranscriptionEnabled(enabled: boolean) {
    this.isTranscriptionEnabled = enabled;
  }

  private async startMicrophone(sessionPromise: Promise<LiveSession>) {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // FIX: Use standard AudioContext, webkitAudioContext is deprecated.
      this.inputAudioContext = new window.AudioContext({
        sampleRate: INPUT_AUDIO_SAMPLE_RATE
      });
      this.inputSourceNode = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(AUDIO_CHUNK_SIZE, 1, 1);

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
        const pcmBlob = createPcmBlob(inputData, INPUT_AUDIO_SAMPLE_RATE);
        sessionPromise.then((session) => {
          session.sendRealtimeInput({ media: pcmBlob });
        }).catch(err => console.error("Error sending audio to session:", err));
      };

      this.inputSourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);
      console.log("Microphone started and streaming to Gemini Live.");
    } catch (error) {
      console.error("Error accessing microphone:", error);
      // Handle microphone access error, e.g., prompt user
      if (this.sessionPromise) {
        this.sessionPromise.then(session => session.close());
      }
    }
  }

  private handleTranscription(message: LiveServerMessage, callbacks: LiveSessionCallbacks) {
    if (message.serverContent?.inputTranscription) {
      const text = message.serverContent.inputTranscription.text;
      this.currentInputTranscription += text;
      callbacks.onTranscriptionUpdate('user', this.currentInputTranscription, !message.serverContent.inputTranscription.isPartial);
      if (!message.serverContent.inputTranscription.isPartial) {
        this.currentInputTranscription = ''; // Clear after final
      }
    }
    if (message.serverContent?.outputTranscription) {
      const text = message.serverContent.outputTranscription.text;
      this.currentOutputTranscription += text;
      callbacks.onTranscriptionUpdate('jarvis', this.currentOutputTranscription, !message.serverContent.outputTranscription.isPartial);
      if (!message.serverContent.outputTranscription.isPartial) {
        this.currentOutputTranscription = ''; // Clear after final
      }
    }
  }

  private async handleAudioPlayback(base64Audio: string) {
    if (!this.outputAudioContext || !this.outputGainNode) return;

    this.nextOutputStartTime = Math.max(this.nextOutputStartTime, this.outputAudioContext.currentTime);

    try {
      const audioBuffer = await decodeAudioData(
        decode(base64Audio),
        this.outputAudioContext,
        OUTPUT_AUDIO_SAMPLE_RATE,
        1,
      );
      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputGainNode);
      source.addEventListener('ended', () => {
        this.playingSources.delete(source);
      });

      source.start(this.nextOutputStartTime);
      this.nextOutputStartTime = this.nextOutputStartTime + audioBuffer.duration;
      this.playingSources.add(source);
    } catch (error) {
      console.error("Error decoding or playing audio:", error);
    }
  }

  private stopAllPlaybackSources() {
    for (const source of this.playingSources.values()) {
      source.stop();
    }
    this.playingSources.clear();
  }

  private cleanup() {
    this.stopAllPlaybackSources();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.scriptProcessorNode) {
      this.scriptProcessorNode.disconnect();
      this.scriptProcessorNode.onaudioprocess = null;
      this.scriptProcessorNode = null;
    }
    if (this.inputSourceNode) {
      this.inputSourceNode.disconnect();
      this.inputSourceNode = null;
    }
    if (this.inputAudioContext) {
      this.inputAudioContext.close().catch(err => console.error("Error closing input audio context:", err));
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      this.outputAudioContext.close().catch(err => console.error("Error closing output audio context:", err));
      this.outputAudioContext = null;
    }
    this.outputGainNode = null;
    this.nextOutputStartTime = 0;
    this.currentInputTranscription = '';
    this.currentOutputTranscription = '';
    this.isTranscriptionEnabled = false; // Reset state
  }
}
