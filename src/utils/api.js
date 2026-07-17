const PLACEHOLDER_API_URL = "PASTE_APPS_SCRIPT_WEB_APP_URL_HERE";

function normalizeApiUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export const DEFAULT_API_URL = normalizeApiUrl(
  import.meta.env.VITE_JAVIS_API_URL || PLACEHOLDER_API_URL,
);

export function saveApiUrl(url) {
  const clean = normalizeApiUrl(url);
  localStorage.setItem("JAVIS_LOSS_API_URL", clean);
  window.location.reload();
}

export function getApiUrl() {
  return normalizeApiUrl(
    localStorage.getItem("JAVIS_LOSS_API_URL") ||
      import.meta.env.VITE_JAVIS_API_URL ||
      DEFAULT_API_URL,
  );
}

export function hasConfiguredApiUrl() {
  const url = getApiUrl();
  return Boolean(
    url &&
      !url.includes("PASTE_APPS_SCRIPT") &&
      /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(url),
  );
}

export function jsonp(params = {}, timeoutMs = 30000) {
  const apiUrl = getApiUrl();

  if (!hasConfiguredApiUrl()) {
    return Promise.reject(
      new Error("Apps Script 웹앱 URL을 먼저 설정하세요."),
    );
  }

  return new Promise((resolve, reject) => {
    const callbackName = `javisLoss_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;

    const script = document.createElement("script");
    const query = new URLSearchParams({
      ...params,
      callback: callbackName,
      _: String(Date.now()),
    });

    const cleanup = () => {
      window.clearTimeout(timer);
      script.remove();
      try {
        delete window[callbackName];
      } catch {
        window[callbackName] = undefined;
      }
    };

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Apps Script 서버 응답 시간이 초과되었습니다."));
    }, timeoutMs);

    window[callbackName] = (payload) => {
      cleanup();

      if (payload?.ok === false) {
        reject(new Error(payload.message || "Apps Script 요청에 실패했습니다."));
        return;
      }

      resolve(payload || {});
    };

    script.onerror = () => {
      cleanup();
      reject(
        new Error(
          "Apps Script API에 연결하지 못했습니다. 웹앱 배포 권한과 URL을 확인하세요.",
        ),
      );
    };

    script.async = true;
    script.src = `${apiUrl}?${query.toString()}`;
    document.body.appendChild(script);
  });
}
