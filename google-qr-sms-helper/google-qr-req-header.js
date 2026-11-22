const IPAD_MINI_UA = "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const url = $request.url || "";
const headers = Object.assign({}, $request.headers || {});
const targetUA = url.indexOf("/devicephoneverification/") !== -1 ? IPHONE_UA : IPAD_MINI_UA;

for (const key of Object.keys(headers)) {
  const lower = key.toLowerCase();
  if (lower === "user-agent" || lower.indexOf("sec-ch-ua") === 0) {
    delete headers[key];
  }
}

headers["User-Agent"] = targetUA;

$done({ headers });
