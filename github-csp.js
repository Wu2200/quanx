const headers = $response.headers;

for (const key of Object.keys(headers)) {
  if (key.toLowerCase() === 'content-security-policy') {
    delete headers[key];
  }
}

$done({ headers });
