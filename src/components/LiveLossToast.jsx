import { AlertTriangle, X } from "lucide-react";

export default function LiveLossToast({ item, onClose }) {
  if (!item) return null;

  return (
    <div className="lossToast">
      <div className="lossToastIcon"><AlertTriangle size={20} /></div>
      <div>
        <small>LIVE LOSS DETECTED</small>
        <strong>{item.category || item.zone || "LOSS"} · {item.productName || item.productCode || "상품"}</strong>
        <span>{item.customer || ""} · {Number(item.quantity || 0).toLocaleString()} EA</span>
      </div>
      <button type="button" onClick={onClose}><X size={16} /></button>
    </div>
  );
}
