const url = $request.url || "";
const headers = $response.headers || {};
let body = $response.body || "";

let contentType = "";
for (const key of Object.keys(headers)) {
  if (key.toLowerCase() === "content-type") {
    contentType = String(headers[key] || "").toLowerCase();
    break;
  }
}

function __qxUaSpoof() {
  const IPAD_MINI_UA = "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
  const props = {
    userAgent: IPAD_MINI_UA,
    appVersion: "5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    platform: "iPad",
    vendor: "Apple Computer, Inc.",
    maxTouchPoints: 5,
    userAgentData: undefined
  };
  for (const [k, v] of Object.entries(props)) {
    try {
      Object.defineProperty(navigator, k, { get: () => v, configurable: true });
    } catch (_) {}
  }
}

function __qxUiMain() {
  const isCloud = location.hostname === "console.cloud.google.com";
  const isQrPage = location.pathname.indexOf("/challenge/iap/qrcode") !== -1;
  if (!isCloud && !isQrPage) {
    return;
  }

  function mount() {
    if (document.getElementById("__qx_qr_panel__")) return;
    const panel = document.createElement("div");
    panel.id = "__qx_qr_panel__";
    panel.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#1a73e8;color:#fff;padding:12px 16px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.25);font-family:system-ui,-apple-system,sans-serif;font-size:13px;display:flex;flex-direction:column;gap:8px;min-width:240px;max-width:320px;";

    const title = document.createElement("div");
    title.style.cssText = "font-weight:600;font-size:14px;display:flex;justify-content:space-between;align-items:center;";
    title.textContent = "Google 验证降级助手 (QX)";
    panel.appendChild(title);

    const statusEl = document.createElement("div");
    statusEl.style.cssText = "font-size:12px;color:#e8f0fe;word-break:break-word;line-height:1.4;";
    panel.appendChild(statusEl);

    const manualInput = document.createElement("input");
    manualInput.type = "text";
    manualInput.placeholder = "可选：手动粘贴二维码链接 (g.co/verify/...)";
    manualInput.style.cssText = "display:none;padding:6px 8px;border-radius:6px;border:none;font-size:12px;color:#202124;background:#fff;width:100%;box-sizing:border-box;";
    panel.appendChild(manualInput);

    const btn = document.createElement("button");
    btn.style.cssText = "background:#fff;color:#1a73e8;border:none;padding:8px 12px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;";
    panel.appendChild(btn);

    (document.body || document.documentElement).appendChild(panel);

    if (isCloud) {
      statusEl.textContent = "第一步：点击右上角终端图标 [>_] 唤出 Verify 弹窗（手机端若看不到图标，请先在 Safari 切换为桌面网站）";
      btn.textContent = "1. 自动点击 Cloud Shell 终端图标";
      btn.onclick = () => {
        const shellBtn = document.querySelector('button[aria-label*="Cloud Shell"], button[mattooltip*="Cloud Shell"], [id*="cloudshell"]');
        if (shellBtn) {
          shellBtn.click();
          statusEl.textContent = "已点击终端图标，等待底部弹出 Verify 按钮...";
          setTimeout(() => {
            const allBtns = Array.from(document.querySelectorAll("button, a"));
            const verifyBtn = allBtns.find(b => (b.textContent || "").trim() === "Verify");
            if (verifyBtn) {
              verifyBtn.click();
              statusEl.textContent = "已自动点击 Verify 按钮！";
            }
          }, 2500);
        } else {
          statusEl.textContent = "未找到终端按钮，请切换桌面网站或手动点击右上角 [>_] 图标";
        }
      };
    } else if (isQrPage) {
      statusEl.textContent = "已检测到二维码验证页，点击下方按钮一键注入 [3,null,4] 并跳入选择页";
      btn.textContent = "一键降级到短信选择框";
      btn.onclick = runDowngrade;
    }

    function loadJsQR() {
      if (window.jsQR) return Promise.resolve(window.jsQR);
      const sources = [
        "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js",
        "https://unpkg.com/jsqr@1.4.0/dist/jsQR.js"
      ];
      return new Promise((resolve) => {
        let idx = 0;
        function tryNext() {
          if (idx >= sources.length) {
            resolve(null);
            return;
          }
          const s = document.createElement("script");
          s.src = sources[idx++];
          s.onload = () => resolve(window.jsQR || null);
          s.onerror = tryNext;
          (document.head || document.documentElement).appendChild(s);
        }
        tryNext();
      });
    }

    function unescapeUrl(raw) {
      return raw
        .replace(/\\\\u003d|\\\\x3d/gi, "=")
        .replace(/\\u003d|\\x3d/gi, "=")
        .replace(/\\\\u0026|\\\\x26/gi, "&")
        .replace(/\\u0026|\\x26/gi, "&")
        .replace(/\\\//g, "/")
        .replace(/&amp;/g, "&")
        .replace(/&quot;.*$/, "");
    }

    async function extractQrUrlFromPage() {
      const manualVal = manualInput.value.trim();
      if (manualVal) return manualVal;

      if ("BarcodeDetector" in window) {
        try {
          const detector = new BarcodeDetector({ formats: ["qr_code"] });
          const mediaEls = Array.from(document.querySelectorAll("img, canvas"));
          for (const el of mediaEls) {
            if (el.clientWidth > 80 && el.clientHeight > 80) {
              const c = document.createElement("canvas");
              c.width = el.naturalWidth || el.clientWidth || 300;
              c.height = el.naturalHeight || el.clientHeight || 300;
              const ctx = c.getContext("2d");
              ctx.fillStyle = "#fff";
              ctx.fillRect(0, 0, c.width, c.height);
              ctx.drawImage(el, 0, 0, c.width, c.height);
              const codes = await detector.detect(c);
              if (codes && codes.length > 0 && codes[0].rawValue) {
                return codes[0].rawValue;
              }
            }
          }
        } catch (_) {}
      }

      const bodyText = document.body ? (document.body.innerText || "") : "";
      const shortMatch = bodyText.match(/g\.co\/verify\/[A-Za-z0-9_-]+/);
      if (shortMatch) {
        return "https://" + shortMatch[0];
      }

      const html = document.documentElement.innerHTML || "";
      const beginMatch = html.match(/https:(?:\\\/|\/){2}accounts\.google\.com(?:\\\/|\/)devicephoneverification(?:\\\/|\/)begin\?[^"'\s<>]+/);
      if (beginMatch) {
        return unescapeUrl(beginMatch[0]);
      }
      const htmlShortMatch = html.match(/https?:(?:\\\/|\/){2}g\.co(?:\\\/|\/)verify(?:\\\/|\/)[A-Za-z0-9_-]+/);
      if (htmlShortMatch) {
        return unescapeUrl(htmlShortMatch[0]);
      }

      const jsQR = await loadJsQR();
      if (jsQR) {
        const mediaEls = Array.from(document.querySelectorAll("img, canvas"));
        for (const el of mediaEls) {
          try {
            if (el.clientWidth > 80 && el.clientHeight > 80) {
              const c = document.createElement("canvas");
              c.width = el.naturalWidth || el.clientWidth || 300;
              c.height = el.naturalHeight || el.clientHeight || 300;
              const ctx = c.getContext("2d");
              ctx.fillStyle = "#fff";
              ctx.fillRect(0, 0, c.width, c.height);
              ctx.drawImage(el, 0, 0, c.width, c.height);
              const imgData = ctx.getImageData(0, 0, c.width, c.height);
              const decoded = jsQR(imgData.data, c.width, c.height);
              if (decoded && decoded.data) {
                return decoded.data;
              }
            }
          } catch (_) {}
        }
      }

      manualInput.style.display = "block";
      throw new Error("未能在页面识别到二维码，请确认二维码已显示或长按二维码拷贝链接后粘贴到上方输入框");
    }

    async function runDowngrade() {
      try {
        btn.disabled = true;
        btn.textContent = "正在识别二维码...";
        const qrUrl = await extractQrUrlFromPage();
        statusEl.textContent = "已提取二维码，正在通过 QX 注入 [3,null,4]...";

        const resp = await fetch("https://accounts.google.com/__qx_qr_downgrade__", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qrUrl })
        });
        const res = await resp.json();
        if (!res || !res.ok) {
          throw new Error(res ? res.error : "QX 请求失败");
        }
        if (!res.ydResp || res.ydResp.indexOf("[3,null,4]") === -1) {
          statusEl.textContent = "服务端返回: " + String(res.ydResp || "").slice(0, 80);
          btn.disabled = false;
          btn.textContent = "重试一键降级";
          return;
        }

        statusEl.textContent = "[3,null,4] 注入成功！正在跳转短信验证页...";
        const params = new URLSearchParams(location.search);
        let cont = params.get("continue") || "";
        let targetUrl = "";

        if (cont && cont.indexOf("https://accounts.google.com/uplevelingstep/") === 0) {
          cont = cont.replace(/&idv_xdevice=[^&]*/g, "");
          cont = cont.replace(/([?&])authuser(&|$)/, "$1authuser=0$2");
          targetUrl = cont + "&idv_xdevice=1";
        } else {
          targetUrl = location.href.replace("/challenge/iap/qrcode", "/challenge/iap");
          targetUrl = targetUrl.replace(/&idv_xdevice=[^&]*/g, "") + "&idv_xdevice=1";
        }
        location.replace(targetUrl);
      } catch (e) {
        statusEl.textContent = "错误: " + (e && e.message ? e.message : String(e));
        btn.disabled = false;
        btn.textContent = "重试一键降级";
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
}

if (!body || contentType.indexOf("text/html") === -1 || body.indexOf("__qx_qr_sms_helper_injected__") !== -1) {
  $done({});
} else {
  const isAccounts = /^https:\/\/accounts\.google\.com\//i.test(url);
  const isCloudConsole = /^https:\/\/console\.cloud\.google\.com\//i.test(url);

  const uaSpoofScript = `<script data-qx="ua-spoof">(${__qxUaSpoof.toString()})();</script>`;
  const uiScript = `<script id="__qx_qr_sms_helper_injected__">(${__qxUiMain.toString()})();</script>`;

  if (isAccounts) {
    if (/<head[^>]*>/i.test(body)) {
      body = body.replace(/<head[^>]*>/i, (match) => match + uaSpoofScript);
    } else if (/<html[^>]*>/i.test(body)) {
      body = body.replace(/<html[^>]*>/i, (match) => match + uaSpoofScript);
    } else {
      body = uaSpoofScript + body;
    }
  }

  if (isAccounts || isCloudConsole) {
    if (/<\/body>/i.test(body)) {
      body = body.replace(/<\/body>/i, (match) => uiScript + match);
    } else if (/<\/html>/i.test(body)) {
      body = body.replace(/<\/html>/i, (match) => uiScript + match);
    } else {
      body = body + uiScript;
    }
  }

  $done({ body });
}
