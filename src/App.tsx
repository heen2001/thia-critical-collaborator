import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Brain, 
  Play,
  Square,
  Terminal,
  MessageSquare,
  Video,
  VideoOff,
  RotateCcw,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Move,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Send,
  Cpu,
  Trash2,
  MoreHorizontal,
  Lightbulb,
  Download,
  ExternalLink,
  FlipHorizontal,
  Menu,
  Aperture,
  StickyNote,
  Sun,
  Moon,
  SwitchCamera,
  CirclePlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { GeminiLiveService } from './services/geminiLiveService';
import { Document, Packer, Paragraph, TextRun, ImageRun } from 'docx';
import { saveAs } from 'file-saver';
import systemInstructionMarkdown from './prompts/thia_system_instruction.md?raw';
import { floatTo16BitPCM, arrayBufferToBase64 } from './lib/audioUtils';

import * as mammoth from 'mammoth/mammoth.browser';
import * as pdfjsLib from 'pdfjs-dist';

// Safe worker loading for Vite
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

// Inline resample function since it's missing from audioUtils
function resample(audioBuffer: Float32Array, targetSampleRate: number, currentSampleRate: number) {
  if (targetSampleRate === currentSampleRate) return audioBuffer;
  const ratio = currentSampleRate / targetSampleRate;
  const newLength = Math.round(audioBuffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    if (index + 1 < audioBuffer.length) {
      result[i] = audioBuffer[index] * (1 - fraction) + audioBuffer[index + 1] * fraction;
    } else {
      result[i] = audioBuffer[index];
    }
  }
  return result;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  imageUrl?: string;
  timestamp: Date;
  capturedIdeaId?: string;
}

interface CapturedIdea {
  id: string;
  text: string;
  timestamp: Date;
  source: 'user' | 'thia';
  imageUrl?: string;
}

export default function App() {
  const [activeChatMenuId, setActiveChatMenuId] = useState<string | null>(null);
  const [activeStickyMenuId, setActiveStickyMenuId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  // Live API State
  const [isLiveActive, setIsLiveActive] = useState(false);
  const isLiveActiveRef = useRef(false);
  useEffect(() => {
    isLiveActiveRef.current = isLiveActive;
  }, [isLiveActive]);

  const [isThiaSpeaking, setIsThiaSpeaking] = useState(false);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [tokenUsage, setTokenUsage] = useState({ prompt: 0, candidates: 0, total: 0 });
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [videoRotation, setVideoRotation] = useState(0);
  const [videoZoom, setVideoZoom] = useState(1);
  const [videoPan, setVideoPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const videoContainerRef = useRef<HTMLDivElement>(null);
  
  const videoRotationRef = useRef(0);
  const videoZoomRef = useRef(1);
  const videoPanRef = useRef({ x: 0, y: 0 });
  
  useEffect(() => { videoRotationRef.current = videoRotation; }, [videoRotation]);
  useEffect(() => { videoZoomRef.current = videoZoom; }, [videoZoom]);
  useEffect(() => { videoPanRef.current = videoPan; }, [videoPan]);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isSendingFrame, setIsSendingFrame] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [thiaLevel, setThiaLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const isMutedRef = useRef(true);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);
  
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [inputText, setInputText] = useState('');
  const liveServiceRef = useRef<GeminiLiveService | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const playingSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioWorkletRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const thiaAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastCaptureTimeRef = useRef<number>(0);
  const lastRecordedImageTimeRef = useRef<number>(0);
  const lastFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const motionDetectedRef = useRef<boolean>(false);
  
  const [stagedFiles, setStagedFiles] = useState<{name: string, content: string, imageUrl?: string}[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'assistant', text: "Hello! I'm Thia, your ideation partner.", timestamp: new Date() }
  ]);
  const [capturedIdeas, setCapturedIdeas] = useState<CapturedIdea[]>([]);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'context'>('chat');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
  const [isTablet, setIsTablet] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 && window.innerWidth <= 1180 : false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [highlightedIdeaId, setHighlightedIdeaId] = useState<string | null>(null);
  const [isLandscape, setIsLandscape] = useState(() => typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : false);
  const [isVideoMirrored, setIsVideoMirrored] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const panelContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setIsNarrow(entry.contentRect.width < 550);
      }
    });
    observer.observe(panelContainerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const checkMobile = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setIsMobile(width < 1024);
      setIsTablet(width >= 768 && width <= 1180);
      setIsLandscape(width > height);
    };
    checkMobile(); // Check on initial client side render
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(device => device.kind === 'videoinput');
        setAvailableCameras(cameras);
      } catch (err) {
        console.error("Error enumerating cameras:", err);
      }
    };
    getCameras();
    navigator.mediaDevices.addEventListener('devicechange', getCameras);
    return () => navigator.mediaDevices.removeEventListener('devicechange', getCameras);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isMobile]);

  const captureAndSendFrame = () => {
    if (!isVideoOn || !videoRef.current || !canvasRef.current || !liveServiceRef.current || !isLiveActive) return;
    
    const now = Date.now();
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (ctx && video.videoWidth > 0) {
      // Use a smaller internal canvas for motion detection to save CPU
      const motionCanvas = document.createElement('canvas');
      motionCanvas.width = 64;
      motionCanvas.height = 48;
      const mCtx = motionCanvas.getContext('2d');
      
      if (mCtx) {
        mCtx.drawImage(video, 0, 0, motionCanvas.width, motionCanvas.height);
        const currentFrame = mCtx.getImageData(0, 0, motionCanvas.width, motionCanvas.height).data;
        
        let diff = 0;
        let isFirstFrame = false;
        if (lastFrameDataRef.current) {
          for (let i = 0; i < currentFrame.length; i += 4) {
            // Compare brightness (R+G+B)/3
            const oldAvg = (lastFrameDataRef.current[i] + lastFrameDataRef.current[i+1] + lastFrameDataRef.current[i+2]) / 3;
            const newAvg = (currentFrame[i] + currentFrame[i+1] + currentFrame[i+2]) / 3;
            diff += Math.abs(newAvg - oldAvg);
          }
        } else {
          isFirstFrame = true;
        }
        
        // Sensitivity threshold: increased to 15 (300% of original baseline 5) to balance camera jitter vs intentional movement
        const threshold = (motionCanvas.width * motionCanvas.height) * 15;
        const hasMotion = isFirstFrame || diff > threshold;
        motionDetectedRef.current = hasMotion;
        lastFrameDataRef.current = currentFrame;

        // Adaptive timing: 
        // - If motion detected (drawing/moving): send every 1s
        // - If no motion: don't send to LLM (saves tokens/bandwidth), but send a keep-alive every 10s if we strictly need to. Actually, Gemini live API can just stay quiet. Let's only send if motion.
        const captureInterval = 1000;

        if (hasMotion && now - lastCaptureTimeRef.current >= captureInterval) {
          // Use a fixed 16:9 aspect ratio for the AI feed to match the UI container
          canvas.width = 480;
          canvas.height = 270;
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.save();
          
          // 1. Apply transforms matching UI (center-origin)
          // Order: Translate (Pan) -> Rotate -> Scale
          ctx.translate(canvas.width / 2, canvas.height / 2);
          
          // Use refs to get latest values in the interval closure
          const currentRotation = videoRotationRef.current;
          const currentZoom = videoZoomRef.current;
          const currentPan = videoPanRef.current;

          // Pan is applied in "canvas space"
          ctx.translate(currentPan.x, currentPan.y);
          ctx.rotate((currentRotation * Math.PI) / 180);
          ctx.scale(currentZoom, currentZoom);
          
          // 2. Draw video with object-cover logic centered at 0,0
          const videoAspect = video.videoWidth / video.videoHeight;
          const canvasAspect = canvas.width / canvas.height;
          let dw, dh;
          
          if (videoAspect > canvasAspect) {
            dh = canvas.height;
            dw = canvas.height * videoAspect;
          } else {
            dw = canvas.width;
            dh = canvas.width / videoAspect;
          }
          
          // Draw centered at 0,0 (which is now the canvas center + pan + rotation)
          ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);
          ctx.restore();
          
          const fullResBase64 = canvas.toDataURL('image/jpeg', 0.6);
          const base64 = fullResBase64.split(',')[1];
          
          if (base64) {
            liveServiceRef.current.sendVideoFrame(base64);
            lastCaptureTimeRef.current = now;
            setIsSendingFrame(true);
            setTimeout(() => setIsSendingFrame(false), 500);

            // Chat recording logic: only record if significant motion has occurred, max 1 every 8 seconds locally to prevent spam
            const recordInterval = 8000;
            if (now - lastRecordedImageTimeRef.current > recordInterval) {
              setMessages(prev => [...prev, { 
                id: Date.now().toString(), 
                role: 'user', 
                imageUrl: fullResBase64, // This now uses the transformed canvas image
                timestamp: new Date() 
              }]);
              lastRecordedImageTimeRef.current = now;
            }
          }
        }
      }
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLiveActive && isVideoOn) {
      interval = setInterval(captureAndSendFrame, 500); // Check every 500ms, but captureAndSendFrame has its own 2s throttle
    }
    return () => clearInterval(interval);
  }, [isLiveActive, isVideoOn]);

  const toggleVideo = async () => {
    if (isVideoOn) {
      stream?.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsVideoOn(false);
    } else {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ 
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            aspectRatio: { ideal: 1.7777777778 },
            facingMode: facingMode
          } 
        });
        setStream(videoStream);
        setIsVideoOn(true);
      } catch (err) {
        console.error("Failed to access camera:", err);
        setMicError("Camera access denied.");
      }
    }
  };

  const switchCamera = async () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    
    if (isVideoOn) {
      // Re-start video with new mode
      stream?.getTracks().forEach(track => track.stop());
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ 
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            aspectRatio: { ideal: 1.7777777778 },
            facingMode: newMode
          } 
        });
        setStream(videoStream);
        // Auto-mirror if it is front camera
        setIsVideoMirrored(newMode === 'user');
      } catch (err) {
        console.error("Failed to switch camera:", err);
      }
    } else {
      // Just set mirroring preference
      setIsVideoMirrored(newMode === 'user');
    }
  };

  const playAudioChunk = async (base64Audio: string) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    
    try {
      const binaryString = window.atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const pcmData = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        float32Data[i] = pcmData[i] / 32768.0;
      }
      
      const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      
      if (thiaAnalyserRef.current) {
        source.connect(thiaAnalyserRef.current);
      } else {
        source.connect(ctx.destination);
      }
      
      const startTime = Math.max(ctx.currentTime, nextPlayTimeRef.current);
      source.start(startTime);
      nextPlayTimeRef.current = startTime + audioBuffer.duration;
      playingSourcesRef.current.push(source);
      
      source.onended = () => {
        playingSourcesRef.current = playingSourcesRef.current.filter(s => s !== source);
        if (playingSourcesRef.current.length === 0) {
          if (speakingTimeoutRef.current) {
            clearTimeout(speakingTimeoutRef.current);
          }
          // Only start the breath 500ms AFTER the actual audio playback finishes
          speakingTimeoutRef.current = setTimeout(() => {
            setIsThiaSpeaking(false);
          }, 500);
        }
      };
    } catch (e) {
      console.error("Audio playback error:", e);
    }
  };

  const scrollToIdea = (ideaId: string) => {
    setActiveTab('context');
    if (isMobile) setIsMobileDrawerOpen(true);
    setHighlightedIdeaId(ideaId);
    
    // Wait for the DOM to render the new activeTab, then scroll the note into view
    setTimeout(() => {
      const el = document.getElementById(`idea-${ideaId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);

    setTimeout(() => {
      setHighlightedIdeaId(null);
    }, 2000);
  };

  const approveIdea = (messageId: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id === messageId && m.suggestion) {
        const ideaId = addIdea(m.suggestion.idea, 'thia', m.imageUrl);
        
        // Send tool response back to Thia
        liveServiceRef.current?.sendToolResponse({
          functionResponses: [{
            name: "suggest_idea_capture",
            response: { output: "Idea captured successfully." },
            id: m.suggestion.toolCallId
          }]
        });

        return { ...m, suggestion: { ...m.suggestion, status: 'approved' }, capturedIdeaId: ideaId };
      }
      return m;
    }));
  };

  const rejectIdea = (messageId: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id === messageId && m.suggestion) {
        // Send tool response back to Thia
        liveServiceRef.current?.sendToolResponse({
          functionResponses: [{
            name: "suggest_idea_capture",
            response: { output: "User declined to capture this idea." },
            id: m.suggestion.toolCallId
          }]
        });

        return { ...m, suggestion: { ...m.suggestion, status: 'rejected' } };
      }
      return m;
    }));
  };

  const startLiveSession = async () => {
    if (isLiveActive) {
      stopLiveSession();
      return;
    }

    try {
      // 1. Start Audio
      setMicError(null);
      setDebugLogs(prev => ["Starting live session...", ...prev.slice(0, 19)]);
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = micStream;
      setIsMuted(false);

      // 2. Start Video
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ 
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            aspectRatio: { ideal: 1.7777777778 },
            facingMode: facingMode
          } 
        });
        setStream(videoStream);
        setIsVideoOn(true);
      } catch (vErr) {
        console.error("Failed to start video on session start:", vErr);
        setDebugLogs(prev => ["Video start failed", ...prev.slice(0, 19)]);
      }

      const liveService = new GeminiLiveService();
      liveServiceRef.current = liveService;

      await liveService.connect({
        onTranscription: (text, role) => {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            // If the last message is from the same role and is recent, append to it
            if (last && last.role === (role === 'model' ? 'assistant' : 'user') && last.text !== undefined && Date.now() - last.timestamp.getTime() < 5000) {
              return [...prev.slice(0, -1), { ...last, text: last.text + " " + text }];
            }
            return [...prev, { id: Date.now().toString(), role: role === 'model' ? 'assistant' : 'user', text, timestamp: new Date() }];
          });
        },
        onAudioData: (base64Audio) => {
          setIsThiaSpeaking(true);
          playAudioChunk(base64Audio);
          
          if (speakingTimeoutRef.current) {
            clearTimeout(speakingTimeoutRef.current);
          }
        },
        onInterrupted: () => {
          playingSourcesRef.current.forEach(source => {
            try { source.stop(); } catch (e) {}
          });
          playingSourcesRef.current = [];
          nextPlayTimeRef.current = audioContextRef.current?.currentTime || 0;
        },
        onUsageUpdate: (usage) => {
          setTokenUsage(prev => ({
            prompt: Math.max(prev.prompt, usage.promptTokens),
            candidates: Math.max(prev.candidates, usage.candidatesTokens),
            total: Math.max(prev.total, usage.totalTokens)
          }));
        },
        onToolCall: (toolCall) => {
          if (toolCall.functionCalls) {
            toolCall.functionCalls.forEach((fc: any) => {
              if (fc.name === 'capture_idea') {
                const idea = fc.args.idea;
                
                // Extract current frame from the AI message if available, otherwise addIdea grabs it automatically
                let capturedImageUrl = undefined;
                setMessages(prev => {
                  for (let i = prev.length - 1; i >= 0; i--) {
                    if (prev[i].role === 'assistant' || prev[i].role === 'user') {
                       if (prev[i].imageUrl) {
                          capturedImageUrl = prev[i].imageUrl;
                          break;
                       }
                       if (Date.now() - prev[i].timestamp.getTime() > 10000) break; // don't look too far back
                    }
                  }
                  return prev;
                });
                
                const ideaId = addIdea(idea, 'thia', capturedImageUrl);
                
                // Send response back immediately
                liveServiceRef.current?.sendToolResponse({
                  functionResponses: [{
                    name: "capture_idea",
                    response: { output: "Idea correctly logged and saved." },
                    id: fc.id
                  }]
                });
                
                // Attach sticky note to the latest assistant message
                setMessages(prev => {
                  const cloned = [...prev];
                  for (let i = cloned.length - 1; i >= 0; i--) {
                    if (cloned[i].role === 'assistant') {
                      cloned[i] = { ...cloned[i], capturedIdeaId: ideaId };
                      return cloned;
                    }
                  }
                  // Fallback: if no assistant message exists yet
                  return [...cloned, {
                    id: Date.now().toString() + Math.random().toString(),
                    role: 'assistant',
                    timestamp: new Date(),
                    text: '',
                    capturedIdeaId: ideaId
                  }];
                });
              }
            });
          }
        },
        onError: (err) => {
          console.error("Live session error:", err);
          stopLiveSession();
        },
        onClose: () => {
          setIsLiveActive(false);
        },
        onDebugLog: (msg) => {
          setDebugLogs(prev => [msg, ...prev.slice(0, 19)]);
        }
      }, {
        systemInstruction: systemInstructionMarkdown,
        thinkingLevel: 'HIGH',
        temperature: 1.0,
        voiceName: 'Aoede'
      });

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      await audioContext.resume();
      audioContextRef.current = audioContext;
      
      // Thia Output Analyser
      const thiaAnalyser = audioContext.createAnalyser();
      thiaAnalyser.fftSize = 256;
      thiaAnalyser.connect(audioContext.destination);
      thiaAnalyserRef.current = thiaAnalyser;
      
      const source = audioContext.createMediaStreamSource(micStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioWorkletRef.current = processor;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const thiaDataArray = new Uint8Array(thiaAnalyser.frequencyBinCount);
      
      const updateLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setMicLevel(average);
        }
        
        if (thiaAnalyserRef.current) {
          thiaAnalyserRef.current.getByteFrequencyData(thiaDataArray);
          const average = thiaDataArray.reduce((a, b) => a + b) / thiaDataArray.length;
          setThiaLevel(average);
        }
        
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      processor.onaudioprocess = (e) => {
        if (isLiveActiveRef.current && !isMutedRef.current) {
          const inputData = e.inputBuffer.getChannelData(0);
          const resampledData = resample(inputData, 16000, audioContext.sampleRate);
          const pcmBuffer = floatTo16BitPCM(resampledData);
          const base64 = arrayBufferToBase64(pcmBuffer);
          liveService.sendAudio(base64);
        }
      };

      source.connect(processor);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      setIsLiveActive(true);
      lastRecordedImageTimeRef.current = Date.now(); // Reset timer to prevent immediate capture
      setDebugLogs(prev => ["Session active", ...prev.slice(0, 19)]);

    } catch (err) {
      console.error("Failed to start live session:", err);
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        setMicError("Microphone access was denied. Please ensure you've granted permission in your browser settings.");
      } else {
        setMicError(err instanceof Error ? err.message : String(err));
      }
      setDebugLogs(prev => [`Failed: ${err}`, ...prev.slice(0, 19)]);
    }
  };

  const stopLiveSession = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioWorkletRef.current) audioWorkletRef.current.disconnect();
    if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
    
    // Stop video and camera
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
    setIsVideoOn(false);

    if (liveServiceRef.current) liveServiceRef.current.disconnect();
    
    playingSourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    playingSourcesRef.current = [];
    
    setIsLiveActive(false);
    setMicLevel(0);
    setIsMuted(true); // Ensure UI reflects mute status
    setDebugLogs(prev => [
      `Session stopped. Final Usage: P:${tokenUsage.prompt} C:${tokenUsage.candidates} T:${tokenUsage.total}`,
      ...prev.slice(0, 19)
    ]);
  };

  const deleteMessage = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setStagedFiles(prev => {
              if (prev.some(f => f.name === file.name)) return prev;
              return [...prev, { name: file.name, content: '', imageUrl: event.target!.result as string }];
            });
          }
        };
        reader.readAsDataURL(file);
      } else if (file.name.toLowerCase().endsWith('.pdf')) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
          let text = '';
          for (let i = 1; i <= pdf.numPages; i++) {
             const page = await pdf.getPage(i);
             const content = await page.getTextContent();
             text += content.items.map((item: any) => item.str).join(' ') + '\n';
          }
          setStagedFiles(prev => {
            if (prev.some(f => f.name === file.name)) return prev;
             return [...prev, { name: file.name, content: text }];
          });
        } catch (err) {
          console.error("Failed to parse PDF", err);
          alert("Failed to read PDF.");
        }
      } else if (file.name.toLowerCase().endsWith('.docx')) {
         try {
           const arrayBuffer = await file.arrayBuffer();
           const result = await mammoth.extractRawText({ arrayBuffer });
           setStagedFiles(prev => {
             if (prev.some(f => f.name === file.name)) return prev;
             return [...prev, { name: file.name, content: result.value }];
           });
         } catch (err) {
           console.error("Failed to parse DOCX", err);
           alert("Failed to read DOCX.");
         }
      } else {
         const reader = new FileReader();
         reader.onload = (event) => {
           if (event.target?.result) {
             setStagedFiles(prev => {
               if (prev.some(f => f.name === file.name)) return prev;
               return [...prev, { name: file.name, content: event.target!.result as string }];
             });
           }
         };
         reader.readAsText(file);
      }
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeStagedFile = (name: string) => {
    setStagedFiles(prev => prev.filter(f => f.name !== name));
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!inputText.trim() && stagedFiles.length === 0) || !liveServiceRef.current || !isLiveActive) return;

    const text = inputText.trim();
    let finalPayload = text;
    let displayText = text;

    let attachedImageUrls: string[] = [];

    if (stagedFiles.length > 0) {
      const textFiles = stagedFiles.filter(f => f.content);
      const textContextStr = textFiles.map(f => `[Context File: ${f.name}]\n${f.content}\n`).join('\n---\n');
      
      const imageFiles = stagedFiles.filter(f => f.imageUrl);
      
      if (textFiles.length > 0) {
          finalPayload = `Here are some attached files for context:\n${textContextStr}\n\n`;
      } else {
          finalPayload = '';
      }
      
      if (imageFiles.length > 0) {
          finalPayload += `[User also attached ${imageFiles.length} image(s).]\n\n`;
          // Send images directly into the feed
          imageFiles.forEach(img => {
            if (img.imageUrl) {
              const base64 = img.imageUrl.split(',')[1];
              if (base64) {
                 liveServiceRef.current?.sendVideoFrame(base64);
              }
              attachedImageUrls.push(img.imageUrl);
            }
          });
      }
      
      finalPayload += `User Question:\n${text}`;
      const attachedNames = stagedFiles.map(f => f.name).join(', ');
      displayText = text ? `${text}\n\n(Attached files: ${attachedNames})` : `(Attached files: ${attachedNames})`;
    }
    
    // Check if user is explicitly asking to capture something
    const captureMatch = text.match(/^capture:\s*(.*)/i);
    if (captureMatch) {
      const ideaId = addIdea(captureMatch[1], 'user');
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'user', 
        text: `Captured idea: ${captureMatch[1]}`, 
        timestamp: new Date(),
        capturedIdeaId: ideaId,
        imageUrl: attachedImageUrls[0] // just attach the first one if multiple for the ui
      }]);
      setInputText('');
      setStagedFiles([]);
      return;
    }

    liveServiceRef.current.sendText(finalPayload);
    
    setMessages(prev => [...prev, { 
      id: Date.now().toString(), 
      role: 'user', 
      text: displayText, 
      timestamp: new Date(),
      imageUrl: attachedImageUrls[0] // keep thumbnail context hook attached to log
    }]);
    
    setInputText('');
    setStagedFiles([]);
  };

  const exportChatToDocx = async () => {
    if (messages.length === 0) return;
    
    const docChildren: any[] = [];
    
    // YYYYMMDD_HHMMSS formatting
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const dateComponent = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timeComponent = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const fileName = `thia_chat_${dateComponent}_${timeComponent}.docx`;

    // Add a title
    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Thia Chat Log - ${now.toLocaleString()}`, bold: true, size: 32, font: "Arial" }),
        ],
        spacing: { after: 400 }
      })
    );

    for (const msg of messages) {
      const isUser = msg.role === 'user';
      const timeStr = msg.timestamp.toLocaleTimeString();
      const dateStr = msg.timestamp.toLocaleDateString();
      const name = isUser ? 'You' : 'Thia';
      
      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${name} • ${dateStr} ${timeStr}`, bold: true, color: isUser ? "005bb5" : "333333", font: "Arial" })
          ],
          spacing: { before: 200, after: 100 }
        })
      );
      
      if (msg.imageUrl) {
        try {
          const mimeTypeMatch = msg.imageUrl.match(/^data:(image\/\w+);base64,/);
          const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';
          let imageType = 'png';
          if (mimeType.includes('jpeg') || mimeType.includes('jpg')) imageType = 'jpg';
          if (mimeType.includes('gif')) imageType = 'gif';

          const response = await fetch(msg.imageUrl);
          const arrayBuffer = await response.arrayBuffer();
          
          docChildren.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: arrayBuffer,
                  type: imageType as any,
                  transformation: {
                    width: 320,
                    height: 180
                  }
                })
              ],
              spacing: { after: 100 }
            })
          );
        } catch (err) {
          console.error("Error embedding image into docx", err);
        }
      }

      if (msg.text) {
        // MS Word XML does not allow raw newline \n characters in TextRun
        // Split and map them to discrete runs with break, or multiple paragraphs
        const lines = msg.text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim() !== '') {
            docChildren.push(
              new Paragraph({
                children: [
                  new TextRun({ text: lines[i], font: "Arial" })
                ],
                spacing: { after: 100 }
              })
            );
          } else {
             // add empty paragraph for spacing 
             docChildren.push(new Paragraph({ children: [], spacing: { after: 100 } }));
          }
        }
      }
    }

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: "Arial",
            },
          },
        },
      },
      sections: [
        {
          properties: {},
          children: docChildren
        }
      ]
    });

    try {
      const blob = await Packer.toBlob(doc);
      saveAs(blob, fileName);
    } catch (e) {
      console.error(e);
    }
  };

  const downloadIdeas = async () => {
    if (capturedIdeas.length === 0) return;
    
    const docChildren: any[] = [];
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const dateComponent = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timeComponent = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const fileName = `thia_notes_${dateComponent}_${timeComponent}.docx`;

    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Thia Saved Notes - ${now.toLocaleString()}`, bold: true, size: 32, font: "Arial" }),
        ],
        spacing: { after: 400 }
      })
    );

    for (const idea of capturedIdeas) {
      const timeStr = idea.timestamp.toLocaleTimeString();
      const dateStr = idea.timestamp.toLocaleDateString();
      const name = idea.source === 'user' ? 'You' : 'Thia';
      
      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${name} • ${dateStr} ${timeStr}`, bold: true, color: idea.source === 'user' ? "005bb5" : "333333", font: "Arial" })
          ],
          spacing: { before: 200, after: 100 }
        })
      );
      
      if (idea.imageUrl) {
        try {
          // It's already in base64 data URI format
          const response = await fetch(idea.imageUrl);
          const arrayBuffer = await response.arrayBuffer();
          
          docChildren.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: arrayBuffer,
                  type: "jpeg",
                  transformation: {
                    width: 320,
                    height: 180
                  }
                })
              ],
              spacing: { after: 100 }
            })
          );
        } catch (err) {
          console.error("Error embedding image into docx", err);
        }
      }

      if (idea.text) {
        const lines = idea.text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim() !== '') {
            docChildren.push(
              new Paragraph({
                children: [
                  new TextRun({ text: lines[i], font: "Arial" })
                ],
                spacing: { after: 100 }
              })
            );
          } else {
             docChildren.push(new Paragraph({ children: [], spacing: { after: 100 } }));
          }
        }
      }
    }

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: "Arial",
            },
          },
        },
      },
      sections: [
        {
          properties: {},
          children: docChildren
        }
      ]
    });

    try {
      const blob = await Packer.toBlob(doc);
      saveAs(blob, fileName);
    } catch (e) {
      console.error(e);
    }
  };

  const addIdea = (text: string, source: 'user' | 'thia', explicitImageUrl?: string) => {
    const id = Date.now().toString();
    
    let imageUrl = explicitImageUrl;
    if (!imageUrl && isVideoOn && videoRef.current) {
      const video = videoRef.current;
      const tCanvas = document.createElement('canvas');
      const ctx = tCanvas.getContext('2d');
      if (ctx && video.videoWidth > 0) {
        tCanvas.width = 480;
        tCanvas.height = 270;
        ctx.translate(tCanvas.width / 2, tCanvas.height / 2);
        
        ctx.translate(videoPanRef.current.x, videoPanRef.current.y);
        ctx.rotate((videoRotationRef.current * Math.PI) / 180);
        ctx.scale(videoZoomRef.current, videoZoomRef.current);
        
        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = tCanvas.width / tCanvas.height;
        let dw, dh;
        if (videoAspect > canvasAspect) {
          dh = tCanvas.height;
          dw = tCanvas.height * videoAspect;
        } else {
          dw = tCanvas.width;
          dh = tCanvas.width / videoAspect;
        }
        ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);
        imageUrl = tCanvas.toDataURL('image/jpeg', 0.8);
      }
    }

    setCapturedIdeas(prev => [...prev, {
      id,
      text,
      timestamp: new Date(),
      source,
      imageUrl
    }]);
    return id;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!isVideoOn) return;
    e.preventDefault();
    const zoomStep = 0.1;
    const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
    const newZoom = Math.min(3, Math.max(1, videoZoom + delta));
    setVideoZoom(newZoom);
  };

  const clampPan = (pan: { x: number, y: number }, zoom: number) => {
    if (!videoContainerRef.current) return pan;
    const { clientWidth, clientHeight } = videoContainerRef.current;
    
    // Max pan is half of the "extra" width/height created by zoom
    const maxPanX = ((zoom - 1) * clientWidth) / 2;
    const maxPanY = ((zoom - 1) * clientHeight) / 2;
    
    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, pan.x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, pan.y))
    };
  };

  useEffect(() => {
    setVideoPan(prev => clampPan(prev, videoZoom));
  }, [videoZoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isVideoOn || videoZoom <= 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - videoPan.x, y: e.clientY - videoPan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;
    setVideoPan(clampPan({ x: newX, y: newY }, videoZoom));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isVideoOn || videoZoom <= 1) return;
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = { x: e.touches[0].clientX - videoPan.x, y: e.touches[0].clientY - videoPan.y };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      const newX = e.touches[0].clientX - dragStartRef.current.x;
      const newY = e.touches[0].clientY - dragStartRef.current.y;
      setVideoPan(clampPan({ x: newX, y: newY }, videoZoom));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const container = videoContainerRef.current;
    if (!container) return;

    const preventDefault = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };

    container.addEventListener('wheel', preventDefault, { passive: false });
    return () => container.removeEventListener('wheel', preventDefault);
  }, [isMobile]);

  return (
    <div className={`flex h-screen w-full overflow-hidden ${isDarkMode ? 'dark' : ''} bg-white dark:bg-gray-950 dark:bg-gray-950 text-gray-900 dark:text-gray-100 dark:text-gray-100`}>
      <input
        type="file"
        multiple
        accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*,application/json,.pdf,.docx,.txt,.md,.json,.csv,.js,.jsx,.ts,.tsx,.html,.css,.xml,.yaml,.yml"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileUpload}
      />
      <main className="flex-1 h-full relative">
        <Group key={(isTablet && isLandscape) ? 'tablet-split' : 'desktop-split'} direction="horizontal" className="h-full w-full">
          {/* Column 1: Video Feed & Controls */}
          <Panel defaultSize={(isTablet && isLandscape) ? 60 : 75} minSize={25} className="flex flex-col relative h-full bg-white dark:bg-gray-950">
            <div ref={panelContainerRef} className={`flex w-full h-full ${isMobile && isLandscape ? 'flex-row' : 'flex-col'}`}>
              
              {/* Left Column in Landscape / Top Section in Portrait */}
              <div className="flex flex-col flex-1 relative overflow-hidden">
                {/* Top Visualizer Area */}
                <div className={`bg-black flex-shrink-0 relative overflow-hidden flex flex-col items-center justify-start pb-0 ${isMobile && isLandscape ? 'h-[80px] pt-3' : 'h-[200px] pt-8'}`}>
                  {/* Dark Mode Toggle */}
                  <button
                    onClick={() => setIsDarkMode(prev => !prev)}
                    className="absolute top-6 right-6 z-[60] w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white/80 hover:bg-white/20 hover:text-white transition-all focus-ring active:scale-95 border border-white/20 shadow-lg"
                    title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                  >
                    {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                  </button>
                  <h1 className={`font-bold tracking-tight text-white z-10 ${isMobile && isLandscape ? 'text-3xl' : 'text-[40px]'}`}>Thia</h1>
              
              {/* Concentric Circles radiating from bottom */}
              <div className="absolute bottom-0 inset-x-0 flex items-end justify-center pointer-events-none">
                   <motion.div animate={{ 
                     y: isLiveActive ? 0 : 54, 
                     scale: isThiaSpeaking ? 1 + (thiaLevel / 100) * 0.1 : [1, 1.02, 1],
                     backgroundColor: isLiveActive ? 'rgba(255, 140, 0, 0.35)' : 'rgba(138, 43, 226, 0.25)'
                   }}
                   transition={{ 
                     y: { type: "spring", stiffness: 100, damping: 25 },
                     scale: isThiaSpeaking ? { type: "spring", stiffness: 200, damping: 20 } : { duration: 3, repeat: Infinity, ease: "easeInOut" },
                     backgroundColor: { duration: 0.5 }
                   }}
                   className="w-[440px] h-[220px] rounded-t-full absolute bottom-[-40px] origin-bottom"
                 />
                 <motion.div
                   animate={{ 
                     y: isLiveActive ? 0 : 54, 
                     scale: isThiaSpeaking ? 1 + (thiaLevel / 100) * 0.2 : [1, 1.04, 1],
                     backgroundColor: isLiveActive ? 'rgba(255, 150, 30, 0.65)' : 'rgba(255, 94, 77, 0.45)'
                   }}
                   transition={{ 
                     y: { type: "spring", stiffness: 100, damping: 25 },
                     scale: isThiaSpeaking ? { type: "spring", stiffness: 200, damping: 20 } : { duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.1 },
                     backgroundColor: { duration: 0.5 }
                   }}
                   className="w-[320px] h-[160px] rounded-t-full absolute bottom-[-40px] origin-bottom"
                 />
                 <motion.div
                   animate={{ 
                     y: isLiveActive ? -10 : 54, // Adjusted base shift up relative to new sleep baseline
                     scale: isThiaSpeaking ? 1 + (thiaLevel / 100) * 0.3 : [1, 1.06, 1],
                     backgroundColor: isLiveActive ? 'rgba(255, 185, 0, 1.0)' : 'rgba(255, 87, 51, 1.0)' 
                   }}
                   transition={{ 
                     y: { type: "spring", stiffness: 100, damping: 25 },
                     scale: isThiaSpeaking ? { type: "spring", stiffness: 200, damping: 20 } : { duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.2 },
                     backgroundColor: { duration: 0.5 }
                   }}
                   className="w-[200px] h-[100px] rounded-t-full absolute bottom-[-40px] origin-bottom transition-shadow duration-500"
                 />
              </div>
            </div>

            <div className="flex-1 relative flex flex-col overflow-hidden bg-zinc-600">
              {/* Video Container */}
              <div 
                ref={videoContainerRef}
                className="absolute inset-0 bg-black overflow-hidden group cursor-move flex items-center justify-center"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleMouseUp}
              >
                {isVideoOn ? (
                  <div className="relative w-full h-full flex items-center justify-center overflow-hidden pointer-events-none">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                      className="w-full h-full object-contain transition-transform duration-300"
                      style={{ 
                        transform: `translate(${videoPan.x}px, ${videoPan.y}px) rotate(${videoRotation}deg) scale(${videoZoom}) scaleX(${isVideoMirrored ? -1 : 1})` 
                      }}
                    />
                    <AnimatePresence>
                      {isSendingFrame && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 bg-black/60 border border-zinc-800 rounded-md backdrop-blur-md text-[9px] font-medium text-white"
                        >
                          <div className="w-1 h-1 rounded-full bg-white dark:bg-gray-950 animate-pulse" />
                          Processing
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-400">
                    <VideoOff size={48} strokeWidth={1.5} />
                    <span className="text-base uppercase tracking-wider font-medium text-zinc-300">Vision Offline</span>
                  </div>
                )}

                {/* Overlay Zoom Controls */}
                {isVideoOn && (
                  <div className="absolute bottom-3 right-3 flex flex-col items-center gap-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="px-2 py-1 bg-black/60 backdrop-blur-md rounded border border-zinc-700 text-sm font-medium text-white">
                      {videoZoom.toFixed(1)}x
                    </div>
                    <div className="flex flex-col bg-black/40 backdrop-blur-md rounded-md border border-zinc-700 p-0.5">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setVideoZoom(prev => Math.min(3, prev + 0.2)); }}
                        className="w-9 h-9 flex items-center justify-center hover:bg-zinc-700 rounded-md transition-colors text-zinc-200 hover:text-white"
                        aria-label="Zoom In"
                      >
                        <ZoomIn size={20} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setVideoZoom(prev => Math.max(1, prev - 0.2)); }}
                        className="w-9 h-9 flex items-center justify-center hover:bg-zinc-700 rounded-md transition-colors text-zinc-200 hover:text-white"
                        aria-label="Zoom Out"
                      >
                        <ZoomOut size={20} />
                      </button>
                    </div>
                  </div>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>
            </div>

            {/* Notifications Area */}
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-30 pointer-events-none">
              {micError && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-red-50 dark:bg-red-950 border border-red-100 rounded-lg text-red-600 dark:text-red-400 text-base flex flex-col gap-3 shadow-lg pointer-events-auto"
                >
                  <p className="font-medium">Connectivity Issue: {micError}</p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => window.open(window.location.href, '_blank')}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs font-semibold hover:bg-red-700 transition-colors"
                    >
                      Reconnect
                    </button>
                    <button 
                      onClick={() => setMicError(null)}
                      className="px-3 py-1.5 border border-red-200 text-red-600 dark:text-red-400 rounded-md text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

                {/* Bottom Visualizer Area (Microphone) */}
                <div className={`bg-black flex-shrink-0 flex items-center justify-center relative z-10 ${isMobile && isLandscape ? 'h-16' : 'h-32'}`}>
                  <div className="flex items-center justify-center gap-[4px] h-full py-2 w-full max-w-[360px]">
                    {Array.from({ length: 20 }).map((_, i) => {
                  const centerDistance = Math.abs(9.5 - i);
                  const bellCurveMultiplier = Math.max(0.15, 1 - Math.pow(centerDistance / 9.5, 1.5));
                  return (
                    <motion.div
                      key={i}
                      animate={{ 
                        height: Math.max(12, (!isMuted ? (micLevel / 100) : 0.05) * 128 * bellCurveMultiplier * (0.6 + Math.random() * 0.4)) 
                      }}
                      transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                      className={`flex-1 max-w-[6px] rounded-full ${isMuted ? 'bg-zinc-700' : 'bg-green-500'}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Controls Bar (or Right Column in Landscape) */}
          <div className={`bg-white dark:bg-gray-950 z-20 flex-shrink-0 flex overflow-visible ${
            isMobile && isLandscape 
              ? 'w-[160px] flex-col py-6 border-l border-gray-200 dark:border-gray-700' 
              : `h-auto min-h-[8rem] items-center justify-between ${(isMobile || isNarrow) ? 'px-2 py-4 sm:px-4' : 'px-8'}`
          }`}>
            {(isMobile || isNarrow) ? (
              <div className={`w-full flex ${isMobile && isLandscape ? 'flex-col justify-center items-center gap-y-6 h-full' : 'items-center justify-between gap-4 px-2'}`}>
                
                {/* Row 1 / Left Side */}
                <div className={`flex items-center z-[100] ${isMobile && isLandscape ? 'gap-4 justify-center w-full relative' : 'gap-2 sm:gap-3 justify-start relative'}`}>
                    <div className={`flex flex-col items-center gap-1.5 relative w-16`} ref={mobileMenuRef}>
                      <button 
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 border-none disabled:opacity-50 disabled:pointer-events-none focus-ring ${isMobileMenuOpen ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                      >
                        <Aperture size={20} />
                      </button>
                      <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 flex items-center justify-center text-center leading-tight">Adjust</span>

                      <AnimatePresence>
                        {isMobileMenuOpen && (
                          <motion.div 
                            initial={{ opacity: 0, y: isMobile && isLandscape ? 0 : 10, x: isMobile && isLandscape ? 10 : 0, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                            exit={{ opacity: 0, y: isMobile && isLandscape ? 0 : 10, x: isMobile && isLandscape ? 10 : 0, scale: 0.95 }}
                            className={`absolute bg-white dark:bg-gray-950 shadow-2xl border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex gap-4 pointer-events-auto z-[100] ${
                              isMobile && isLandscape 
                                ? 'right-[calc(100%+16px)] top-1/2 -translate-y-1/2 flex-row w-[200px] flex-wrap justify-center' 
                                : 'bottom-[calc(100%+8px)] -left-2'
                            }`}
                          >
                              <div className="flex flex-col items-center gap-1.5">
                                <button 
                                  onClick={() => { setVideoRotation(prev => (prev + 180) % 360); setIsMobileMenuOpen(false); }}
                                  disabled={!isVideoOn}
                                  className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus-ring"
                                >
                                  <RotateCcw size={18} />
                                </button>
                                 <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 h-6 flex items-center justify-center">Flip</span>
                              </div>
                              <div className="flex flex-col items-center gap-1.5 w-16">
                                <button 
                                  onClick={() => { setIsVideoMirrored(prev => !prev); setIsMobileMenuOpen(false); }}
                                  disabled={!isVideoOn}
                                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus-ring ${isVideoMirrored ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                >
                                  <FlipHorizontal size={18} />
                                </button>
                                <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 h-6 flex items-center justify-center">Mirror</span>
                              </div>
                              <div className="flex flex-col items-center gap-1.5 w-16">
                                <button 
                                  onClick={() => { setVideoPan({ x: 0, y: 0 }); setIsMobileMenuOpen(false); }}
                                  disabled={!isVideoOn}
                                  className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus-ring"
                                >
                                  <Move size={18} />
                                </button>
                                <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 h-6 flex items-center justify-center">Center</span>
                              </div>
                              <div className="flex flex-col items-center gap-1.5 w-16">
                                <button 
                                  onClick={() => {
                                    setVideoRotation(0);
                                    setVideoZoom(1);
                                    setVideoPan({ x: 0, y: 0 });
                                    setIsMobileMenuOpen(false);
                                  }}
                                  disabled={!isVideoOn}
                                  className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus-ring"
                                >
                                  <RefreshCw size={18} />
                                </button>
                                <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 h-6 flex items-center justify-center">Reset</span>
                              </div>
                              {availableCameras.length > 1 && (
                                <div className="flex flex-col items-center gap-1.5 w-16">
                                  <button 
                                    onClick={() => { switchCamera(); setIsMobileMenuOpen(false); }}
                                    className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 active:scale-95 focus-ring"
                                  >
                                    <SwitchCamera size={18} />
                                  </button>
                                  <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 h-6 flex items-center justify-center">Switch</span>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {isMobile && (
                        <div className="flex flex-col items-center gap-1.5 w-16">
                          <button 
                            onClick={() => setIsMobileDrawerOpen(true)}
                            className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 active:scale-95 focus-ring"
                          >
                            <MessageSquare size={20} />
                          </button>
                          <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 flex items-center justify-center text-center leading-tight">Chat</span>
                        </div>
                      )}
                </div>

                {/* Right Side */}
                <div className={`flex ${isMobile && isLandscape ? 'flex-col items-center gap-4 w-full relative z-10' : 'items-center gap-2 relative z-10 justify-end flex-nowrap flex-1'}`}>
                  
                  {/* Audio & Vision Wrapper */}
                  <div className={`flex items-center ${isMobile && isLandscape ? 'gap-4 justify-center w-full' : 'gap-2'}`}>
                    <div className="flex flex-col items-center gap-1.5 w-16">
                      <button 
                        onClick={() => setIsMuted(!isMuted)}
                        className={`w-12 h-12 rounded-full border-none flex items-center justify-center transition-all duration-200 active:scale-95 focus-ring ${
                          isMuted ? 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800' : 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 hover:bg-blue-200'
                        }`}
                      >
                        {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                      </button>
                      <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 flex items-center justify-center text-center leading-tight">Audio</span>
                    </div>

                    <div className="flex flex-col items-center gap-1.5 w-16">
                      <button 
                        onClick={toggleVideo}
                        className={`w-12 h-12 rounded-full border-none flex items-center justify-center transition-all duration-200 active:scale-95 focus-ring ${
                          !isVideoOn ? 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800' : 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 hover:bg-blue-200'
                        }`}
                      >
                        {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
                      </button>
                      <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 flex items-center justify-center text-center leading-tight">Vision</span>
                    </div>
                  </div>

                    <div className="flex flex-col items-center gap-1.5 w-16">
                      <button 
                        onClick={startLiveSession}
                        className={`w-12 h-12 rounded-full border-none flex items-center justify-center transition-all duration-200 active:scale-95 focus-ring ${isLiveActive ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700'}`}
                      >
                        {isLiveActive ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                      </button>
                      <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 flex items-center justify-center text-center leading-tight">{isLiveActive ? 'End' : 'Start'}</span>
                    </div>
                </div>
              </div>
              ) : (
                <>
                  {/* Left Group */}
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center gap-2 min-w-[60px]">
                      <button 
                        onClick={() => setVideoRotation(prev => (prev + 180) % 360)}
                        disabled={!isVideoOn}
                        className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus-ring"
                      >
                        <RotateCcw size={18} />
                      </button>
                      <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 flex items-center justify-center text-center">Flip</span>
                    </div>

                    <div className="flex flex-col items-center gap-2 min-w-[60px]">
                      <button 
                        onClick={() => setIsVideoMirrored(prev => !prev)}
                        disabled={!isVideoOn}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none border-none focus-ring ${isVideoMirrored ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                      >
                        <FlipHorizontal size={18} />
                      </button>
                      <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 flex items-center justify-center text-center">Mirror</span>
                    </div>

                    <div className="flex flex-col items-center gap-2 min-w-[60px]">
                      <button 
                        onClick={() => setVideoPan({ x: 0, y: 0 })}
                        disabled={!isVideoOn}
                        className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus-ring"
                      >
                        <Move size={18} />
                      </button>
                      <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 flex items-center justify-center text-center">Center</span>
                    </div>

                    <div className="flex flex-col items-center gap-2 min-w-[60px]">
                      <button 
                        onClick={() => {
                          setVideoRotation(0);
                          setVideoZoom(1);
                          setVideoPan({ x: 0, y: 0 });
                        }}
                        disabled={!isVideoOn}
                        className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus-ring"
                      >
                        <RefreshCw size={18} />
                      </button>
                      <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 flex items-center justify-center text-center">Reset</span>
                    </div>

                    {availableCameras.length > 1 && (
                      <div className="flex flex-col items-center gap-2 min-w-[60px]">
                        <button 
                          onClick={switchCamera}
                          className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 active:scale-95 focus-ring"
                        >
                          <SwitchCamera size={18} />
                        </button>
                        <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 flex items-center justify-center text-center">Switch</span>
                      </div>
                    )}
                  </div>

                  {/* Right Group */}
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center gap-2 min-w-[60px]">
                      <button 
                        onClick={() => setIsMuted(!isMuted)}
                        className={`w-10 h-10 rounded-full border-none flex items-center justify-center transition-all duration-200 active:scale-95 focus-ring ${
                          isMuted ? 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800' : 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 hover:bg-blue-200'
                        }`}
                      >
                        {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                      </button>
                      <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 flex items-center justify-center text-center">Audio</span>
                    </div>

                    <div className="flex flex-col items-center gap-2 min-w-[60px]">
                      <button 
                        onClick={toggleVideo}
                        className={`w-10 h-10 rounded-full border-none flex items-center justify-center transition-all duration-200 active:scale-95 focus-ring ${
                          !isVideoOn ? 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800' : 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 hover:bg-blue-200'
                        }`}
                      >
                        {isVideoOn ? <Video size={18} /> : <VideoOff size={18} />}
                      </button>
                      <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 flex items-center justify-center text-center">Vision</span>
                    </div>

                    <div className="flex flex-col items-center gap-2 min-w-[60px]">
                      <button 
                        onClick={startLiveSession}
                        className={`w-10 h-10 rounded-full border-none flex items-center justify-center transition-all duration-200 active:scale-95 focus-ring ${isLiveActive ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700'}`}
                      >
                        {isLiveActive ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                      </button>
                      <span className="text-xs uppercase tracking-widest text-gray-600 dark:text-gray-400 flex items-center justify-center text-center">{isLiveActive ? 'End' : 'Start'}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
            </div>
          </Panel>

          {!isMobile && (
            <>
              <Separator className="w-px h-full bg-gray-100 dark:bg-gray-800" />

              {/* Column 2: Chat & Context Tabs */}
              <Panel 
                defaultSize={(isTablet && isLandscape) ? 40 : 25} 
                minSize={25} 
                className="flex flex-col bg-white dark:bg-gray-950 overflow-hidden relative h-full"
              >
                {/* Metrics Section (Updated Location & Styling) */}
                <div className="border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
                  <button 
                    onClick={() => setIsLogsOpen(!isLogsOpen)}
                    className="w-full h-14 mx-0 pt-2 px-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 transition-colors uppercase tracking-widest focus-ring"
                  >
                    <div className="flex items-center gap-3">
                      {isLogsOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                      <span>METRICS</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono">
                        {tokenUsage.total.toLocaleString()} TOKENS
                      </span>
                    </div>
                  </button>
                  
                  <AnimatePresence>
                    {isLogsOpen && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 160, opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900"
                      >
                        <div className="h-full overflow-y-auto p-4 font-mono text-xs space-y-1.5 text-gray-600 dark:text-gray-400">
                          {debugLogs.map((log, i) => (
                            <div key={i} className="flex gap-2">
                              <span className="opacity-50">[{i}]</span>
                              <span className="break-all">{log}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Tabs Header */}
                <div className="flex bg-white dark:bg-gray-950">
                  <button
                    onClick={() => setActiveTab('chat')}
                    className={`flex-1 flex gap-2 items-center justify-center py-4 px-4 text-xs uppercase tracking-widest border-b-2 transition-all focus-ring ${activeTab === 'chat' ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-500' : 'text-gray-400 dark:text-gray-500 border-transparent hover:text-gray-600 dark:hover:text-gray-400 dark::text-gray-500'}`}
                  >
                    <MessageSquare size={16} /> Chat
                  </button>
                  <button
                    onClick={() => setActiveTab('context')}
                    className={`flex-1 flex gap-2 items-center justify-center py-4 px-4 text-xs uppercase tracking-widest border-b-2 transition-all focus-ring ${activeTab === 'context' ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-500' : 'text-gray-400 dark:text-gray-500 border-transparent hover:text-gray-600 dark:hover:text-gray-400 dark::text-gray-500'}`}
                  >
                    <Lightbulb size={16} /> Saved Notes
                  </button>
                </div>

                {/* Tab Content: Chat */}
                {activeTab === 'chat' && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 flex justify-end">
                      {messages.length > 0 && (
                        <button 
                          onClick={exportChatToDocx}
                          className="inline-flex items-center justify-center gap-x-2 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer focus-ring"
                        >
                          <Download size={16} />
                          <span>Export Chat</span>
                        </button>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      {messages.map((msg) => (
                        <motion.div 
                          key={msg.id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className="relative max-w-[90%]">
                            <div className={`p-3 rounded-xl border ${
                              msg.role === 'user' 
                                ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100' 
                                : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'
                            }`}>
                              {msg.imageUrl && (
                                <div className={`mb-2 overflow-hidden rounded-md border border-zinc-800 w-full max-w-[240px] aspect-video ${msg.role === 'user' ? 'ml-auto' : ''}`}>
                                  <img src={msg.imageUrl} alt="Context capture" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                </div>
                              )}
                              {msg.text && <p className="text-sm leading-relaxed overflow-wrap-anywhere">{msg.text}</p>}

                              <div className="flex items-center justify-between mt-1 gap-4">
                                <span className={`text-xs font-semibold uppercase tracking-wider ${msg.role === 'user' ? 'text-blue-800 dark:text-blue-200' : 'text-gray-700 dark:text-gray-300'}`}>
                                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {msg.role === 'user' ? 'You' : 'Thia'}
                                </span>
                                <div className="relative">
                                  <button
                                    onClick={() => setActiveChatMenuId(activeChatMenuId === msg.id ? null : msg.id)}
                                    className={`p-1 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors focus-ring ${msg.role === 'user' ? 'hover:bg-blue-100 dark:hover:bg-blue-900' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                  >
                                    <MoreHorizontal size={14} />
                                  </button>
                                  {activeChatMenuId === msg.id && (
                                    <>
                                      <div className="fixed inset-0 z-40" onClick={() => setActiveChatMenuId(null)} />
                                      <div className="absolute top-full right-0 mt-1 z-50 w-32 bg-white dark:bg-gray-950 shadow-md border border-gray-200 dark:border-gray-700 rounded-lg py-1 dark:shadow-gray-900/50">
                                        <button
                                          onClick={() => { deleteMessage(msg.id); setActiveChatMenuId(null); }}
                                          className="w-full flex items-center gap-x-2 py-2 px-3 text-xs text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900 focus-ring focus:bg-red-100 dark:focus:bg-red-900 transition-colors dark:text-red-500 dark:hover:bg-red-950 dark:hover:text-red-400 dark:focus:bg-red-950 dark:focus:text-red-400"
                                        >
                                          <Trash2 size={16} />
                                          Delete
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            {msg.capturedIdeaId && (
                              <motion.button
                                onClick={() => scrollToIdea(msg.capturedIdeaId!)}
                                initial={{ opacity: 0, scale: 0.5, y: 10, x: 10, rotate: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0, x: 0, rotate: -6 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                                className="absolute -bottom-3 -right-3 bg-yellow-100 dark:bg-yellow-400 border border-yellow-400 dark:border-yellow-500 text-[#422006] p-1.5 rounded-sm shadow-md flex items-center justify-center z-20 cursor-pointer hover:bg-yellow-200 dark:hover:bg-yellow-500 hover:rotate-0 transition-transform active:scale-95 focus-ring"
                                title="Idea captured! Click to view."
                              >
                                <StickyNote size={16} className="fill-[#422006]/20 text-[#422006]" />
                              </motion.button>
                            )}
                          </div>
                        </motion.div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                    {/* Text Input Area */}
                    <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col gap-2">
                      {stagedFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-1">
                          {stagedFiles.map(f => (
                            <div key={f.name} className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full text-xs text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                              <span className="truncate max-w-[150px]">{f.name}</span>
                              <button
                                type="button"
                                onClick={() => removeStagedFile(f.name)}
                                className="text-gray-500 hover:text-red-500 transition-colors focus-ring rounded-full p-0.5"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <form onSubmit={handleSendMessage} className="flex gap-2">
                        <input 
                          type="text" 
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          placeholder={isLiveActive ? "Send a message..." : "Start a session to chat"}
                          disabled={!isLiveActive}
                          className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus-ring transition-all disabled:opacity-50"
                        />
                        <button
                          type="button"
                          disabled={!isLiveActive}
                          onClick={() => fileInputRef.current?.click()}
                          className="w-10 h-[42px] flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all disabled:opacity-50 focus-ring"
                        >
                          <CirclePlus size={18} />
                        </button>
                        <button 
                          type="submit"
                          disabled={!isLiveActive || (!inputText.trim() && stagedFiles.length === 0)}
                          className="inline-flex items-center justify-center gap-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 active:scale-[0.98] focus-ring"
                        >
                          <Send size={16} />
                        </button>
                      </form>
                    </div>
                  </div>
                )}

                {/* Tab Content: Captured Context */}
                {activeTab === 'context' && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 flex justify-end">
                      {capturedIdeas.length > 0 && (
                        <button 
                          onClick={downloadIdeas}
                          className="inline-flex items-center justify-center gap-x-2 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer focus-ring"
                        >
                          <Download size={16} />
                          <span>Export Notes</span>
                        </button>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50 dark:bg-gray-900/50">
                      {capturedIdeas.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 opacity-50">
                          <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center border border-gray-200 dark:border-gray-700">
                            <Lightbulb size={20} className="text-gray-500 dark:text-gray-400" />
                          </div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tell Thia to save a note and it will be added here.</p>
                        </div>
                      ) : (
                        capturedIdeas.map((idea) => (
                          <motion.div 
                            key={idea.id}
                            id={`idea-${idea.id}`}
                            initial={{ opacity: 0, x: 5 }}
                            animate={{ 
                              opacity: 1, 
                              x: 0,
                              boxShadow: highlightedIdeaId === idea.id ? "0 0 12px 3px rgba(234, 179, 8, 0.3)" : "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"
                            }}
                            transition={{ duration: 0.3 }}
                            className={`border p-4 rounded-none group relative bg-yellow-100 dark:bg-yellow-400 ${highlightedIdeaId === idea.id ? 'border-yellow-500 z-10' : 'border-yellow-300 dark:border-yellow-500'}`}
                          >
                            <p className="text-base text-[#422006] font-semibold leading-relaxed font-sans mb-3">{idea.text}</p>
                            {idea.imageUrl && (
                              <div className="mb-3 overflow-hidden rounded-md border border-[#422006]/30 w-full aspect-video">
                                <img src={idea.imageUrl} alt="Captured Context" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              </div>
                            )}
                            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-[#422006]/80 mt-1 gap-4">
                              <span className="flex items-center gap-1.5">
                                {idea.source === 'thia' ? 'Recorded by Thia' : 'Captured by You'}
                              </span>
                              <div className="flex items-center gap-2">
                                <span>{idea.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                <div className="relative">
                                  <button
                                    onClick={() => setActiveStickyMenuId(activeStickyMenuId === idea.id ? null : idea.id)}
                                    className="p-1 rounded-md text-[#422006]/60 hover:text-[#422006] transition-colors focus-ring hover:bg-yellow-200 dark:hover:bg-yellow-500"
                                  >
                                    <MoreHorizontal size={14} />
                                  </button>
                                  {activeStickyMenuId === idea.id && (
                                    <>
                                      <div className="fixed inset-0 z-40" onClick={() => setActiveStickyMenuId(null)} />
                                      <div className="absolute top-full right-0 mt-1 z-50 w-32 bg-white dark:bg-gray-950 shadow-md border border-gray-200 dark:border-gray-700 rounded-lg py-1 dark:shadow-gray-900/50">
                                        <button
                                          onClick={() => { setCapturedIdeas(prev => prev.filter(i => i.id !== idea.id)); setActiveStickyMenuId(null); }}
                                          className="w-full flex items-center gap-x-2 py-2 px-3 text-xs text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900 focus-ring focus:bg-red-100 dark:focus:bg-red-900 transition-colors dark:text-red-500 dark:hover:bg-red-950 dark:hover:text-red-400 dark:focus:bg-red-950 dark:focus:text-red-400"
                                        >
                                          <Trash2 size={16} />
                                          Delete
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* System Logs Accordion (Always visible at bottom of active tab) */}
              </Panel>
            </>
          )}
        </Group>

        <AnimatePresence>
          {isMobile && isMobileDrawerOpen && (
            <motion.div
              initial={{ opacity: 0, y: isLandscape ? 0 : 10, x: isLandscape ? 10 : 0, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
              exit={{ opacity: 0, y: isLandscape ? 0 : 10, x: isLandscape ? 10 : 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-[100] flex flex-col bg-white dark:bg-gray-950 shadow-2xl pointer-events-auto overflow-hidden"
            >
              <div className="h-14 px-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex-shrink-0">
                <span className="font-semibold text-sm">Session Data</span>
                <button onClick={() => setIsMobileDrawerOpen(false)} className="p-2 -mr-2 text-gray-500 dark:text-gray-400 focus-ring rounded-md">
                  <X size={20} />
                </button>
              </div>

              {/* Metrics Section (Updated Location & Styling) */}
              <div className="border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
                <button 
                  onClick={() => setIsLogsOpen(!isLogsOpen)}
                  className="w-full h-14 mx-0 pt-2 px-4 flex items-center justify-between text-xs text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors uppercase tracking-widest"
                >
                  <div className="flex items-center gap-3">
                    {isLogsOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    <span>METRICS</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-900 dark:text-gray-100 font-mono">
                      {tokenUsage.total.toLocaleString()} TOKENS
                    </span>
                  </div>
                </button>
                
                <AnimatePresence>
                  {isLogsOpen && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 160, opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900"
                    >
                      <div className="h-full overflow-y-auto p-4 font-mono text-xs space-y-1.5 text-gray-600 dark:text-gray-400">
                        {debugLogs.map((log, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="opacity-50">[{i}]</span>
                            <span className="break-all">{log}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Tabs Header */}
              <div className="flex bg-white dark:bg-gray-950">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`flex-1 flex gap-2 items-center justify-center py-4 px-4 text-xs uppercase tracking-widest border-b-2 transition-all ${activeTab === 'chat' ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-500' : 'text-gray-400 dark:text-gray-500 border-transparent hover:text-gray-600 dark:hover:text-gray-400 dark::text-gray-500'}`}
                >
                  <MessageSquare size={16} /> Chat
                </button>
                <button
                  onClick={() => setActiveTab('context')}
                  className={`flex-1 flex gap-2 items-center justify-center py-4 px-4 text-xs uppercase tracking-widest border-b-2 transition-all ${activeTab === 'context' ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-500' : 'text-gray-400 dark:text-gray-500 border-transparent hover:text-gray-600 dark:hover:text-gray-400 dark::text-gray-500'}`}
                >
                  <Lightbulb size={16} /> Saved Notes
                </button>
              </div>

              {/* Tab Content: Chat */}
              {activeTab === 'chat' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 flex justify-end">
                    {messages.length > 0 && (
                      <button 
                        onClick={exportChatToDocx}
                        className="inline-flex items-center justify-center gap-x-2 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer focus-ring"
                      >
                        <Download size={16} />
                        <span>Export Chat</span>
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {messages.map((msg) => (
                      <motion.div 
                        key={msg.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className="relative max-w-[90%]">
                          <div className={`p-3 rounded-xl border ${
                            msg.role === 'user' 
                              ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100' 
                              : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'
                          }`}>
                            {msg.imageUrl && (
                              <div className={`mb-2 overflow-hidden rounded-md border border-zinc-800 w-full max-w-[240px] aspect-video ${msg.role === 'user' ? 'ml-auto' : ''}`}>
                                <img src={msg.imageUrl} alt="Context capture" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              </div>
                            )}
                            {msg.text && <p className="text-sm leading-relaxed overflow-wrap-anywhere">{msg.text}</p>}

                            <div className="flex items-center justify-between mt-1 gap-4">
                              <span className={`text-xs font-semibold uppercase tracking-wider ${msg.role === 'user' ? 'text-blue-800 dark:text-blue-200' : 'text-gray-700 dark:text-gray-300'}`}>
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {msg.role === 'user' ? 'You' : 'Thia'}
                              </span>
                              <div className="relative">
                                <button
                                  onClick={() => setActiveChatMenuId(activeChatMenuId === msg.id ? null : msg.id)}
                                  className={`p-1 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors focus-ring ${msg.role === 'user' ? 'hover:bg-blue-100 dark:hover:bg-blue-900' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                >
                                  <MoreHorizontal size={14} />
                                </button>
                                {activeChatMenuId === msg.id && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setActiveChatMenuId(null)} />
                                    <div className="absolute top-full right-0 mt-1 z-50 w-32 bg-white dark:bg-gray-950 shadow-md border border-gray-200 dark:border-gray-700 rounded-lg py-1 dark:shadow-gray-900/50">
                                      <button
                                        onClick={() => { deleteMessage(msg.id); setActiveChatMenuId(null); }}
                                        className="w-full flex items-center gap-x-2 py-2 px-3 text-xs text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900 focus-ring focus:bg-red-100 dark:focus:bg-red-900 transition-colors dark:text-red-500 dark:hover:bg-red-950 dark:hover:text-red-400 dark:focus:bg-red-950 dark:focus:text-red-400"
                                      >
                                        <Trash2 size={16} />
                                        Delete
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          {msg.capturedIdeaId && (
                            <motion.button
                              onClick={() => scrollToIdea(msg.capturedIdeaId!)}
                              initial={{ opacity: 0, scale: 0.5, y: 10, x: 10, rotate: 10 }}
                              animate={{ opacity: 1, scale: 1, y: 0, x: 0, rotate: -6 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                              className="absolute -bottom-3 -right-3 bg-yellow-100 dark:bg-yellow-400 border border-yellow-400 dark:border-yellow-500 text-[#422006] p-1.5 rounded-sm shadow-md flex items-center justify-center z-20 cursor-pointer hover:bg-yellow-200 dark:hover:bg-yellow-500 hover:rotate-0 transition-transform active:scale-95 focus-ring"
                              title="Idea captured! Click to view."
                            >
                              <StickyNote size={16} className="fill-[#422006]/20 text-[#422006]" />
                            </motion.button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  {/* Text Input Area */}
                  <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col gap-2">
                    {stagedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-1">
                        {stagedFiles.map(f => (
                          <div key={f.name} className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full text-xs text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                            <span className="truncate max-w-[150px]">{f.name}</span>
                            <button
                              type="button"
                              onClick={() => removeStagedFile(f.name)}
                              className="text-gray-500 hover:text-red-500 transition-colors focus-ring rounded-full p-0.5"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <form onSubmit={handleSendMessage} className="flex gap-2">
                      <input 
                        type="text" 
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder={isLiveActive ? "Send a message..." : "Start a session to chat"}
                        disabled={!isLiveActive}
                        className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus-ring transition-all disabled:opacity-50"
                      />
                      <button
                        type="button"
                        disabled={!isLiveActive}
                        onClick={() => fileInputRef.current?.click()}
                        className="w-10 h-[42px] flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all disabled:opacity-50 focus-ring"
                      >
                        <CirclePlus size={18} />
                      </button>
                      <button 
                        type="submit"
                        disabled={!isLiveActive || (!inputText.trim() && stagedFiles.length === 0)}
                        className="inline-flex items-center justify-center gap-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 active:scale-[0.98] focus-ring"
                      >
                        <Send size={16} />
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* Tab Content: Captured Context */}
              {activeTab === 'context' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 flex justify-end">
                    {capturedIdeas.length > 0 && (
                      <button 
                        onClick={downloadIdeas}
                        className="inline-flex items-center justify-center gap-x-2 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer focus-ring"
                      >
                        <Download size={16} />
                        <span>Export Notes</span>
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50 dark:bg-gray-900/50">
                    {capturedIdeas.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 opacity-50">
                        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center border border-gray-200 dark:border-gray-700">
                          <Lightbulb size={20} className="text-gray-500 dark:text-gray-400" />
                        </div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tell Thia to save a note and it will be added here.</p>
                      </div>
                    ) : (
                      capturedIdeas.map((idea) => (
                        <motion.div 
                          key={idea.id}
                          id={`idea-${idea.id}`}
                          initial={{ opacity: 0, x: 5 }}
                          animate={{ 
                            opacity: 1, 
                            x: 0,
                            boxShadow: highlightedIdeaId === idea.id ? "0 0 12px 3px rgba(234, 179, 8, 0.3)" : "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"
                          }}
                          transition={{ duration: 0.3 }}
                          className={`border p-4 rounded-none group relative bg-yellow-100 dark:bg-yellow-400 ${highlightedIdeaId === idea.id ? 'border-yellow-500 z-10' : 'border-yellow-300 dark:border-yellow-500'}`}
                        >
                          <p className="text-base text-[#422006] font-semibold leading-relaxed font-sans mb-3">{idea.text}</p>
                          {idea.imageUrl && (
                            <div className="mb-3 overflow-hidden rounded-md border border-[#422006]/30 w-full aspect-video">
                              <img src={idea.imageUrl} alt="Captured Context" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </div>
                          )}
                          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-[#422006]/80 mt-1 gap-4">
                            <span className="flex items-center gap-1.5">
                              {idea.source === 'thia' ? 'Recorded by Thia' : 'Captured by You'}
                            </span>
                            <div className="flex items-center gap-2">
                              <span>{idea.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              <div className="relative">
                                <button
                                  onClick={() => setActiveStickyMenuId(activeStickyMenuId === idea.id ? null : idea.id)}
                                  className="p-1 rounded-md text-[#422006]/60 hover:text-[#422006] transition-colors focus-ring hover:bg-yellow-200 dark:hover:bg-yellow-500"
                                >
                                  <MoreHorizontal size={14} />
                                </button>
                                {activeStickyMenuId === idea.id && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setActiveStickyMenuId(null)} />
                                    <div className="absolute top-full right-0 mt-1 z-50 w-32 bg-white dark:bg-gray-950 shadow-md border border-gray-200 dark:border-gray-700 rounded-lg py-1 dark:shadow-gray-900/50">
                                      <button
                                        onClick={() => { setCapturedIdeas(prev => prev.filter(i => i.id !== idea.id)); setActiveStickyMenuId(null); }}
                                        className="w-full flex items-center gap-x-2 py-2 px-3 text-xs text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900 focus-ring focus:bg-red-100 dark:focus:bg-red-900 transition-colors dark:text-red-500 dark:hover:bg-red-950 dark:hover:text-red-400 dark:focus:bg-red-950 dark:focus:text-red-400"
                                      >
                                        <Trash2 size={16} />
                                        Delete
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
