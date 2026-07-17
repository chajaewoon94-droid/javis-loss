// =====================================================
// JAVIS LOSS Apps Script API
// 회사·집·Vercel 어디서 실행해도 동일한 웹앱으로 연결
// =====================================================

export const DEFAULT_API_URL =
  "https://script.google.com/macros/s/AKfycbxn33mZVjWwTGWVvU1sX3CnT4FzN-PhwcA-WL_MiqkxjmMBvb0uUEKO-ZFFhBSZjqvFag/exec";

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRY_COUNT = 2;

function normalizeApiUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

export function getApiUrl() {
  return normalizeApiUrl(DEFAULT_API_URL);
}

export function hasConfiguredApiUrl() {
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(
    getApiUrl(),
  );
}

function createCallbackName() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);

  return `javisLossCallback_${timestamp}_${random}`;
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function requestJsonp(params = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const apiUrl = getApiUrl();

  return new Promise((resolve, reject) => {
    const callbackName = createCallbackName();
    const script = document.createElement("script");

    let completed = false;
    let timer = null;

    const query = new URLSearchParams();

    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      query.set(key, String(value));
    });

    query.set("callback", callbackName);
    query.set("_", String(Date.now()));

    const requestUrl = `${apiUrl}?${query.toString()}`;

    function removeCallback() {
      try {
        delete window[callbackName];
      } catch {
        window[callbackName] = undefined;
      }
    }

    function removeScript() {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    function cleanup() {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }

      removeScript();
      removeCallback();
    }

    function finishSuccess(payload) {
      if (completed) return;
      completed = true;

      cleanup();

      if (payload?.ok === false) {
        reject(
          new Error(
            payload.message ||
              payload.error ||
              "Apps Script 요청 처리 중 오류가 발생했습니다.",
          ),
        );
        return;
      }

      resolve(payload || {});
    }

    function finishError(message) {
      if (completed) return;
      completed = true;

      cleanup();
      reject(new Error(message));
    }

    window[callbackName] = finishSuccess;

    script.type = "text/javascript";
    script.async = true;
    script.defer = true;
    script.referrerPolicy = "no-referrer-when-downgrade";
    script.src = requestUrl;

    script.onerror = () => {
      console.error("[JAVIS JSONP] 스크립트 연결 실패");
      console.error("[JAVIS JSONP] 요청 주소:", requestUrl);

      finishError(
        "Apps Script 연결에 실패했습니다. 인터넷 연결을 확인한 후 다시 시도하세요.",
      );
    };

    timer = window.setTimeout(() => {
      console.error("[JAVIS JSONP] 응답 시간 초과");
      console.error("[JAVIS JSONP] 요청 주소:", requestUrl);

      finishError(
        "Apps Script 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.",
      );
    }, Math.max(5000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));

    const target = document.head || document.body || document.documentElement;

    if (!target) {
      finishError("페이지 초기화가 완료되지 않아 API를 호출할 수 없습니다.");
      return;
    }

    target.appendChild(script);
  });
}

export async function jsonp(
  params = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retryCount = DEFAULT_RETRY_COUNT,
) {
  if (!hasConfiguredApiUrl()) {
    throw new Error("Apps Script 웹앱 URL 형식이 올바르지 않습니다.");
  }

  let lastError = null;
  const totalAttempts = Math.max(1, Number(retryCount) + 1);

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      return await requestJsonp(params, timeoutMs);
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(String(error || "알 수 없는 연결 오류"));

      console.warn(
        `[JAVIS JSONP] 호출 실패 ${attempt}/${totalAttempts}`,
        lastError,
      );

      if (attempt < totalAttempts) {
        await wait(attempt * 800);
      }
    }
  }

  throw lastError || new Error("Apps Script API 호출에 실패했습니다.");
}