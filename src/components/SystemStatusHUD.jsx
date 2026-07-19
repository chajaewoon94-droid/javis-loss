import { BrainCircuit, Database, Mic2, Network, Power, ShieldCheck } from "lucide-react";

function StatusItem({ icon: Icon, label, value, state = "online" }) {
  return (
    <div className={`v10StatusItem ${state}`}>
      <span className="v10StatusIcon"><Icon size={15} /></span>
      <span className="v10StatusCopy">
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
      <i />
    </div>
  );
}

export default function SystemStatusHUD({
  data = {},
  loading = false,
  error = "",
  voiceOpen = false,
  aiOpen = false,
}) {
  const hasData = Boolean(data?.meta?.lastRefresh || data?.kpi);
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const recognitionAvailable =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const synthesisAvailable =
    typeof window !== "undefined" && "speechSynthesis" in window;

  return (
    <section className="v10SystemHUD" aria-label="JAVIS 시스템 상태">
      <div className="v10HudHeader">
        <div>
          <span>JAVIS MARK X</span>
          <strong>TACTICAL SYSTEM STATUS</strong>
        </div>
        <em className={error ? "danger" : "online"}>
          <i /> {error ? "ATTENTION" : "ALL SYSTEMS NOMINAL"}
        </em>
      </div>

      <div className="v10StatusGrid">
        <StatusItem
          icon={Power}
          label="ONLINE"
          value={online ? "CONNECTED" : "OFFLINE"}
          state={online ? "online" : "danger"}
        />
        <StatusItem
          icon={ShieldCheck}
          label="SYSTEM CHECK"
          value={error ? "WARNING" : loading ? "SCANNING" : "NORMAL"}
          state={error ? "danger" : loading ? "working" : "online"}
        />
        <StatusItem
          icon={BrainCircuit}
          label="AI CORE"
          value={aiOpen ? "ACTIVE" : "STANDBY"}
          state={aiOpen ? "working" : "online"}
        />
        <StatusItem
          icon={Network}
          label="NETWORK"
          value={online ? "STABLE" : "LOST"}
          state={online ? "online" : "danger"}
        />
        <StatusItem
          icon={Mic2}
          label="VOICE"
          value={
            voiceOpen
              ? "ENGAGED"
              : recognitionAvailable && synthesisAvailable
                ? "READY"
                : "LIMITED"
          }
          state={voiceOpen ? "working" : recognitionAvailable ? "online" : "warning"}
        />
        <StatusItem
          icon={Database}
          label="LOSS DATABASE"
          value={loading ? "SYNCING" : hasData ? "SYNCHRONIZED" : "WAITING"}
          state={loading ? "working" : hasData ? "online" : "warning"}
        />
      </div>
    </section>
  );
}
