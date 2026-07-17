export default function TablePage({ title, subtitle, headers = [], rows = [], mobileCards = false }) {
  return <section className="panel tablePanel"><div className="panelTitle"><div><h2>{title}</h2><p>{subtitle}</p></div><span className="countBadge">{rows.length.toLocaleString()}건</span></div>
    {rows.length ? <div className={`tableWrap ${mobileCards?"mobileCards":""}`}><table><thead><tr>{headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{rows.map((row,ri)=><tr key={ri}>{row.map((cell,ci)=><td key={ci} data-label={headers[ci]}>{cell ?? "-"}</td>)}</tr>)}</tbody></table></div> : <div className="emptyState">표시할 데이터가 없습니다.</div>}
  </section>;
}
