import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell } from "recharts";

const fmt=n=>Number(n||0).toLocaleString();
function Kpi({label,value,unit="EA",foot,tone=""}){return <article className={`kpiCard ${tone}`}><span>{label}</span><strong>{fmt(value)} <small>{unit}</small></strong><em>{foot}</em></article>}
function Ranking({title,items=[]}){return <section className="panel"><div className="panelTitle"><div><h2>{title}</h2><p>FD·FL 발생수량 기준</p></div></div><div className="rankList">{items.length?items.map((x,i)=><div className="rankRow" key={i}><b>{i+1}</b><span><strong>{x.name}</strong><small>{x.code||""}</small></span><em>{fmt(x.quantity)} EA</em></div>):<div className="emptyState compact">데이터가 없습니다.</div>}</div></section>}
const tooltipStyle={background:"#0f172a",border:"1px solid rgba(148,163,184,.18)",borderRadius:12};
export default function DashboardPage({data={},period,setPeriod}){
 const k=data.kpi||{}; const periods=[["today","오늘"],["7d","최근 7일"],["30d","최근 30일"],["month","이번 달"],["all","전체"]];
 return <>
  <div className="periods">{periods.map(([v,l])=><button key={v} className={period===v?"active":""} onClick={()=>setPeriod(v)}>{l}</button>)}</div>
  <section className="kpiGrid"><Kpi label="선택 기간 센터 LOSS" value={k.selectedQty} foot={`${fmt(k.selectedCount)}건 발생 · FD+FL`}/><Kpi label="오늘 센터 LOSS" value={k.todayQty} foot="FD+FL 당일 누적"/><Kpi label="이번 달 센터 LOSS" value={k.monthQty} foot="현재 월 누적"/><Kpi label="전체 누적 센터 LOSS" value={k.totalQty} foot={`${fmt(k.totalCount)}건 누적`}/></section>
  <section className="kpiGrid"><Kpi label="FD · 센터 파손" value={k.fdQty} foot="선택 기간 기준" tone="fd"/><Kpi label="FL · 센터 분실" value={k.flQty} foot="선택 기간 기준" tone="fl"/><Kpi label="CR · 고객사 귀책(참고)" value={k.crQty} foot="센터 LOSS 제외" tone="cr"/><Kpi label="주요 유형" value={(k.fdQty||0)>=(k.flQty||0)?"FD":"FL"} unit="" foot="선택 기간 최다 유형"/></section>
  <section className="panel chartPanel"><div className="panelTitle"><div><h2>시간대별 센터 LOSS</h2><p>선택 기간 FD·FL 시간대별 합산</p></div></div><div className="chart"><ResponsiveContainer><AreaChart data={data.hourly||[]}><CartesianGrid strokeDasharray="3 3" opacity={.15}/><XAxis dataKey="hour" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip contentStyle={tooltipStyle}/><Area type="monotone" dataKey="quantity" stroke="#38bdf8" fill="#38bdf8" fillOpacity={.12}/></AreaChart></ResponsiveContainer></div></section>
  <div className="twoCol"><section className="panel chartPanel"><div className="panelTitle"><div><h2>일별 센터 LOSS 추이</h2><p>최근 최대 31일</p></div></div><div className="chart"><ResponsiveContainer><BarChart data={data.daily||[]}><CartesianGrid strokeDasharray="3 3" opacity={.15}/><XAxis dataKey="date" tick={{fontSize:9}}/><YAxis tick={{fontSize:10}}/><Tooltip contentStyle={tooltipStyle}/><Bar dataKey="FD" stackId="a" fill="#ef4444"/><Bar dataKey="FL" stackId="a" fill="#f97316"/></BarChart></ResponsiveContainer></div></section>
  <section className="panel chartPanel"><div className="panelTitle"><div><h2>FD·FL 비율</h2><p>센터 귀책 LOSS 비중</p></div></div><div className="chart"><ResponsiveContainer><PieChart><Pie data={data.zone||[]} dataKey="quantity" nameKey="label" innerRadius="45%" outerRadius="75%" label>{(data.zone||[]).map((_,i)=><Cell key={i} fill={i===0?"#ef4444":"#f97316"}/>)}</Pie><Tooltip contentStyle={tooltipStyle}/></PieChart></ResponsiveContainer></div></section></div>
  <div className="twoCol"><Ranking title="고객사 TOP 10" items={data.customers}/><Ranking title="상품 TOP 10" items={data.products}/></div>
 </>;
}
