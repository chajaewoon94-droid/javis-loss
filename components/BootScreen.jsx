import { useEffect, useState } from "react";

const steps = [
  "SECURE CHANNEL INITIALIZING",
  "LOSS DATABASE CONNECTING",
  "ANALYTICS ENGINE ONLINE",
  "VOICE INTERFACE READY",
];

export default function BootScreen({ onDone }) {
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("JAVIS_V5_BOOTED") === "1") {
      onDone?.();
      return;
    }

    const timer = setInterval(() => {
      setStep((current) => {
        if (current >= steps.length - 1) {
          clearInterval(timer);
          setTimeout(() => {
            setLeaving(true);
            setTimeout(() => {
              sessionStorage.setItem("JAVIS_V5_BOOTED", "1");
              onDone?.();
            }, 450);
          }, 550);
          return current;
        }
        return current + 1;
      });
    }, 620);

    return () => clearInterval(timer);
  }, [onDone]);

  return (
    <div className={`bootScreen ${leaving ? "leaving" : ""}`}>
      <div className="bootCore">
        <div className="bootOrb"><span /><span /><span /><b>J</b></div>
        <div className="bootText">
          <small>YK ANGELS OPERATIONS INTELLIGENCE</small>
          <h1>JAVIS</h1>
          <p>{steps[step]}</p>
          <div className="bootProgress">
            <i style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
          </div>
          <em>WELCOME, 차재운 대리님</em>
        </div>
      </div>
    </div>
  );
}
