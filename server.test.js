const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { createApp } = require("./server");

let app;
let server;
let baseUrl;

before(async () => {
  app = createApp({ dbPath: ":memory:" });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  app.locals.close();
});

async function request(path, { method = "GET", body } = {}) {
  const headers = { "X-Requested-With": "dara" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return {
    response,
    data: response.headers.get("content-type")?.includes("application/json")
      ? JSON.parse(text)
      : text,
  };
}

test("authentication and account endpoints are unavailable", async () => {
  for (const [method, path] of [
    ["POST", "/auth/register"],
    ["POST", "/auth/login"],
    ["POST", "/auth/forgot-password"],
    ["POST", "/auth/reset-password"],
    ["POST", "/auth/logout"],
    ["POST", "/auth/change-password"],
    ["GET", "/auth/sessions"],
    ["GET", "/me"],
    ["PATCH", "/me"],
    ["DELETE", "/me"],
  ]) {
    const { response, data } = await request(path, { method });
    assert.equal(response.status, 404, `${method} ${path}`);
    assert.equal(data.code, "NOT_FOUND");
  }
});

test("guest dashboard and health endpoint remain available", async () => {
  let result = await request("/");
  assert.equal(result.response.status, 200);
  assert.match(result.data, /DARA_USER_ID/);

  result = await request("/account.html");
  assert.equal(result.response.status, 200);
  assert.match(result.data, /index\.html/);
  assert.doesNotMatch(result.data, /account\.js|ثبت.?نام|ورود به دارا/);

  result = await request("/api/health");
  assert.deepEqual(result.data, { status: "ok" });

  result = await request("/markets-ui.js");
  assert.equal(result.response.status, 200);
  assert.match(result.data, /DaraMarketsUI/);

  for (const [file, marker] of [
    ["/phase4-core.js", "DaraPhase4Core"],
    ["/phase4-ui.js", "DaraPhase4UI"],
    ["/phase5-core.js", "DaraPhase5Core"],
    ["/phase5-ui.js", "DaraPhase5UI"],
  ]) {
    result = await request(file);
    assert.equal(result.response.status, 200);
    assert.match(result.data, new RegExp(marker));
  }
});
