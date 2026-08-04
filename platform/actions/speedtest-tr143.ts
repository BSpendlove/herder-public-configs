// Normalizer for the TR-143 HTTP speedtest.
//
// Pure by design: it receives the parameters the engine collected and
// returns the capability's result shape. It cannot reach the device, and
// does not need to.
//
// THROUGHPUT IS DERIVED, NOT REPORTED. TR-143 gives byte counts and
// timestamps, not a rate, and the spec is specific about which pair to
// use: TestBytes over the BOM-to-EOM window. TotalBytes counts protocol
// overhead and bytes that arrived outside the measured window, and on
// the ARRIS NVG578LX it can be LOWER than TestBytes on upload, so a
// naive TotalBytes/duration is wrong in both directions.

interface Result {
  capability: string;
  method: string;
  download_mbps: number | null;
  upload_mbps: number | null;
  latency_ms: number | null;
  bytes_down: number | null;
  bytes_up: number | null;
  measured_at: string | null;
  limits: { cpu_bound: boolean; note: string };
}

const P = "InternetGatewayDevice.";
const DL = P + "DownloadDiagnostics.";
const UL = P + "UploadDiagnostics.";

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// TR-143 timestamps are ISO 8601. A CPE with no clock reports the
// "unknown time" sentinel 0001-01-01T00:00:00Z, which must not become a
// real duration.
function ms(v: string | undefined): number | null {
  if (!v || v.startsWith("0001-01-01")) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

// Some ARRIS firmware drops leading zeros from fractional seconds:
// ".83387" on the wire means ".083387", which puts EOMTime before
// BOMTime and makes the naive duration negative. Left-padding the
// shorter fraction to six digits restores the ordering, and on the lab
// NVG578LX the corrected duration matches the test server's own
// wall-clock measurement of the same transfer to the millisecond.
// The padded reading is only used when the raw one is impossible
// (non-positive), so spec-conformant devices are untouched.
function padFraction(v: string): string {
  const m = v.match(/^(.*\.)(\d{1,5})($|[Z+-].*)/);
  if (!m) return v;
  return m[1] + m[2].padStart(6, "0") + m[3];
}

function mbps(bytes: number | null, startRaw: string | undefined, endRaw: string | undefined): number | null {
  if (bytes === null) return null;
  const rate = (startMs: number | null, endMs: number | null): number | null => {
    if (startMs === null || endMs === null) return null;
    const seconds = (endMs - startMs) / 1000;
    if (seconds <= 0) return null;
    return Math.round(((bytes * 8) / seconds / 1e6) * 100) / 100;
  };
  const raw = rate(ms(startRaw), ms(endRaw));
  if (raw !== null) return raw;
  return rate(ms(startRaw && padFraction(startRaw)), ms(endRaw && padFraction(endRaw)));
}

const p = action.params;

// Server-side observation of the same transfer, captured by the step
// probe from the test server's /live endpoint. Some firmware runs a
// time-based test perfectly and then files an empty report (this
// ARRIS leaves TestBytesReceived* at zero and the timestamps blank in
// timed mode). The transfer still happened and the server measured it
// byte for byte, so the probe is the result's fallback: a real
// measurement of the same wire, attributed by this run's ref tag.
function probeRate(step: string, kind: string): { mbps: number; bytes: number } | null {
  const raw = p["probe." + step];
  if (!raw) return null;
  try {
    const body = JSON.parse(raw) as {
      transfers?: { test: string; ref: string; bytes: number; elapsed_ms: number }[];
    };
    const t = (body.transfers ?? []).find(
      (x) => x.test.startsWith(kind) && x.ref === action.runId,
    );
    if (!t || t.elapsed_ms <= 0 || t.bytes <= 0) return null;
    return {
      mbps: Math.round(((t.bytes * 8) / (t.elapsed_ms / 1000) / 1e6) * 100) / 100,
      bytes: t.bytes,
    };
  } catch {
    return null;
  }
}

// Connect time doubles as the latency estimate. It is a TCP handshake to
// the test server, not an ICMP RTT, so it includes server accept latency
// and is a ceiling on the true path RTT rather than a measurement of it.
const latency = (() => {
  const req = ms(p[DL + "TCPOpenRequestTime"]);
  const resp = ms(p[DL + "TCPOpenResponseTime"]);
  if (req === null || resp === null) return null;
  const d = resp - req;
  return d >= 0 ? Math.round(d * 100) / 100 : null;
})();

// Timed tests report the spec-preferred figure under "full loading"
// (the window with every connection saturated); sized tests report the
// plain counters. Prefer full-loading when it is present and non-zero.
const bytesDown =
  num(p[DL + "TestBytesReceivedUnderFullLoading"]) ||
  num(p[DL + "TestBytesReceived"]);
const bytesUp =
  num(p[UL + "TestBytesSentUnderFullLoading"]) ||
  num(p[UL + "TestBytesSent"]);

const dlProbe = probeRate("download", "http_download");
const ulProbe = probeRate("upload", "http_upload");
const dlCpe = mbps(bytesDown, p[DL + "BOMTime"], p[DL + "EOMTime"]);
const ulCpe = mbps(bytesUp, p[UL + "BOMTime"], p[UL + "EOMTime"]);

const out: Result = {
  capability: action.capability,
  // The CPE'"'"'s own figure wins when it exists; the server'"'"'s observation
  // of the same transfer fills vendor gaps, and the method says which.
  method:
    dlCpe === null && dlProbe !== null ? "tr143-http+server" : "tr143-http",
  download_mbps: dlCpe ?? dlProbe?.mbps ?? null,
  upload_mbps: ulCpe ?? ulProbe?.mbps ?? null,
  latency_ms: latency,
  bytes_down: bytesDown || dlProbe?.bytes || null,
  bytes_up: bytesUp || ulProbe?.bytes || null,
  measured_at: p[DL + "EOMTime"] || p[UL + "EOMTime"] || null,
  limits: {
    // The transfer is terminated by the CPE's own CPU, so on a
    // multi-gigabit line this measures the device rather than the
    // circuit. Surfaced on the result because an operator comparing a
    // TR-143 figure with a chipset-accelerated one needs to know they
    // are not the same measurement.
    cpu_bound: true,
    note: "HTTP transfer runs on the CPE CPU and may not saturate a multi-gigabit line",
  },
};

result(out);
