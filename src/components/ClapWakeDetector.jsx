import { useCallback, useEffect, useRef, useState } from "react";
import { AudioWaveform, Ear, EarOff } from "lucide-react";

const CLAP_WINDOW_MS = 1250;
const MIN_CLAP_GAP_MS = 140;
const CLAP_COOLDOWN_MS = 2600;

export default function ClapWakeDetector({ disabled = false, onDoubleClap }) {
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(0);
  const clapTimesRef = useRef([]);
  const lastPeakRef = useRef(0);
  const lastWakeRef = useRef(0);
  const noiseFloorRef = useRef(0.025);

  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("off");
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close?.();
    audioContextRef.current = null;
    clapTimesRef.current = [];
    setEnabled(false);
    setStatus("off");
  }, []);

  const start = useCallback(async () => {
    if (disabled || enabled) return;
    setError("");
    setStatus("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error("이 브라우저는 소리 감지를 지원하지 않습니다.");

      const context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.12;
      source.connect(analyser);

      const samples = new Uint8Array(analyser.fftSize);
      streamRef.current = stream;
      audioContextRef.current = context;
      setEnabled(true);
      setStatus("listening");
      localStorage.setItem("JAVIS_CLAP_WAKE_ENABLED", "1");

      const detect = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        let peak = 0;
        for (let index = 0; index < samples.length; index += 1) {
          const value = (samples[index] - 128) / 128;
          const absolute = Math.abs(value);
          sum += value * value;
          if (absolute > peak) peak = absolute;
        }

        const rms = Math.sqrt(sum / samples.length);
        const now = performance.now();
        const quiet = peak < 0.18;
        if (quiet) {
          noiseFloorRef.current = noiseFloorRef.current * 0.985 + rms * 0.015;
        }

        const threshold = Math.max(0.24, noiseFloorRef.current * 7.5);
        const sharpImpulse = peak > threshold && rms > noiseFloorRef.current * 2.7;
        const separated = now - lastPeakRef.current > MIN_CLAP_GAP_MS;

        if (sharpImpulse && separated && now - lastWakeRef.current > CLAP_COOLDOWN_MS) {
          lastPeakRef.current = now;
          clapTimesRef.current = [...clapTimesRef.current.filter((time) => now - time < CLAP_WINDOW_MS), now];
          setStatus(clapTimesRef.current.length === 1 ? "one" : "listening");

          if (clapTimesRef.current.length >= 2) {
            clapTimesRef.current = [];
            lastWakeRef.current = now;
            setStatus("detected");
            navigator.vibrate?.(45);
            onDoubleClap?.();
            window.setTimeout(() => setStatus("listening"), 1300);
          }
        }

        frameRef.current = requestAnimationFrame(detect);
      };

      detect();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setStatus("error");
      setError(message.includes("Permission") || message.includes("denied")
        ? "마이크 권한을 허용해야 박수 호출이 됩니다."
        : message);
      stop();
      setStatus("error");
    }
  }, [disabled, enabled, onDoubleClap, stop]);

  useEffect(() => stop, [stop]);

  const label = {
    off: "박수 호출 켜기",
    requesting: "마이크 연결 중",
    listening: "박수 2번 대기",
    one: "한 번 감지 · 한 번 더",
    detected: "자비스 호출됨",
    error: "박수 호출 재시도",
  }[status];

  return (
    <div className={`clapWake ${status}`} title={error || "박수 두 번으로 JAVIS를 호출합니다."}>
      <button type="button" onClick={enabled ? stop : start} disabled={disabled || status === "requesting"}>
        {enabled ? <Ear size={16} /> : status === "error" ? <EarOff size={16} /> : <AudioWaveform size={16} />}
        <span>{label}</span>
        <i />
      </button>
      {error && <small>{error}</small>}
    </div>
  );
}
