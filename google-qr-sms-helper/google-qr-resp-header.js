const headers = Object.assign({}, $response.headers || {});
let contentType = "";

for (const key of Object.keys(headers)) {
  if (key.toLowerCase() === "content-type") {
    contentType = String(headers[key] || "").toLowerCase();
    break;
  }
}

if (contentType.indexOf("text/html") === -1) {
  $done({});
} else {
  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase();
    if (lower === "content-security-policy" || lower === "content-security-policy-report-only") {
      delete headers[key];
    }
  }
  $done({ headers });
}
