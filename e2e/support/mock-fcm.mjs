// Local stand-in for Google's OAuth token endpoint + FCM HTTP v1 "messages:send", used by the e2e suite
// so push notifications can be tested end to end without a real Firebase service account.
//
//   POST /token                                  – verifies the RS256 JWT assertion against MOCK_FCM_PUBLIC_KEY
//   POST /v1/projects/:project/messages:send     – records the message (401 without the bearer token)
//   GET  /received                               – everything received so far
//   DELETE /received                             – reset
//
// A device token that starts with "dead-" is answered like a real unregistered token (404 UNREGISTERED);
// one that starts with "badarg-" like a malformed-payload error (400 INVALID_ARGUMENT) – the app must
// NOT treat that as a dead token.
import crypto from "node:crypto";
import http from "node:http";

const port = Number(process.env.MOCK_FCM_PORT || 4010);
const publicKey = process.env.MOCK_FCM_PUBLIC_KEY;
const received = [];
let tokenRequests = 0;

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

function verifyJwt(jwt) {
  const [header, claims, signature] = jwt.split(".");
  if (!header || !claims || !signature || !publicKey) return false;
  const ok = crypto.createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, "base64url"));
  const payload = JSON.parse(Buffer.from(claims, "base64url").toString());
  return ok && payload.scope === "https://www.googleapis.com/auth/firebase.messaging" && payload.exp > Date.now() / 1000;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "POST" && url.pathname === "/token") {
      tokenRequests += 1;
      const form = new URLSearchParams(await readBody(req));
      if (form.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer" || !verifyJwt(form.get("assertion") || "")) {
        return json(res, 401, { error: "invalid_grant" });
      }
      return json(res, 200, { access_token: "mock-access-token", expires_in: 3600, token_type: "Bearer" });
    }
    if (req.method === "POST" && /^\/v1\/projects\/[^/]+\/messages:send$/.test(url.pathname)) {
      if (req.headers.authorization !== "Bearer mock-access-token") return json(res, 401, { error: { status: "UNAUTHENTICATED" } });
      const body = JSON.parse(await readBody(req));
      const message = body.message || {};
      const size = Buffer.byteLength(JSON.stringify(message.data || {}));
      if (size > 4096) return json(res, 400, { error: { status: "INVALID_ARGUMENT", message: "Message too big", details: [{ errorCode: "INVALID_ARGUMENT" }] } });
      if (String(message.token).startsWith("dead-")) {
        return json(res, 404, { error: { code: 404, status: "NOT_FOUND", message: "Requested entity was not found.", details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "UNREGISTERED" }] } });
      }
      if (String(message.token).startsWith("badarg-")) {
        return json(res, 400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "Invalid JSON payload received.", details: [{ errorCode: "INVALID_ARGUMENT" }] } });
      }
      received.push({ token: message.token, data: message.data, at: Date.now() });
      return json(res, 200, { name: `projects/mock/messages/${received.length}` });
    }
    if (url.pathname === "/received") {
      if (req.method === "DELETE") {
        received.length = 0;
        tokenRequests = 0;
        return json(res, 200, { ok: true });
      }
      return json(res, 200, { received, tokenRequests });
    }
    if (url.pathname === "/health") return json(res, 200, { ok: true });
    return json(res, 404, { error: "not found" });
  })
  .listen(port, "127.0.0.1", () => console.log(`mock FCM listening on ${port}`));
