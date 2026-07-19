import { useMemo, useState } from "react";
import { Mic, MicOff, Volume2, X } from "lucide-react";

export default function VoiceAssistant({ open, onClose, onCommand, briefingText = "" }) {
  const Recognition = useMemo(
    () => window.SpeechRecognition || window.webkitSpeechRecognition || null,
    []
  );
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("무엇을 도와드릴까요?");

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = 1;
    utterance.pitch = 0.92;
    window.speechSynthesis.speak(utterance);
  }

  function listen() {
    if (!Recognition) {
      setMessage("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = true;
    recognition.continuous = false;
    let finalText = "";

    recognition.onstart = () => {
      setListening(true);
      setTranscript("");
      setMessage("듣고 있습니다...");
    };

    recognition.onresult = (event) => {
      finalText = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");
      setTranscript(finalText);
    };

    recognition.onerror = () => {
      setListening(false);
      setMessage("음성을 인식하지 못했습니다.");
    };

    recognition.onend = () => {
      setListening(false);
      if (finalText.trim()) onCommand?.(finalText.trim());
      setMessage(finalText.trim() ? "명령을 처리했습니다." : "다시 말씀해 주세요.");
    };

    recognition.start();
  }

  if (!open) return null;

  return (
    <div className="voiceOverlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <section className="voicePanel">
        <button className="voiceClose" type="button" onClick={onClose}><X size={18} /></button>
        <div className={`voiceOrb ${listening ? "listening" : ""}`}>
          <span /><span /><span />
          {listening ? <Mic size={31} /> : <Volume2 size={31} />}
        </div>
        <small>JAVIS VOICE INTERFACE</small>
        <h2>안녕하세요, 차재운 대리님.</h2>
        <p>{message}</p>
        <div className="voiceTranscript">{transcript || "예: 오늘 LOSS 브리핑해줘"}</div>
        <div className="voiceActions">
          <button type="button" onClick={listen}>
            {listening ? <MicOff size={17} /> : <Mic size={17} />}
            {listening ? "듣는 중" : "음성 명령"}
          </button>
          <button type="button" onClick={() => speak(briefingText || "현재 브리핑 데이터가 없습니다.")}>
            <Volume2 size={17} /> 브리핑 듣기
          </button>
        </div>
      </section>
    </div>
  );
}
