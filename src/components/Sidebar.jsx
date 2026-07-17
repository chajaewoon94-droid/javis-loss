import { LayoutDashboard, ListChecks, Bot, Settings } from "lucide-react";

const items = [
  ["dashboard", "대시보드", LayoutDashboard],
  ["history", "발생내역", ListChecks],
  ["ai", "AI 분석", Bot],
  ["settings", "설정", Settings],
];

export default function Sidebar({ page, onChange, open, onClose }) {
  const active = ["compensation", "management"].includes(page) ? "settings" : page;
  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand"><div className="brandMark">JL</div><div><strong>JAVIS LOSS</strong><span>운영 손실관리 시스템</span></div></div>
      <nav>{items.map(([key,label,Icon]) => <button key={key} className={active===key?"active":""} onClick={()=>{onChange(key);onClose?.();}}><Icon size={19}/><span>{label}</span></button>)}</nav>
    </aside>
  );
}
