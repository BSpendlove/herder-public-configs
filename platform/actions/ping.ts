// Normalizer for the ping capability, both data model families.
//
// One file rather than one per family: the collected keys carry the
// root, TR-098 spells the leaves identically under
// InternetGatewayDevice.IPPingDiagnostics., and a second copy would
// drift from this one the first time either changed.
//
// Response times are milliseconds per both specs. TR-181 also offers
// microsecond "Detailed" variants; they are ignored because the
// TR-098 half could never match them and a result whose precision
// depends on the data model reads as a measurement difference.

interface Result {
  capability: string;
  method: string;
  state: string | null;
  host: string;
  protocol: string | null;
  success_count: number | null;
  failure_count: number | null;
  rtt_avg_ms: number | null;
  rtt_min_ms: number | null;
  rtt_max_ms: number | null;
}

const p = action.params;

const ROOTS = [
  "Device.IP.Diagnostics.IPPing.",
  "InternetGatewayDevice.IPPingDiagnostics.",
];
let root = ROOTS[0];
for (const r of ROOTS) {
  let found = false;
  for (const key of Object.keys(p)) {
    if (key.indexOf(r) === 0) {
      found = true;
      break;
    }
  }
  if (found) {
    root = r;
    break;
  }
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const out: Result = {
  capability: action.capability,
  method: action.profile,
  // The CPE's own terminal state, verbatim: vendors spell their error
  // states differently and an operator debugging a fleet needs the
  // word the firmware used.
  state: p[root + "DiagnosticsState"] ?? null,
  host: action.inputs["host"] ?? "",
  protocol:
    p[root + "ProtocolVersion"] ??
    p[root + "X_0000C5_IPv6Preferred"] ??
    action.inputs["protocol"] ??
    null,
  success_count: num(p[root + "SuccessCount"]),
  failure_count: num(p[root + "FailureCount"]),
  rtt_avg_ms: num(p[root + "AverageResponseTime"]),
  rtt_min_ms: num(p[root + "MinimumResponseTime"]),
  rtt_max_ms: num(p[root + "MaximumResponseTime"]),
};

result(out);
