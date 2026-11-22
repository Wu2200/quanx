const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

function getHeader(headers, name) {
  if (!headers) return "";
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) {
      return headers[key];
    }
  }
  return "";
}

function parseCookieMap(cookieStr) {
  const map = {};
  if (!cookieStr) return map;
  const parts = String(cookieStr).split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) map[k] = v;
    }
  }
  return map;
}

function mergeCookies(cookieStr, respHeaders) {
  const map = parseCookieMap(cookieStr);
  const setCookie = getHeader(respHeaders, "set-cookie");
  if (!setCookie) return cookieStr;
  const items = Array.isArray(setCookie) ? setCookie : String(setCookie).split(/,(?=[^ ;]+=)/);
  for (const item of items) {
    const firstSemi = item.indexOf(";");
    const pair = (firstSemi !== -1 ? item.slice(0, firstSemi) : item).trim();
    const eq = pair.indexOf("=");
    if (eq > 0) {
      const k = pair.slice(0, eq).trim();
      const v = pair.slice(eq + 1).trim();
      if (k) map[k] = v;
    }
  }
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join("; ");
}

function unescapeBeginUrl(raw) {
  return raw
    .replace(/\\u003d|\\x3d/gi, "=")
    .replace(/\\u0026|\\x26/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&quot;.*$/, "");
}

function jsonDone(obj) {
  $done({
    status: "HTTP/1.1 200 OK",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(obj)
  });
}

async function handleDowngrade(qrUrl, initialCookie) {
  let cookie = initialCookie;
  let targetUrl = qrUrl;

  if (targetUrl.indexOf("g.co/verify/") !== -1) {
    const shortResp = await $task.fetch({
      url: targetUrl,
      method: "GET",
      headers: {
        "User-Agent": IPHONE_UA
      },
      opts: {
        redirection: false
      }
    });
    const loc = getHeader(shortResp.headers, "location");
    if (loc && loc.indexOf("devicephoneverification/begin") !== -1) {
      targetUrl = loc;
    } else {
      const shortHtml = shortResp.body || "";
      const m = shortHtml.match(/devicephoneverification(?:\\\/|\/)begin\?[^"'\s<>]+/);
      if (m) {
        targetUrl = "https://accounts.google.com/" + unescapeBeginUrl(m[0]);
      }
    }
  }

  const initResp = await $task.fetch({
    url: targetUrl,
    method: "GET",
    headers: {
      "User-Agent": IPHONE_UA,
      "Cookie": cookie
    }
  });
  cookie = mergeCookies(cookie, initResp.headers);
  const html = initResp.body || "";

  const atMatch = html.match(/"SNlM0e":"([^"]+)"/);
  const dshMatch = html.match(/"Qzxixc":"([^"]+)"/);
  let tl = "";
  const ds0Match = html.match(/key:\s*['"]ds:0['"][^}]*data:\["([^"]+)"\]/);
  if (ds0Match) {
    tl = ds0Match[1];
  } else {
    const tlMatch = html.match(/ADG-[A-Za-z0-9_-]+/);
    if (tlMatch) tl = tlMatch[0];
  }
  if (!atMatch || !dshMatch || !tl) {
    throw new Error("未能从二维码页面提取出 SNlM0e / Qzxixc / TL 参数");
  }
  const at = atMatch[1];
  const dsh = dshMatch[1];

  async function callRpc(rpcid, payload, sourcePath) {
    const url = `https://accounts.google.com/devicephoneverification/_/DevicePhoneVerificationUi/data/batchexecute?rpcids=${rpcid}&source-path=${sourcePath}&hl=en&tl=${encodeURIComponent(tl)}&rt=c`;
    const body = `f.req=${encodeURIComponent(JSON.stringify([[[rpcid, JSON.stringify(payload), null, "generic"]]]))}&at=${encodeURIComponent(at)}`;
    const r = await $task.fetch({
      url,
      method: "POST",
      headers: {
        "User-Agent": IPHONE_UA,
        "Cookie": cookie,
        "Origin": "https://accounts.google.com",
        "Referer": "https://accounts.google.com/",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body
    });
    cookie = mergeCookies(cookie, r.headers);
    return r.body || "";
  }

  await callRpc("MypxBd", [tl, dsh, false, null, null, false, null, null, "browser"], "%2Fdevicephoneverification%2Finitiate");

  const consentUrl = `https://accounts.google.com/devicephoneverification/consent?flow=browser&plt&dsh=${encodeURIComponent(dsh)}&hl=en&tl=${encodeURIComponent(tl)}`;
  const consentResp = await $task.fetch({
    url: consentUrl,
    method: "GET",
    headers: {
      "User-Agent": IPHONE_UA,
      "Cookie": cookie
    }
  });
  cookie = mergeCookies(cookie, consentResp.headers);
  const consentHtml = consentResp.body || "";
  const uuidMatch = consentHtml.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  if (!uuidMatch) {
    throw new Error("未能从 consent 页面提取到 UUID");
  }
  const rid = uuidMatch[0];

  const ydResp = await callRpc("YDtwf", [null, rid, dsh, 7, null, tl, false], "%2Fdevicephoneverification%2Fmodacintro");
  return { ok: true, rid, ydResp };
}

(async () => {
  try {
    const payload = JSON.parse($request.body || "{}");
    const qrUrl = payload.qrUrl;
    if (!qrUrl) {
      jsonDone({ ok: false, error: "缺少 qrUrl 参数" });
      return;
    }
    const cookie = getHeader($request.headers, "cookie");
    const result = await handleDowngrade(qrUrl, cookie);
    jsonDone(result);
  } catch (err) {
    jsonDone({ ok: false, error: err && err.message ? err.message : String(err) });
  }
})();
