// Local stand-in for the TCS E-COM API (login, create booking, cancel, reverse pickup, tracking) so the whole
// booking / cancel / handover flow can be tested without a TCS account.
//
//   GET  /ecom/api/authentication/token?username=&password=   – 200 + accesstoken for tcs-user/tcs-pass, else 401
//   POST /ecom/api/booking/create                              – needs Bearer; returns consignmentNo
//   POST /ecom/api/booking/cancel                              – cancels (fails with FAILURE once picked up)
//   POST /ecom/api/booking/reverse                             – books a reverse pickup
//   GET  /tracking/api/Tracking/GetDynamicTrackDetail?consignee=CN  – latest scripted status (or FAIL when none yet)
//   GET  /__state                                               – everything received
//   POST /__status {cn, status}                                 – script the tracking status for a CN
//   DELETE /__state                                             – reset
import http from "node:http";

const port = Number(process.env.MOCK_TCS_PORT || 4011);
const TOKEN = "mock-tcs-token";
let bookings = new Map();
let statuses = new Map();
let counter = 770000000000;
let log = [];

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const body = req.method === "POST" ? JSON.parse((await readBody(req)) || "{}") : null;
    const authed = req.headers.authorization === `Bearer ${TOKEN}`;

    if (url.pathname === "/health") return send(res, 200, { ok: true });
    if (url.pathname === "/__state") {
      if (req.method === "DELETE") {
        bookings = new Map();
        statuses = new Map();
        log = [];
        return send(res, 200, { ok: true });
      }
      return send(res, 200, { bookings: [...bookings.values()], log });
    }
    if (url.pathname === "/__status" && req.method === "POST") {
      statuses.set(body.cn, body.status);
      return send(res, 200, { ok: true });
    }

    log.push(`${req.method} ${url.pathname}`);

    if (url.pathname === "/ecom/api/authentication/token") {
      if (url.searchParams.get("username") === "tcs-user" && url.searchParams.get("password") === "tcs-pass") {
        return send(res, 200, { accesstoken: TOKEN, expiry: new Date(Date.now() + 3600_000).toISOString(), message: "success" });
      }
      return send(res, 401, { result: null, status: false, code: "401" });
    }
    if (!authed) return send(res, 401, { message: "Invalid Bearer token. Mismatch configuration." });

    if (url.pathname === "/ecom/api/booking/create") {
      const ship = body.shipmentinfo ?? {};
      const cons = body.consigneeinfo ?? {};
      if (!/^03\d{9}$/.test(cons.mobile ?? "")) return send(res, 400, { response: "FAILURE", message: "Consignee mobile is invalid", status: false, code: "400" });
      if (!(ship.weightinkg >= 0.5)) return send(res, 400, { response: "FAILURE", message: "weightinkg must be at least 0.5", status: false, code: "400" });
      if (!ship.costcentercode || !body.shipperinfo?.tcsaccount) return send(res, 400, { response: "FAILURE", message: "account or cost centre missing", status: false, code: "400" });
      const cn = String(counter++);
      bookings.set(cn, { cn, referenceno: ship.referenceno, codamount: ship.codamount, pieces: ship.pieces, cityname: cons.cityname, mobile: cons.mobile, firstname: cons.firstname, middlename: cons.middlename, address1: cons.address1, cancelled: false });
      return send(res, 200, { response: "SUCCESS", consignmentNo: cn, code: "200", status: true });
    }
    if (url.pathname === "/ecom/api/booking/cancel") {
      const booking = bookings.get(String(body.consignmentNumber));
      if (!booking) return send(res, 200, { message: "FAILURE: consignment not found", status: false });
      const status = statuses.get(booking.cn);
      if (status && !/book/i.test(status)) return send(res, 200, { message: "FAILURE: shipment already picked up", status: false });
      booking.cancelled = true;
      return send(res, 200, { message: "SUCCESS", status: true });
    }
    if (url.pathname === "/ecom/api/booking/reverse") {
      return send(res, 200, { message: "SUCCESS", status: "true" });
    }
    if (url.pathname === "/tracking/api/Tracking/GetDynamicTrackDetail") {
      const cn = url.searchParams.get("consignee");
      const status = statuses.get(cn);
      if (!status) return send(res, 200, { shipmentinfo: null, deliveryinfo: null, checkpoints: null, shipmentsummary: "No Data Found/Invalid CN", message: "FAIL" });
      return send(res, 200, {
        shipmentinfo: [{ consignmentno: cn }],
        deliveryinfo: [{ consignmentno: cn, status, datetime: "Monday Oct 05, 2026 10:00" }],
        checkpoints: [{ consignmentno: cn, datetime: "Monday Oct 05, 2026 10:00", status }],
        shipmentsummary: `Current Status: ${status}`,
        message: "SUCCESS",
      });
    }
    return send(res, 404, { message: "not found" });
  })
  .listen(port, "127.0.0.1", () => console.log(`mock TCS listening on ${port}`));
