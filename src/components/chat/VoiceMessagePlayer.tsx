'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';
import { cn } from '@/utils/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoiceMessagePlayerProps {
  audioUrl: string;
  duration: number;        // recorded duration in seconds (fallback before metadata loads)
  transcript?: string;     // optional auto-transcript to show below player
  /** 'user' → purple bubble style; 'agent' → dark bubble style */
  variant?: 'user' | 'agent';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Static waveform bars — purely decorative, consistent per-message
const BAR_COUNT = 28;
function buildBarHeights(seed: string): number[] {
  // Deterministic heights from the audioUrl hash so they're stable across renders
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0xffffffff;
  }
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const val = Math.sin(hash + i * 1.7) * 0.5 + 0.5; // 0–1
    return Math.max(0.15, val);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VoiceMessagePlayer({
  audioUrl,
  duration,
  transcript,
  variant = 'user',
}: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [actualDuration, setActualDuration] = useState(duration);
  const [showTranscript, setShowTranscript] = useState(false);
  const [hasMissingAudio, setHasMissingAudio] = useState(!audioUrl);

  const barHeights = buildBarHeights(audioUrl.slice(-40)); // use tail of URL as seed

  // ── Wire up audio element events ─────────────────────────────────────────────
  useEffect(() => {
    if (!audioUrl || (!audioUrl.startsWith('data:audio/') && !/^https?:\/\//.test(audioUrl))) {
      setHasMissingAudio(true);
      setIsPlaying(false);
      return;
    }

    setHasMissingAudio(false);
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => {
      if (isFinite(audio.duration)) setActualDuration(audio.duration);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onError = () => {
      setIsPlaying(false);
      setHasMissingAudio(true);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('loadedmetadata', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    // Trigger metadata load without playing
    audio.preload = 'metadata';
    audio.load();

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('loadedmetadata', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [audioUrl]);

  // ── Controls ─────────────────────────────────────────────────────────────────
  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = parseFloat(e.target.value);
    audio.currentTime = t;
    setCurrentTime(t);
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const progress = actualDuration > 0 ? currentTime / actualDuration : 0;
  const isUser = variant === 'user';

  if (hasMissingAudio) {
    return (
      <div className="flex flex-col gap-1.5">
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm max-w-xs border',
            isUser
              ? 'bg-[#7C3AED]/30 text-purple-100 border-purple-700/40'
              : 'bg-gray-900/80 text-gray-300 border-gray-800',
          )}
        >
          Voice message unavailable — browser storage was cleared or the audio file was evicted.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* ── Player bubble ── */}
      <div
        className={cn(
          'flex items-center gap-3 rounded-2xl px-4 py-3 min-w-[220px] max-w-xs',
          isUser
            ? 'bg-[#7C3AED]'
            : 'bg-gray-900/80 border border-gray-800',
        )}
      >
        {/* Play / Pause button */}
        <button
          onClick={togglePlayback}
          aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
          className={cn(
            'shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors',
            isUser
              ? 'bg-white/20 hover:bg-white/30 text-white'
              : 'bg-purple-600/30 hover:bg-purple-600/50 text-purple-300',
          )}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 translate-x-0.5" />
          )}
        </button>

        {/* Waveform + seek */}
        <div className="flex-1 flex flex-col gap-1.5">
          {/* Waveform bars */}
          <div className="relative flex items-center gap-[2px] h-8" aria-hidden>
            {barHeights.map((h, i) => {
              const filled = i / BAR_COUNT <= progress;
              return (
                <div
                  key={i}
                  style={{ height: `${Math.round(h * 100)}%` }}
                  className={cn(
                    'w-[3px] rounded-full transition-colors duration-100',
                    filled
                      ? isUser
                        ? 'bg-white'
                        : 'bg-purple-400'
                      : isUser
                      ? 'bg-white/35'
                      : 'bg-gray-600',
                  )}
                />
              );
            })}

            {/* Invisible range input layered over the bars for seek */}
            <input
              type="range"
              min={0}
              max={actualDuration || 1}
              step={0.05}
              value={currentTime}
              onChange={handleSeek}
              aria-label="Seek voice message"
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            />
          </div>

          {/* Time display */}
          <div
            className={cn(
              'flex justify-between text-[10px] tabular-nums leading-none',
              isUser ? 'text-white/70' : 'text-gray-500',
            )}
          >
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(actualDuration)}</span>
          </div>
        </div>

        {/* Transcript toggle (only if transcript exists) */}
        {transcript && (
          <button
            onClick={() => setShowTranscript((v) => !v)}
            aria-label={showTranscript ? 'Hide transcript' : 'Show transcript'}
            title={showTranscript ? 'Hide transcript' : 'Show transcript'}
            className={cn(
              'shrink-0 p-1 rounded transition-colors',
              isUser
                ? 'text-white/70 hover:text-white'
                : 'text-gray-500 hover:text-gray-300',
            )}
          >
            <Volume2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Transcript panel ── */}
      {transcript && showTranscript && (
        <div
          className={cn(
            'rounded-xl px-3 py-2 text-xs leading-relaxed max-w-xs',
            isUser
              ? 'bg-[#7C3AED]/30 text-purple-200 border border-purple-700/40'
              : 'bg-gray-900/60 text-gray-400 border border-gray-800',
          )}
        >
          <span className="font-medium mr-1 opacity-60">Transcript:</span>
          {transcript}
        </div>
      )}
    </div>
  );
}
