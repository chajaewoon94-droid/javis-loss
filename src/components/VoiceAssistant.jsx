import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AudioLines, Mic, MicOff, Radio, Volume2, X } from "lucide-react";

const FIXED_RATE = 1.0;
const FIXED_PITCH = 0.68;
const TARGET_VOICE = "Microsoft Hyunsu Multilingual Online (Natural)";

function voiceScore(voice) {
  const name = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  const lang = String(voice.lang || "").toLowerCase();
  let score = 0;
  if (lang === "ko-kr") score += 220;
  else if (lang.startsWith("ko")) score += 160;
  if (name.includes("hyunsu")) score += 500;
  if (name.includes("male") || name.includes("남성")) score += 160;
  if (name.includes("microsoft")) score += 55;
  if (name.includes("natural") || name.includes("neural")) score += 50;
  if (name.includes("sunhi") || name.includes("female") || name.includes("여성")) score -= 180;
  return score;
}

function chooseVoice(voices) {
  if (!voices.length) return null;
  return [...voices].sort((a, b) => voiceScore(b) - voiceScore(a))[0] || null;
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
    .replace(/\s+/g, " ")
    .trim();
}

function splitCinematic(text) {
  const normalized = normalizeSpeech(text);
  if (!normalized) return [];
  return normalized.split(/(?<=[.!?。])\s+/).map((part) => part.trim()).filter(Boolean);
}

function createRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  return Recognition ? new Recognition() : null;
}

export default function VoiceAssistant({
  open,
  wakeRequest = 0,
  initialMessage = "",
  onClose,
  onCommand,
  briefingText = "",
}) {
  const recognitionRef = useRef(null);
  const speechTokenRef = useRef(0);
  const autoListenTimerRef = useRef(null);
  const previousWakeRef = useRef(0);

  const [voices, setVoices] = useState([]);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [armed, setArmed] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("VOICE CORE STANDBY");
  const [history, setHistory] = useState([]);

  const selectedVoice = useMemo(() => chooseVoice(voices), [voices]);

  useEffect(() => {
    const loadVoices = () => setVoices(window.speechSynthesis?.getVoices?.() || []);
    loadVoices();
    window.speechSynthesis?.addEventListener?.("voiceschanged", loadVoices);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    if (!open || !wakeRequest || wakeRequest === previousWakeRef.current) return;
    previousWakeRef.current = wakeRequest;
    setArmed(true);
    const timer = window.setTimeout(() => {
      speakCinematic(initialMessage || "네, 차재운 대리님.", { wake: true, autoResume: true });
    }, 180);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wakeRequest, initialMessage]);

  useEffect(() => {
    if (!open) stopAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function addHistory(role, text) {
    setHistory((current) => [...current.slice(-5), { role, text }]);
  }

  function playSystemTone(kind = "wake") {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const master = context.createGain();
      master.connect(context.destination);
      master.gain.setValueAtTime(0.0001, context.currentTime);
      master.gain.exponentialRampToValueAtTime(0.065, context.currentTime + 0.025);
      master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.48);
      const frequencies = kind === "wake" ? [330, 494] : [185, 277, 415];
      frequencies.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = index ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        gain.gain.value = 0.34 / (index + 1);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(context.currentTime + index * 0.055);
        oscillator.stop(context.currentTime + 0.35 + index * 0.04);
      });
      window.setTimeout(() => context.close(), 750);
    } catch {
      // 모바일 자동재생 제한 시 음성 응답만 계속합니다.
    }
  }

  function scheduleListen(delay = 440) {
    if (!open) return;
    clearTimeout(autoListenTimerRef.current);
    autoListenTimerRef.current = window.setTimeout(listen, delay);
  }

  async function speakCinematic(text, { autoResume = true, wake = false, intro = false } = {}) {
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
    clearTimeout(autoListenTimerRef.current);
    setListening(false);
    setThinking(false);
    setSpeaking(true);
    setMessage("JAVIS RESPONDING");
    addHistory("assistant", normalizeSpeech(text));
    if (wake) playSystemTone("wake");
    if (intro) playSystemTone("boot");

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
        await new Promise((resolve) => window.setTimeout(resolve, 190));
      }
    }

    if (token !== speechTokenRef.current) return;
    setSpeaking(false);
    setMessage("AWAITING COMMAND");
    if (autoResume) scheduleListen();
  }

  async function processCommand(rawCommand) {
    const command = rawCommand.trim();
    if (!command) return;
    const stripped = command.replace(/자비스|JAVIS/gi, "").trim();
    addHistory("user", command);
    setArmed(true);
    setThinking(true);
    setMessage("ANALYSING COMMAND");
    try {
      const result = await onCommand?.(stripped || command);
      setThinking(false);
      await speakCinematic(result || "명령을 수행했습니다.", { autoResume: true });
    } catch (error) {
      setThinking(false);
      await speakCinematic(`명령 처리 중 오류가 발생했습니다. ${error instanceof Error ? error.message : String(error)}`, { autoResume: true });
    }
  }

  function listen() {
    if (!open || listening || thinking || speaking) return;
    const recognition = createRecognition();
    if (!recognition) {
      setMessage("CHROME OR EDGE VOICE INPUT REQUIRED");
      return;
    }
    speechTokenRef.current += 1;
    window.speechSynthesis?.cancel?.();
    clearTimeout(autoListenTimerRef.current);
    recognitionRef.current = recognition;
    recognition.lang = "ko-KR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 3;
    let finalText = "";

    recognition.onstart = () => {
      setListening(true);
      setTranscript("");
      setMessage("LISTENING FOR COMMAND");
    };
    recognition.onresult = (event) => {
      finalText = Array.from(event.results).map((result) => result[0].transcript).join(" ");
      setTranscript(finalText);
    };
    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === "not-allowed") setMessage("MICROPHONE PERMISSION REQUIRED");
      else if (event.error !== "aborted") setMessage("VOICE INPUT FAILED");
    };
    recognition.onend = () => {
      setListening(false);
      if (finalText.trim()) processCommand(finalText);
      else scheduleListen(600);
    };
    recognition.start();
  }

  function stopAll(updateMessage = true) {
    speechTokenRef.current += 1;
    clearTimeout(autoListenTimerRef.current);
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
    <div className="voiceOverlay v15VoiceOverlay">
      <section className="voicePanel v15VoicePanel">
        <button className="voiceClose" type="button" onClick={onClose}><X size={18} /></button>
        <div className="v10VoiceTop">
          <span><i /> JAVIS MARK XV VOICE CORE</span>
          <em>{selectedVoice?.name || "기기 기본 한국어 음성"}</em>
        </div>
        <div className="v10VoiceTelemetry">
          <span>DOUBLE CLAP WAKE</span><span>RATE 1.00</span><span>PITCH 0.68</span><span>AUTO DIALOGUE</span>
        </div>

        <div className={`voiceOrb v10VoiceOrb ${listening ? "listening" : ""} ${speaking ? "speaking" : ""} ${thinking ? "thinking" : ""} ${armed ? "armed" : ""}`}>
          <span /><span /><span /><span /><span />
          {listening ? <Mic size={37} /> : thinking ? <Radio size={37} /> : <Activity size={37} />}
        </div>

        <div className="v15VoicePrimary">
          <small>TACTICAL OPERATIONS ASSISTANT</small>
          <h2>{listening ? "말씀하십시오." : thinking ? "분석 중입니다." : speaking ? "응답 중입니다." : "명령을 기다립니다."}</h2>
          <p>{message}</p>
          <div className={`voiceWave v10VoiceWave ${listening || speaking || thinking ? "active" : ""}`}>
            {Array.from({ length: 33 }).map((_, index) => <i key={index} style={{ "--wave-index": index }} />)}
          </div>
          <div className="voiceTranscript v10Transcript">{transcript || "예: 오늘 로스 / 발생 내역 보여줘 / 원인 분석해줘"}</div>
        </div>

        <div className="v15VoiceSecondary">
          <div className="v10DialogueLog">
            {history.length === 0 ? <span>DOUBLE CLAP OR MANUAL WAKE READY</span> : history.slice(-4).map((item, index) => (
              <p key={`${item.role}-${index}`} className={item.role}><b>{item.role === "user" ? "YOU" : "JAVIS"}</b>{item.text}</p>
            ))}
          </div>
          <div className="voiceActions v10VoiceActions">
            <button type="button" onClick={listen} disabled={listening || thinking || speaking}>{listening ? <MicOff size={17} /> : <Mic size={17} />}{listening ? "수신 중" : "수동 수신"}</button>
            <button type="button" onClick={() => speakCinematic(briefingText || "현재 브리핑 데이터가 없습니다.", { autoResume: true, intro: true })}><Volume2 size={17} />작전 브리핑</button>
            <button type="button" onClick={() => speakCinematic("차재운 대리님. 자비스 마크 피프틴 음성 시스템은 정상입니다.", { autoResume: true, wake: true })}><AudioLines size={17} />음성 테스트</button>
            <button type="button" className="voiceStopButton" onClick={() => stopAll(true)}>정지</button>
          </div>
          <div className="v10VoiceHint">PC에서는 Hyunsu를 우선 선택합니다. 모바일은 기기에 설치된 한국어 음성 중 남성 음성을 우선 선택합니다.</div>
        </div>
      </section>
    </div>
  );
}
