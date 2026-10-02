"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Browser Speech API (webkitSpeechRecognition on Safari/Chrome). Falls back
// gracefully: `supported` is false and the UI shows the keyboard (whose own
// dictation mic works everywhere, including the iOS PWA).

type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getCtor(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeech(opts: { lang?: string; onFinal?: (text: string) => void } = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const onFinal = useRef(opts.onFinal);
  useEffect(() => {
    onFinal.current = opts.onFinal;
  });

  useEffect(() => setSupported(!!getCtor()), []);

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    setError(null);
    setInterim("");
    setFinalText("");
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = opts.lang ?? (typeof navigator !== "undefined" ? navigator.language : "en-US");
    let acc = "";
    r.onresult = (e) => {
      let tmp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) acc += res[0].transcript + " ";
        else tmp += res[0].transcript;
      }
      setFinalText(acc.trim());
      setInterim(tmp);
    };
    r.onerror = (e) => {
      setError(e.error === "not-allowed" ? "Microphone permission denied" : e.error);
      setListening(false);
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
      if (acc.trim()) onFinal.current?.(acc.trim());
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [opts.lang]);

  useEffect(() => () => rec.current?.abort(), []);

  return { supported, listening, interim, finalText, error, start, stop };
}
