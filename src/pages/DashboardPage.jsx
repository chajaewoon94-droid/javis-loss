import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, BarChart, Bar, PieChart, Pie, Cell
} from "recharts";
import AnimatedNumber from "../components/AnimatedNumber";

const fmt = (n) => Number(n || 0).toLocaleString();
const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function getMajorType(kpi = {}) {
  const fd = safeNumber(kpi.fdQty);
  const fl = safeNumber(kpi.flQty);
  if (fd === 0 && fl === 0) return "-";
  if (fd === fl) return "동일";
  return fd > fl ? "FD" : "FL";
}

function Kpi({ label, value, unit = "EA", foot, tone = "", textValue = false }) {
  return (
    <article className={`kpiCard ${tone}`}>
      <span>{label}</span>
      <strong>
        {textValue ? value : <AnimatedNumber value={safeNumber(value)} />}
        {unit ? <small>{unit}</small> : null}
      </strong>
      <em>{foot}</em>
      <i className="kpiGlow" />
    </article>
  );
}

function Ranking({ title, items = [], onSelectProduct }) {
  return (
    <section className="panel glassPanel">
      <div className="panelTitle">
        <div><h2>{title}</h2><p>FD·FL 발생수량 기준</p></div>
      </div>
      <div className="rankList">
        {items.length ? items.map((item, index) => (
          <button
            className="rankRow"
            key={`${item.code || item.name}-${index}`}
            type="button"
            onClick={() => onSelectProduct?.(item)}
          >
            <b>{index + 1}</b>
            <span><strong>{item.name || "-"}</strong><small>{item.code || ""}</small></span>
            <em>{fmt(item.quantity)} EA</em>
          </button>
        )) : <div className="emptyState compact">데이터가 없습니다.</div>}
      </div>
    </section>
  );
}

const tooltipStyle = {
  background: "rgba(8,18,35,.96)",
  border: "1px solid rgba(56,189,248,.25)",
  borderRadius: 14,
};

export default function DashboardPage({ data = {}, period, setPeriod, onSelectProduct }) {
  const k = data.kpi || {};
  const periods = [
    ["today", "오늘"], ["7d", "최근 7일"], ["30d", "최근 30일"],
    ["month", "이번 달"], ["all", "전체"],
  ];

  const zoneData = Array.isArray(data.zone)
    ? data.zone.filter((item) => safeNumber(item.quantity) > 0)
    : [];

  return (
    <div className="pageTransition">
      <div className="periods glassTabs">
        {periods.map(([value, label]) => (
          <button
            key={value}
            className={period === value ? "active" : ""}
            onClick={() => setPeriod(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="kpiGrid">
        <Kpi label="선택 기간 센터 LOSS" value={k.selectedQty} foot={`${fmt(k.selectedCount)}건 발생 · FD+FL`} />
        <Kpi label="오늘 센터 LOSS" value={k.todayQty} foot="FD+FL 당일 누적" />
        <Kpi label="이번 달 센터 LOSS" value={k.monthQty} foot="현재 월 누적" />
        <Kpi label="전체 누적 센터 LOSS" value={k.totalQty} foot={`${fmt(k.totalCount)}건 누적`} />
      </section>

      <section className="kpiGrid">
        <Kpi label="FD · 센터 파손" value={k.fdQty} foot="선택 기간 기준" tone="fd" />
        <Kpi label="FL · 센터 분실" value={k.flQty} foot="선택 기간 기준" tone="fl" />
        <Kpi label="CR · 고객사 귀책(참고)" value={k.crQty} foot="센터 LOSS 제외" tone="cr" />
        <Kpi
          label="주요 유형"
          value={getMajorType(k)}
          unit=""
          foot="선택 기간 최다 유형"
          tone="major"
          textValue
        />
      </section>

      <section className="panel chartPanel glassPanel">
        <div className="panelTitle"><div><h2>시간대별 센터 LOSS</h2><p>선택 기간 FD·FL 시간대별 합산</p></div></div>
        <div className="chart">
          <ResponsiveContainer>
            <AreaChart data={data.hourly || []}>
              <defs>
                <linearGradient id="lossArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.36} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="quantity" stroke="#38bdf8" strokeWidth={2.3} fill="url(#lossArea)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="twoCol">
        <section className="panel chartPanel glassPanel">
          <div className="panelTitle"><div><h2>일별 센터 LOSS 추이</h2><p>최근 최대 31일</p></div></div>
          <div className="chart">
            <ResponsiveContainer>
              <BarChart data={data.daily || []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="FD" stackId="a" fill="#ef4444" radius={[5, 5, 0, 0]} />
                <Bar dataKey="FL" stackId="a" fill="#f97316" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel chartPanel glassPanel">
          <div className="panelTitle"><div><h2>FD·FL 비율</h2><p>센터 귀책 LOSS 비중</p></div></div>
          <div className="chart">
            {zoneData.length ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={zoneData} dataKey="quantity" nameKey="label" innerRadius="48%" outerRadius="76%" paddingAngle={3}>
                    {zoneData.map((_, index) => (
                      <Cell key={index} fill={index === 0 ? "#ef4444" : "#f97316"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="emptyState compact">선택 기간 FD·FL 데이터가 없습니다.</div>}
          </div>
        </section>
      </div>

      <div className="twoCol">
        <Ranking title="고객사 TOP 10" items={data.customers || []} />
        <Ranking title="상품 TOP 10" items={data.products || []} onSelectProduct={onSelectProduct} />
      </div>
    </div>
  );
}
