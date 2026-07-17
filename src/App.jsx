import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Menu,
  Monitor,
  RefreshCw,
  Smartphone,
  Sparkles,
  WalletCards,
  Wrench,
} from "lucide-react";
import Sidebar from "./components/Sidebar";
import DashboardPage from "./pages/DashboardPage";
import TablePage from "./pages/TablePage";
import { jsonp } from "./utils/api";
import "./styles.css";

const fmt = (value) => Number(value || 0).toLocaleString();
const periodName = {
  today: "오늘",
  "7d": "최근 7일",
  "30d": "최근 30일",
  month: "이번 달",
  all: "전체",
};

function getInitialMode() {
  const saved = localStorage.getItem("JAVIS_MOBILE_LARGE");
  if (saved === "1") return "mobile";
  if (saved === "0") return "pc";
  return window.matchMedia("(max-width: 700px)").matches ? "mobile" : "pc";
}

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState({});
  const [management, setManagement] = useState({ headers: [], rows: [] });
  const [compensation, setCompensation] = useState({
    headers: [],
    rows: [],
    summary: {},
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(getInitialMode);
  const [menuOpen, setMenuOpen] = useState(false);
  const [compMode, setCompMode] = useState(
    localStorage.getItem("JAVIS_COMPENSATION_MODE") || "gross",
  );

  const hasApi = true;

  const loadDashboard = useCallback(
    async (silent = false) => {
      if (!hasApi) {
        setError("Apps Script 웹앱 URL을 먼저 설정하세요.");
        return;
      }

      if (!silent) setLoading(true);
      setError("");

      try {
        const response = await jsonp({ api: "dashboard", period });
        setData(response?.data || {});
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [hasApi, period],
  );

  const runAction = useCallback(
    async (api) => {
      if (!hasApi) {
        setPage("settings");
        setError("설정에서 Apps Script 웹앱 URL을 저장하세요.");
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await jsonp({ api, period }, 120000);
        if (response?.data) setData(response.data);
        else await loadDashboard(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [hasApi, loadDashboard, period],
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!hasApi) return;

    if (page === "management") {
      jsonp({ api: "management", period })
        .then((response) => setManagement(response?.data || {}))
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }

    if (page === "compensation") {
      jsonp({ api: "compensation", period })
        .then((response) => setCompensation(response?.data || {}))
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }
  }, [hasApi, page, period]);

  useEffect(() => {
    if (!hasApi) return undefined;
    const id = window.setInterval(() => loadDashboard(true), 30000);
    return () => window.clearInterval(id);
  }, [hasApi, loadDashboard]);

  useEffect(() => {
    setMenuOpen(false);
    document.documentElement.dataset.javisMode = mode;
    return () => delete document.documentElement.dataset.javisMode;
  }, [mode]);

  function toggleMode() {
    const next = mode === "mobile" ? "pc" : "mobile";
    setMode(next);
    setMenuOpen(false);
    localStorage.setItem("JAVIS_MOBILE_LARGE", next === "mobile" ? "1" : "0");
  }

  function changeCompMode(value) {
    setCompMode(value);
    localStorage.setItem("JAVIS_COMPENSATION_MODE", value);
  }

  function changePage(nextPage) {
    setPage(nextPage);
    setMenuOpen(false);
  }

const recentHeaders = [
  "갱신시간",
  "ZONE",
  "불용 구분",
  "고객사",
  "상품코드",
  "상품명",
  "LOT",
  "로케이션",
  "수량",
  "상품",
];

const recentRows = (data.recent || []).map((row, index) => {
  const productName = String(row.productName || "").trim();

  const productUrl =
    row.link ||
    row.productUrl ||
    row.naverLink ||
    `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(
      productName || row.productCode || "",
    )}`;

  return [
    row.refreshTime || row.time,
    row.zone,
    row.category,
    row.customer,
    row.productCode,
    productName,
    row.lot,
    row.location,
    `${fmt(row.quantity)} EA`,
    <a
      key={`product-link-${index}`}
      href={productUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="productViewLink"
      title={`${productName || "상품"} 보기`}
    >
      상품보기
    </a>,
  ];
});

  const adjusted = compMode === "adjusted";
  const compRows = (compensation.rows || []).map((row) =>
    row.map((cell, index) => {
      if (adjusted && index === 7) return `${fmt(row[9])}원`;
      if ([6, 7, 8, 9].includes(index)) return `${fmt(cell)}원`;
      return cell;
    }),
  );

  const summary = compensation.summary || data.compensation || {};
  const amount = (value) => {
    const number = Number(value || 0);
    return adjusted ? Math.max(0, number - Math.round(number * 0.001)) : number;
  };

  const pageInfo = {
    dashboard: ["JAVIS LOSS MONITOR", "센터 귀책 FD·FL 중심 운영 손실관리"],
    history: ["LOSS 발생내역", "FD·FL·CR 불용재고 발생 내역"],
    ai: ["JAVIS AI 분석", "최근 센터 LOSS 데이터 기반 운영 분석"],
    settings: ["시스템 설정", "관리자 기능"],
    compensation: ["변상금 관리", "판매가 및 예상 변상금 현황"],
    management: ["운영관리", "원인·담당자·조치·처리상태 관리"],
  }[page] || ["JAVIS LOSS", "운영 손실관리 시스템"];

  return (
    <div className={`appShell ${mode === "mobile" ? "mobileLarge" : "pcMode"}`}>
      <Sidebar
        page={page}
        onChange={changePage}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      <main>
        <header className="topbar">
          <div className="titleRow">
            <button
              type="button"
              className="menuBtn"
              aria-label="메뉴 열기"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Menu size={19} />
            </button>
            <div>
              <h1>{pageInfo[0]}</h1>
              <p>{pageInfo[1]}</p>
            </div>
          </div>

          <div className="actions">
            <button type="button" onClick={toggleMode}>
              {mode === "mobile" ? <Monitor size={16} /> : <Smartphone size={16} />}
              {mode === "mobile" ? "PC모드" : "모바일모드"}
            </button>
            <button type="button" onClick={() => loadDashboard()}>
              <RefreshCw size={16} />화면 새로고침
            </button>
            <button type="button" className="primary" onClick={() => runAction("refresh")}>
              데이터 전체 갱신
            </button>
            <button type="button" className="ai" onClick={() => runAction("ai")}>
              <Sparkles size={16} />AI 분석
            </button>
          </div>
        </header>

        <div className="statusBar">
          <span>
            <i />마지막 데이터: <strong>{data.meta?.lastRefresh || "-"}</strong>
          </span>
          <span>30초 자동 새로고침 · {periodName[period]}</span>
        </div>

        {error && (
          <div className="errorBox">
            <span>{error}</span>
          </div>
        )}

        {page === "dashboard" && (
          <DashboardPage data={data} period={period} setPeriod={setPeriod} />
        )}

        {page === "history" && (
          <TablePage
            title="LOSS 발생내역"
            subtitle="선택 기간 최신순 최대 50건"
            headers={recentHeaders}
            rows={recentRows}
            mobileCards={mode === "mobile"}
          />
        )}

        {page === "ai" && (
          <section className="panel aiPanel">
            <div className="panelTitle">
              <div>
                <h2>JAVIS AI 운영 분석</h2>
                <p>{data.ai?.time || "최근 30일 FD·FL 분석"}</p>
              </div>
              <button type="button" className="ai" onClick={() => runAction("ai")}>
                분석 다시 실행
              </button>
            </div>
            <div className="aiText">
              {data.ai?.text ||
  data.ai?.content ||
  data.aiText ||
  "AI 분석 결과가 없습니다."}
            </div>
          </section>
        )}

        {page === "settings" && (
          <div className="settingsPage">
            <section className="panel">
              <div className="panelTitle">
                <div>
                  <h2>관리자 메뉴</h2>
                  <p>변상금과 운영관리</p>
                </div>
              </div>
              <div className="settingsGrid">
                <button type="button" onClick={() => changePage("compensation")}>
                  <WalletCards />
                  <span>
                    <strong>변상금 관리</strong>
                    <small>판매가·감모율·미매칭 상품</small>
                  </span>
                  ›
                </button>
                <button type="button" onClick={() => changePage("management")}>
                  <Wrench />
                  <span>
                    <strong>운영관리</strong>
                    <small>원인·담당자·조치·상태</small>
                  </span>
                  ›
                </button>
              </div>
            </section>
          </div>
        )}

        {page === "compensation" && (
          <div>
            <button type="button" className="backBtn" onClick={() => changePage("settings")}>
              <ArrowLeft size={16} />설정으로
            </button>
            <div className="modeSwitch">
              <button
                type="button"
                className={!adjusted ? "active" : ""}
                onClick={() => changeCompMode("gross")}
              >
                일반 변상금액
              </button>
              <button
                type="button"
                className={adjusted ? "active" : ""}
                onClick={() => changeCompMode("adjusted")}
              >
                감모율 0.1% 차감
              </button>
            </div>
            <section className="kpiGrid moneyGrid">
              <article className="kpiCard money">
                <span>선택 기간 변상금액</span>
                <strong>{fmt(amount(summary.selectedAmount || summary.totalAmount))}<small>원</small></strong>
                <em>FD·FL × 판매가</em>
              </article>
              <article className="kpiCard money">
                <span>오늘 변상금액</span>
                <strong>{fmt(amount(summary.todayAmount))}<small>원</small></strong>
                <em>가격 매칭 기준</em>
              </article>
              <article className="kpiCard money">
                <span>이번 달 변상금액</span>
                <strong>{fmt(amount(summary.monthAmount))}<small>원</small></strong>
                <em>현재 월 누적</em>
              </article>
              <article className="kpiCard warning">
                <span>가격 미매칭</span>
                <strong>{fmt(summary.unmatchedQty)}<small>EA</small></strong>
                <em>금액 합계 제외</em>
              </article>
            </section>
            <TablePage
              title="상품별 판매가 및 누적 변상금액"
              subtitle={adjusted ? "감모율 0.1% 차감 적용" : "일반 변상금액 기준"}
              headers={compensation.headers || []}
              rows={compRows}
              mobileCards={mode === "mobile"}
            />
          </div>
        )}

        {page === "management" && (
          <div>
            <button type="button" className="backBtn" onClick={() => changePage("settings")}>
              <ArrowLeft size={16} />설정으로
            </button>
            <TablePage
              title="발생 건별 원인·조치·변상 관리"
              subtitle="LOSS_관리 시트 연동"
              headers={management.headers || []}
              rows={management.rows || []}
              mobileCards={mode === "mobile"}
            />
          </div>
        )}
      </main>

      {menuOpen && mode === "mobile" && (
        <button
          type="button"
          className="scrim"
          aria-label="메뉴 닫기"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <strong>JAVIS 처리 중</strong>
        </div>
      )}
    </div>
  );
}
