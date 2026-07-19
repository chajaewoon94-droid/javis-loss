import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AudioLines, Mic, MicOff, Radio, Volume2, X } from "lucide-react";

const FIXED_RATE = 1.0;
const FIXED_PITCH = 0.68;
const TARGET_VOICE = "Microsoft Hyunsu Multilingual Online (Natural)";

function voiceScore(voice) {
  const name = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  const lang = String(voice.lang || "").toLowerCase();
  let score = 0;

  if (lang === "ko-kr") score += 200;
  else if (lang.startsWith("ko")) score += 150;
  if (name.includes("hyunsu")) score += 150;
  if (name.includes("male")) score += 90;
  if (name.includes("microsoft")) score += 35;
  if (name.includes("natural")) score += 35;
  if (name.includes("neural")) score += 25;
  if (name.includes("sunhi") || name.includes("female")) score -= 100;

  return score;
}

function chooseVoice(voices) {
  if (!voices.length) return null;

  return (
    voices.find((voice) => voice.name === TARGET_VOICE) ||
    voices.find((voice) =>
      voice.name.includes("Microsoft Hyunsu Multilingual Online")
    ) ||
    voices.find((voice) => voice.name.includes("Microsoft Hyunsu")) ||
    voices.find((voice) => voice.name.includes("Hyunsu")) ||
    [...voices].sort((a, b) => voiceScore(b) - voiceScore(a))[0] ||
    null
  );
}

function normalizeSpeech(text) {
  return String(text || "")
    .replace(/JAVIS/gi, "자비스")
    .replace(/LOSS/gi, "로스")
    .replace(/\bFD\b/gi, "에프 디")
    .replace(/\bFL\b/gi, "에프 엘")
    .replace(/\bCR\b/gi, "씨 알")
    .replace(/\bEA\b/gi, "개")
    .replace(/\bAI\b/gi, "에이 아이")
    .replace(/\bSKU\b/gi, "에스 케이 유")
    .replace(/\s+/g, " ")
    .trim();
}

function splitCinematic(text) {
  const normalized = normalizeSpeech(text);
  if (!normalized) return [];

  return normalized
    .split(/(?<=[.!?。])\s+|(?<=다\.)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function createRecognition() {
  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition || null;
  return Recognition ? new Recognition() : null;
}

export default function VoiceAssistant({
  open,
  onClose,
  onCommand,
  briefingText = "",
}) {
  const recognitionRef = useRef(null);
  const speechTokenRef = useRef(0);
  const autoListenTimerRef = useRef(null);
  const openedOnceRef = useRef(false);

  const [voices, setVoices] = useState([]);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [armed, setArmed] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("VOICE CORE STANDBY");
  const [waveSeed, setWaveSeed] = useState(0);
  const [history, setHistory] = useState([]);

  const selectedVoice = useMemo(() => chooseVoice(voices), [voices]);

  useEffect(() => {
    function loadVoices() {
      setVoices(window.speechSynthesis?.getVoices?.() || []);
    }

    loadVoices();
    window.speechSynthesis?.addEventListener?.("voiceschanged", loadVoices);
    return () =>
      window.speechSynthesis?.removeEventListener?.("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    if (!open) {
      stopAll(false);
      openedOnceRef.current = false;
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      if (openedOnceRef.current) return;
      openedOnceRef.current = true;
      await speakCinematic(
        "차재운 대리님. 자비스 마크 텐 시스템이 온라인 상태입니다. 호출을 기다리겠습니다.",
        { autoResume: true, intro: true }
      );
    }, 320);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function addHistory(role, text) {
    setHistory((current) => [...current.slice(-5), { role, text }]);
  }

  function playSystemTone(kind = "boot") {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.connect(ctx.destination);
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(
        kind === "wake" ? 0.075 : 0.055,
        ctx.currentTime + 0.025
      );
      master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);

      const frequencies = kind === "wake" ? [330, 494] : [185, 277, 415];
      frequencies.forEach((frequency, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = index === 0 ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        gain.gain.value = 0.36 / (index + 1);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(ctx.currentTime + index * 0.055);
        oscillator.stop(ctx.currentTime + 0.34 + index * 0.045);
      });

      window.setTimeout(() => ctx.close(), 700);
    } catch {
      // 브라우저 자동재생 제한은 무시합니다.
    }
  }

  function scheduleListen(delay = 620) {
    if (!open) return;
    window.clearTimeout(autoListenTimerRef.current);
    autoListenTimerRef.current = window.setTimeout(() => listen(), delay);
  }

  async function speakCinematic(
    text,
    { autoResume = true, intro = false, wake = false } = {}
  ) {
    if (!("speechSynthesis" in window)) {
      setMessage("VOICE OUTPUT NOT SUPPORTED");
      return;
    }

    const segments = splitCinematic(text);
    if (!segments.length) return;

    speechTokenRef.current += 1;
    const token = speechTokenRef.current;
    recognitionRef.current?.abort?.();
    window.speechSynthesis.cancel();
    window.clearTimeout(autoListenTimerRef.current);

    setListening(false);
    setThinking(false);
    setSpeaking(true);
    setMessage("JAVIS RESPONDING");
    setWaveSeed((value) => value + 1);
    addHistory("assistant", normalizeSpeech(text));

    if (wake) playSystemTone("wake");
    else if (intro) playSystemTone("boot");

    for (let index = 0; index < segments.length; index += 1) {
      if (token !== speechTokenRef.current) return;

      await new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(segments[index]);
        utterance.lang = selectedVoice?.lang || "ko-KR";
        utterance.voice = selectedVoice || null;
        utterance.rate = FIXED_RATE;
        utterance.pitch = FIXED_PITCH;
        utterance.volume = 1;
        utterance.onend = resolve;
        utterance.onerror = resolve;
        window.speechSynthesis.speak(utterance);
      });

      if (index < segments.length - 1) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, index === 0 ? 260 : 175)
        );
      }
    }

    if (token !== speechTokenRef.current) return;
    setSpeaking(false);
    setMessage(armed ? "AWAITING COMMAND" : "AWAITING WAKE WORD");

    if (autoResume) scheduleListen(armed ? 430 : 720);
  }

  async function processCommand(rawCommand) {
    const command = rawCommand.trim();
    const compact = command.replace(/\s/g, "");
    const hasWakeWord = compact.includes("자비스");

    addHistory("user", command);

    if (!armed && !hasWakeWord) {
      setMessage("WAKE WORD REQUIRED");
      scheduleListen(350);
      return;
    }

    const commandWithoutWakeWord = command
      .replace(/자비스/gi, "")
      .replace(/JAVIS/gi, "")
      .trim();

    if (!armed && hasWakeWord && !commandWithoutWakeWord) {
      setArmed(true);
      await speakCinematic("네, 차재운 대리님.", {
        autoResume: true,
        wake: true,
      });
      return;
    }

    const executableCommand = commandWithoutWakeWord || command;
    setArmed(true);
    setThinking(true);
    setMessage("ANALYSING COMMAND");

    try {
      const result = await onCommand?.(executableCommand);
      const response =
        typeof result === "string" && result.trim()
          ? result
          : "명령을 수행했습니다.";

      setThinking(false);
      await speakCinematic(response, { autoResume: true });
    } catch (error) {
      setThinking(false);
      const detail = error instanceof Error ? error.message : String(error);
      await speakCinematic(`명령 처리 중 오류가 발생했습니다. ${detail}`, {
        autoResume: true,
      });
    }
  }

  function listen() {
    if (!open || listening || thinking || speaking) return;

    const recognition = createRecognition();
    if (!recognition) {
      setMessage("USE CHROME OR EDGE FOR VOICE INPUT");
      return;
    }

    speechTokenRef.current += 1;
    window.speechSynthesis?.cancel?.();
    window.clearTimeout(autoListenTimerRef.current);

    recognitionRef.current = recognition;
    recognition.lang = "ko-KR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let finalText = "";

    recognition.onstart = () => {
      setListening(true);
      setTranscript("");
      setMessage(armed ? "LISTENING FOR COMMAND" : "LISTENING FOR JAVIS");
      setWaveSeed((value) => value + 1);
    };

    recognition.onresult = (event) => {
      finalText = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");
      setTranscript(finalText);
    };

    recognition.onerror = (event) => {
      setListening(false);
      setMessage(
        event.error === "not-allowed"
          ? "MICROPHONE PERMISSION REQUIRED"
          : "VOICE INPUT FAILED"
      );
    };

    recognition.onend = async () => {
      setListening(false);
      if (!finalText.trim()) {
        setMessage(armed ? "COMMAND NOT DETECTED" : "AWAITING WAKE WORD");
        scheduleListen(420);
        return;
      }
      await processCommand(finalText);
    };

    recognition.start();
  }

  function stopAll(updateMessage = true) {
    speechTokenRef.current += 1;
    window.clearTimeout(autoListenTimerRef.current);
    recognitionRef.current?.abort?.();
    window.speechSynthesis?.cancel?.();
    setListening(false);
    setSpeaking(false);
    setThinking(false);
    setArmed(false);
    if (updateMessage) setMessage("VOICE CORE PAUSED");
  }

  if (!open) return null;

  return (
    <div
      className="voiceOverlay v10VoiceOverlay"
      onMouseDown={(event) =>
        event.target === event.currentTarget && onClose?.()
      }
    >
      <section className="voicePanel v10VoicePanel">
        <button className="voiceClose" type="button" onClick={onClose}>
          <X size={18} />
        </button>

        <div className="v10VoiceTop">
          <span><i /> JAVIS MARK X VOICE CORE</span>
          <em>{selectedVoice?.name || TARGET_VOICE}</em>
        </div>

        <div className="v10VoiceTelemetry">
          <span>VOICE HYUNSU</span>
          <span>RATE 1.00</span>
          <span>PITCH 0.68</span>
          <span>AUTO DIALOGUE</span>
        </div>

        <div
          key={waveSeed}
          className={`voiceOrb v10VoiceOrb ${listening ? "listening" : ""} ${
            speaking ? "speaking" : ""
          } ${thinking ? "thinking" : ""} ${armed ? "armed" : ""}`}
        >
          <span /><span /><span /><span /><span />
          {listening ? (
            <Mic size={37} />
          ) : thinking ? (
            <Radio size={37} />
          ) : (
            <Activity size={37} />
          )}
        </div>

        <small>TACTICAL OPERATIONS ASSISTANT</small>
        <h2>{armed ? "명령을 말씀하십시오." : "“자비스”라고 호출하십시오."}</h2>
        <p>{message}</p>

        <div className={`voiceWave v10VoiceWave ${
          listening || speaking || thinking ? "active" : ""
        }`}>
          {Array.from({ length: 33 }).map((_, index) => (
            <i key={index} style={{ "--wave-index": index }} />
          ))}
        </div>

        <div className="voiceTranscript v10Transcript">
          {transcript || (armed ? "예: 오늘 로스 알려줘" : "대기 중: 자비스")}
        </div>

        <div className="v10DialogueLog">
          {history.length === 0 ? (
            <span>VOICE DIALOGUE LOG READY</span>
          ) : (
            history.slice(-4).map((item, index) => (
              <p key={`${item.role}-${index}`} className={item.role}>
                <b>{item.role === "user" ? "YOU" : "JAVIS"}</b>
                {item.text}
              </p>
            ))
          )}
        </div>

        <div className="voiceActions v10VoiceActions">
          <button type="button" onClick={listen} disabled={listening || thinking || speaking}>
            {listening ? <MicOff size={17} /> : <Mic size={17} />}
            {listening ? "수신 중" : "음성 수신"}
          </button>

          <button
            type="button"
            onClick={() =>
              speakCinematic(briefingText || "현재 브리핑 데이터가 없습니다.", {
                autoResume: true,
                intro: true,
              })
            }
          >
            <Volume2 size={17} /> 작전 브리핑
          </button>

          <button
            type="button"
            onClick={() =>
              speakCinematic(
                "차재운 대리님. 자비스 마크 텐 음성 시스템은 정상입니다.",
                { autoResume: true, wake: true }
              )
            }
          >
            <AudioLines size={17} /> 음성 테스트
          </button>

          <button type="button" className="voiceStopButton" onClick={() => stopAll(true)}>
            정지
          </button>
        </div>

        <div className="v10VoiceHint">
          고정 음성: Microsoft Hyunsu Natural · 속도 1.00 · 톤 0.68 · 연속 대화 ON
        </div>
      </section>
    </div>
  );
}
