"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Plays Mandarin TTS from /api/tts. Centralizes the lifecycle so every caller
 * gets the same guarantees: a new play() aborts the previous fetch and stops the
 * previous clip (no overlap), and the object URL is always revoked — on end,
 * error, abort, or unmount (no blob-URL leaks). Use ONE instance per surface
 * (e.g. lift it to the list component) so all of its buttons share one player.
 */
export function useAudioPlayer() {
  const controllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);

  const release = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    release();
    setLoading(false);
  }, [release]);

  const play = useCallback(
    async (text: string, voice?: string) => {
      controllerRef.current?.abort();
      release();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      try {
        const params = new URLSearchParams({ text });
        if (voice) params.set("voice", voice);
        const res = await fetch(`/api/tts?${params.toString()}`, { signal: controller.signal });
        if (!res.ok || controller.signal.aborted) return;
        const blob = await res.blob();
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        const revoke = () => {
          if (urlRef.current === url) {
            URL.revokeObjectURL(url);
            urlRef.current = null;
          }
        };
        audio.onended = revoke;
        audio.onerror = revoke;
        await audio.play();
      } catch {
        release();
      } finally {
        if (controllerRef.current === controller) setLoading(false);
      }
    },
    [release],
  );

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      release();
    };
  }, [release]);

  return { play, stop, loading };
}
