const url = $request.url;
const headers = $request.headers || {};

if (headers["User-Agent"]) {
    headers["User-Agent"] = headers["User-Agent"].replace(/com\.google\.ios\.youtube\/[0-9\.]+/g, "com.google.ios.youtube/19.29.1");
}

if (url.indexOf("/youtubei/v1/player") !== -1 || url.indexOf("/youtubei/v1/browse") !== -1) {
    delete headers["x-goog-visitor-id"];
}

$done({ headers });
