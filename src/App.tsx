/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Mic, MicOff, Play, Loader2, CheckCircle2, Volume2, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Constants & Types ---

const EMBEDDING_MODEL = "models/gemini-embedding-2-preview";
const CACHE_KEY = "whispergrid_video_embeddings_v1";

interface VideoItem {
  id: string;
  url: string;
  label: string;
  embedding?: number[];
}

const VIDEO_LIBRARY: VideoItem[] = [
  { id: '1', label: 'Video 1', url: '/videos/1.mp4' },
  { id: '2', label: 'Video 2', url: '/videos/2.mp4' },
  { id: '3', label: 'Video 3', url: '/videos/3.mp4' },
  { id: '4', label: 'Video 4', url: '/videos/4.mp4' },
  { id: '5', label: 'Video 5', url: '/videos/5.mp4' },
  { id: '6', label: 'Video 6', url: '/videos/6.mp4' },
  { id: '7', label: 'Video 7', url: '/videos/7.mp4' },
  { id: '8', label: 'Video 8', url: '/videos/8.mp4' },
  { id: '9', label: 'Video 9', url: '/videos/9.mp4' },
];

// --- Utilities ---

function AudioVisualizer({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;
        
        // Create a nice gradient or solid color
        ctx.fillStyle = `rgba(16, 185, 129, ${0.3 + (dataArray[i] / 255)})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
    return () => cancelAnimationFrame(animationId);
  }, [analyser]);

  return (
    <canvas 
      ref={canvasRef} 
      width={120} 
      height={40} 
      className="rounded-lg opacity-80"
    />
  );
}

function cosineSimilarity(a: number[], b: number[]) {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
}

async function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- Components ---

export default function App() {
  const [videos, setVideos] = useState<VideoItem[]>(VIDEO_LIBRARY);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [winningScore, setWinningScore] = useState<number | null>(null);
  const [currentlyEmbeddingId, setCurrentlyEmbeddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const aiRef = useRef<any>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      setError("Gemini API Key is missing. Please configure it in the Secrets panel.");
      setIsInitializing(false);
      return;
    }
    aiRef.current = new GoogleGenAI({ apiKey });
    initializeEmbeddings();
  }, []);

  const initializeEmbeddings = async () => {
    try {
      // 1. Try to load from cache
      const cachedData = localStorage.getItem(CACHE_KEY);
      if (cachedData) {
        try {
          const cachedEmbeddings = JSON.parse(cachedData);
          // Simple validation: check if we have embeddings for all videos
          const updatedVideos = VIDEO_LIBRARY.map(video => ({
            ...video,
            embedding: cachedEmbeddings[video.id]
          }));

          if (updatedVideos.every(v => v.embedding)) {
            console.log("Loaded embeddings from cache");
            setVideos(updatedVideos);
            setIsInitializing(false);
            return;
          }
        } catch (cacheErr) {
          console.warn("Failed to parse cached embeddings:", cacheErr);
          localStorage.removeItem(CACHE_KEY);
        }
      }

      console.log("Cache miss or invalid. Generating new embeddings...");
      const updatedVideos = [...videos];
      const newCache: Record<string, number[]> = {};

      for (let i = 0; i < updatedVideos.length; i++) {
        const video = updatedVideos[i];
        setCurrentlyEmbeddingId(video.id);
        
        try {
          // Fetch local video file directly
          const response = await fetch(video.url);
          if (!response.ok) {
            console.error(`Failed to load ${video.url}: ${response.status}`);
            continue;
          }
          
          const blob = await response.blob();
          const base64 = await fileToDataUrl(blob);
          const data = base64.split(',')[1];
          
          if (!data) continue;

          // Gemini Embedding API has a limit (usually ~20MB for inlineData)
          if (data.length > 20 * 1024 * 1024 * 1.33) {
            console.warn(`Video ${video.label} too large. Skipping.`);
            continue;
          }

          const result = await aiRef.current.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: [{
              inlineData: {
                data,
                mimeType: "video/mp4"
              }
            }]
          });

          const embedding = result.embeddings[0].values;
          updatedVideos[i] = { ...video, embedding };
          newCache[video.id] = embedding;
        } catch (videoErr) {
          console.error(`Error embedding video ${video.label}:`, videoErr);
        }
      }

      // Save to cache if we got some results
      if (Object.keys(newCache).length > 0) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(newCache));
      }

      setVideos(updatedVideos);
      setCurrentlyEmbeddingId(null);
    } catch (err) {
      console.error("Failed to initialize embeddings:", err);
      setError("Failed to pre-embed video library. Check console for details.");
      setCurrentlyEmbeddingId(null);
    } finally {
      setIsInitializing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Set up Audio Analysis
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 64; // Small for a simple visualizer
      source.connect(analyserNode);
      
      audioContextRef.current = audioContext;
      setAnalyser(analyserNode);

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
        
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
          setAnalyser(null);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setWinnerId(null);
      setWinningScore(null);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    if (audioBlob.size === 0) {
      setError("Recorded audio is empty. Please try again.");
      return;
    }

    setIsProcessing(true);
    try {
      const base64 = await fileToDataUrl(audioBlob);
      const data = base64.split(',')[1];

      if (!data || data.length === 0) {
        throw new Error(`Failed to extract base64 data from audio. Base64 length: ${base64.length}`);
      }

      console.log(`Embedding audio, data length: ${data.length}`);

      // Embed the audio
      const result = await aiRef.current.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: [{
          inlineData: {
            data,
            mimeType: "audio/wav"
          }
        }]
      });

      const audioEmbedding = result.embeddings[0].values;

      // Find best match
      let maxSim = -1;
      let bestId = null;

      videos.forEach(video => {
        if (video.embedding) {
          const sim = cosineSimilarity(audioEmbedding, video.embedding);
          if (sim > maxSim) {
            maxSim = sim;
            bestId = video.id;
          }
        }
      });

      setWinnerId(bestId);
      setWinningScore(maxSim > -1 ? maxSim : null);
    } catch (err) {
      console.error("Error processing audio:", err);
      setError("Failed to embed audio. Try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // We no longer want a full-screen loader that hides the grid
  // but we still want to show a global state if needed.
  
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="max-w-6xl mx-auto pt-12 pb-8 px-6 flex flex-col items-center text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-4"
        >
          <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
            <Volume2 className="w-6 h-6 text-emerald-500" />
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">WhisperGrid</h1>
        </motion.div>
        <p className="text-zinc-400 max-w-xl text-lg leading-relaxed">
          Speak the vibe. Find the video.
        </p>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 pb-32">
        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {videos.map((video) => {
            const isEmbedding = currentlyEmbeddingId === video.id;
            const isMatching = isProcessing && !winnerId;
            const hasEmbedding = !!video.embedding;

            return (
              <motion.div
                key={video.id}
                layout
                className={`relative aspect-video rounded-2xl overflow-hidden border-2 transition-all duration-500 ${
                  winnerId === video.id 
                    ? 'border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.3)] scale-[1.02] z-10' 
                    : winnerId 
                      ? 'border-zinc-800/50 grayscale-[0.3] opacity-60'
                      : 'border-zinc-800/50'
                }`}
              >
                <video
                  src={`/api/proxy-video?url=${encodeURIComponent(video.url)}`}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className={`w-full h-full object-cover transition-opacity duration-500 ${!hasEmbedding ? 'opacity-20' : 'opacity-100'}`}
                />
                
                {/* Overlay for Loading/Processing */}
                <AnimatePresence>
                  {(isEmbedding || isMatching || !hasEmbedding) && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3"
                    >
                      {(isEmbedding || isMatching) ? (
                        <>
                          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                          <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-500 font-bold">
                            {isEmbedding ? 'Embedding' : 'Matching'}
                          </span>
                        </>
                      ) : (
                        !hasEmbedding && !isInitializing && (
                          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
                            Pending
                          </span>
                        )
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                  <span className="text-xs font-medium uppercase tracking-widest text-zinc-300">
                    {video.label}
                  </span>
                </div>
                
                <AnimatePresence>
                  {winnerId === video.id && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      className="absolute top-4 right-4 bg-emerald-500 text-white pl-3 pr-1.5 py-1.5 rounded-full shadow-lg flex items-center gap-2"
                    >
                      {winningScore !== null && (
                        <span className="text-[10px] font-bold tracking-tighter">
                          {(winningScore * 100).toFixed(1)}% Match
                        </span>
                      )}
                      <CheckCircle2 className="w-5 h-5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </main>

      {/* Controls Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-8 flex flex-col items-center gap-4 pointer-events-none">
        <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 p-4 rounded-3xl shadow-2xl flex items-center gap-6 pointer-events-auto">
          <AnimatePresence>
            {isRecording && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden flex items-center gap-3"
              >
                <div className="flex flex-col items-start px-2">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Live Input</span>
                  <AudioVisualizer analyser={analyser} />
                </div>
                <div className="h-8 w-[1px] bg-zinc-800 mx-2" />
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`relative w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${
              isRecording 
                ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]' 
                : 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isProcessing ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : isRecording ? (
              <MicOff className="w-8 h-8" />
            ) : (
              <Mic className="w-8 h-8" />
            )}
            
            {isRecording && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
              </span>
            )}
          </button>

          <div className="pr-4">
            <div className="text-sm font-medium text-zinc-200">
              {isProcessing ? "Analyzing Sound Waves..." : isRecording ? "Listening..." : "Ready to Search"}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              {isProcessing ? "Gemini is finding the match" : isRecording ? "Stop to find the match" : "Click mic to start"}
            </div>
          </div>
        </div>

        {/* Credits */}
        <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest text-zinc-600 pointer-events-auto">
          <span>Videos by <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors underline decoration-zinc-800 underline-offset-4">Pexels</a></span>
          <span className="w-1 h-1 rounded-full bg-zinc-800" />
          <span>Powered by <a href="https://ai.google.dev/gemini-api/docs/models/gemini#embedding" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors underline decoration-zinc-800 underline-offset-4">Gemini Embeddings 2</a></span>
        </div>
      </div>
    </div>
  );
}
