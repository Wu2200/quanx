const headers = $response.headers;

for (const key of Object.keys(headers)) {
  if (key.toLowerCase() === 'access-control-allow-origin') {
    delete headers[key];
  }
}

headers['Access-Control-Allow-Origin'] = '*';

$done({ headers });
