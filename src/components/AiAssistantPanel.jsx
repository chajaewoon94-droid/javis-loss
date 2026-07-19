import { useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";

export default function AiAssistantPanel({ open, onClose, onAsk, initialText = "" }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState(() =>
    initialText ? [{ role: "assistant", text: initialText }] : []
  );
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;

    setMessages((current) => [...current, { role: "user", text }]);
    setQuestion("");
    setBusy(true);

    try {
      const answer = await onAsk?.(text);
      setMessages((current) => [
        ...current,
        { role: "assistant", text: answer || "분석 결과가 없습니다." },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: error instanceof Error ? error.message : String(error) },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <aside className="aiDrawer">
      <header>
        <div><Bot size={20} /><span><strong>JAVIS AI</strong><small>운영비서 온라인</small></span></div>
        <button type="button" onClick={onClose}><X size={18} /></button>
      </header>

      <div className="aiMessages">
        {messages.length === 0 && (
          <div className="aiWelcome">
            <Sparkles size={24} />
            <strong>센터 LOSS에 대해 질문하세요.</strong>
            <span>예: FL이 늘어난 고객사와 대응 방안을 알려줘.</span>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className={`aiBubble ${message.role}`}>{message.text}</div>
        ))}

        {busy && <div className="aiBubble assistant">분석 중...</div>}
      </div>

      <form onSubmit={submit}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="JAVIS에게 질문..."
        />
        <button type="submit" disabled={!question.trim() || busy}><Send size={17} /></button>
      </form>
    </aside>
  );
}
