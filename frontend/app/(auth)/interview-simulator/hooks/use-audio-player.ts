"use client";

import { useCallback, useRef, useState } from "react";

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  play: (url: string) => Promise<void>;
  playText: (text: string, voice?: string) => void;
  stop: () => void;
  kokoroAvailable: boolean;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [kokoroAvailable, setKokoroAvailable] = useState(true);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
  }, []);

  const play = useCallback(
    async (url: string): Promise<void> => {
      stop();
      return new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        setIsPlaying(true);

        audio.onended = () => {
          setIsPlaying(false);
          audioRef.current = null;
          resolve();
        };

        audio.onerror = () => {
          setIsPlaying(false);
          audioRef.current = null;
          setKokoroAvailable(false);
          reject(new Error("Audio playback failed"));
        };

        audio.play().catch((err) => {
          setIsPlaying(false);
          audioRef.current = null;
          reject(err);
        });
      });
    },
    [stop]
  );

  const playText = useCallback(
    (text: string, voice?: string) => {
      stop();
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      if (voice) {
        const voices = window.speechSynthesis.getVoices();
        const match = voices.find(
          (v) => v.name.toLowerCase().includes(voice.toLowerCase())
        );
        if (match) utterance.voice = match;
      }

      utteranceRef.current = utterance;
      setIsPlaying(true);

      utterance.onend = () => {
        setIsPlaying(false);
        utteranceRef.current = null;
      };

      utterance.onerror = () => {
        setIsPlaying(false);
        utteranceRef.current = null;
      };

      window.speechSynthesis.speak(utterance);
    },
    [stop]
  );

  return { isPlaying, play, playText, stop, kokoroAvailable };
}
