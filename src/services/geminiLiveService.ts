import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";

export interface LiveSessionCallbacks {
  onTranscription?: (text: string, role: 'user' | 'model') => void;
  onAudioData?: (base64Audio: string) => void;
  onInterrupted?: () => void;
  onUsageUpdate?: (usage: { promptTokens: number; candidatesTokens: number; totalTokens: number }) => void;
  onToolCall?: (toolCall: any) => void;
  onError?: (error: any) => void;
  onClose?: () => void;
  onDebugLog?: (message: string) => void;
}

export interface LiveSessionConfig {
  systemInstruction?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  thinkingLevel?: 'HIGH' | 'LOW' | 'MINIMAL';
  voiceName?: string;
}

export class GeminiLiveService {
  private sessionPromise: Promise<any> | null = null;
  private session: any = null;
  private isSetupComplete = false;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  constructor() {
  }

  async connect(callbacks: LiveSessionCallbacks, config: LiveSessionConfig) {
    this.isSetupComplete = false;
    try {
      const env = (import.meta as any).env || {};
      const envKeys = Object.keys(env).filter(k => k.includes('API') || k.includes('KEY') || k.includes('GEMINI'));
      callbacks.onDebugLog?.(`Detected Env Keys: ${envKeys.join(', ')}`);

      let apiKey = (process.env as any).GEMINI_API_KEY || 
                   (process.env as any).GOOGLE_API_KEY ||
                   env.VITE_GEMINI_API_KEY;
      
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        apiKey = (process.env as any).API_KEY;
      }

      const maskedKey = apiKey ? `${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}` : 'Missing';
      callbacks.onDebugLog?.(`API Key: ${maskedKey}`);
      
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        callbacks.onDebugLog?.("Warning: No valid API key found. Using system default if available.");
      }
      
      const ai = new GoogleGenAI({ apiKey: apiKey || "" });
      callbacks.onDebugLog?.("Connecting to gemini-3.1-flash-live-preview...");
      
      this.sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: () => {
            console.log("Live session opened successfully");
            callbacks.onDebugLog?.("Live session opened successfully");
          },
          onmessage: async (message: LiveServerMessage) => {
            const keys = Object.keys(message);
            
            if ((message as any).error) {
              callbacks.onDebugLog?.(`Server Error: ${JSON.stringify((message as any).error)}`);
            }

            if (message.setupComplete) {
              this.isSetupComplete = true;
              callbacks.onDebugLog?.("Setup complete received!");
            }

            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  callbacks.onAudioData?.(part.inlineData.data);
                }
                if (part.text) {
                  callbacks.onTranscription?.(part.text, 'model');
                }
              }
            }

            if (message.serverContent?.inputTranscription?.text) {
              callbacks.onTranscription?.(message.serverContent.inputTranscription.text, 'user');
            }
            
            if (message.serverContent?.outputTranscription?.text) {
              callbacks.onTranscription?.(message.serverContent.outputTranscription.text, 'model');
            }

            if (message.serverContent?.interrupted) {
              callbacks.onInterrupted?.();
            }

            if (message.toolCall) {
              callbacks.onToolCall?.(message.toolCall);
            }

            if (message.usageMetadata) {
              callbacks.onUsageUpdate?.({
                promptTokens: message.usageMetadata.promptTokenCount || 0,
                candidatesTokens: message.usageMetadata.responseTokenCount || 0,
                totalTokens: message.usageMetadata.totalTokenCount || 0
              });
            }
          },
          onerror: (error: any) => {
            console.error("Live session error:", error);
            const errorMsg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
            callbacks.onDebugLog?.(`Error: ${errorMsg}`);
            if (error?.stack) console.error(error.stack);
            callbacks.onError?.(error);
          },
          onclose: (event?: any) => {
            console.log("Live session closed", event);
            const reason = event?.reason || "No reason provided";
            const code = event?.code || "No code";
            callbacks.onDebugLog?.(`Live session closed: ${reason} (Code: ${code})`);
            callbacks.onClose?.();
          }
        },
        config: {
          systemInstruction: config.systemInstruction,
          responseModalities: ["AUDIO" as any],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: (config.voiceName || "Aoede") as any } }
          },
          generationConfig: {
            temperature: config.temperature,
            topP: config.topP,
            topK: config.topK,
            thinkingConfig: config.thinkingLevel ? { thinkingLevel: config.thinkingLevel as any } : undefined
          },
          tools: [
            {
              functionDeclarations: [
                {
                  name: "capture_idea",
                  description: "Captures a significant idea, theme, or consolidated thought directly into the 'Captured Ideas' log. MUST only be called after you have asked the user and they have verbally confirmed they want to save it.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      idea: {
                        type: Type.STRING,
                        description: "The idea or thought to capture."
                      }
                    },
                    required: ["idea"]
                  }
                }
              ]
            }
          ]
        },
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Connection timeout after 15 seconds")), 15000)
      );

      this.session = await Promise.race([this.sessionPromise, timeoutPromise]);
      callbacks.onDebugLog?.("Session object acquired");
      return this.session;
    } catch (error) {
      console.error("Failed to connect to Live API:", error);
      throw error;
    }
  }

  private lastAudioLogTime = 0;

  sendAudio(base64Data: string) {
    if (this.sessionPromise && this.isSetupComplete) {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({
          audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
        });
      });
    }
  }

  private lastVideoFrameTime = 0;

  sendVideoFrame(base64Data: string) {
    if (this.sessionPromise && this.isSetupComplete) {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({
          video: { data: base64Data, mimeType: 'image/jpeg' }
        });
      });
    }
  }

  sendText(text: string) {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({ text });
      });
    }
  }

  sendToolResponse(toolResponse: any) {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        session.sendToolResponse(toolResponse);
      });
    }
  }

  disconnect() {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
    this.sessionPromise = null;
    this.stopAudioCapture();
  }

  private stopAudioCapture() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
