// Normalizer for the traceroute capability, both data model families.
//
// Hops keep their order by instance number, not by arrival order of
// the collected keys: {i} is the hop's TTL and a route listed out of
// order is a different route.

interface Hop {
  hop: number;
  host: string;
  address: string;
  rtt_ms: number[];
  error_code: number | null;
}

interface Result {
  capability: string;
  method: string;
  state: string | null;
  host: string;
  protocol: string | null;
  response_time_ms: number | null;
  hops: Hop[];
}

const p = action.params;

const CONFIGS: Array<{ root: string; hopPrefix: string }> = [
  { root: "Device.IP.Diagnostics.TraceRoute.", hopPrefix: "RouteHops." },
  { root: "InternetGatewayDevice.TraceRouteDiagnostics.", hopPrefix: "RouteHops." },
];
let cfg = CONFIGS[0];
for (const c of CONFIGS) {
  let found = false;
  for (const key of Object.keys(p)) {
    if (key.indexOf(c.root) === 0) {
      found = true;
      break;
    }
  }
  if (found) {
    cfg = c;
    break;
  }
}

// TR-098 prefixes the hop leaves with "Hop"; TR-181 does not. Both are
// read so the one file serves both families.
function hopLeaf(index: number, leaf: string): string | undefined {
  const base = cfg.root + cfg.hopPrefix + index + ".";
  return p[base + leaf] ?? p[base + "Hop" + leaf];
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const hops: Hop[] = [];
for (let i = 1; i <= 64; i++) {
  const host = hopLeaf(i, "Host");
  if (host === undefined && hopLeaf(i, "HostAddress") === undefined) continue;
  const rttRaw = hopLeaf(i, "RTTimes") ?? "";
  const rtt: number[] = [];
  for (const part of rttRaw.split(",")) {
    const n = Number(part.trim());
    if (part.trim() !== "" && Number.isFinite(n)) rtt.push(n);
  }
  hops.push({
    hop: i,
    host: host ?? "",
    address: hopLeaf(i, "HostAddress") ?? "",
    rtt_ms: rtt,
    error_code: num(hopLeaf(i, "ErrorCode")),
  });
}

const out: Result = {
  capability: action.capability,
  method: action.profile,
  state: p[cfg.root + "DiagnosticsState"] ?? null,
  host: action.inputs["host"] ?? "",
  protocol: p[cfg.root + "ProtocolVersion"] ?? action.inputs["protocol"] ?? null,
  response_time_ms: num(p[cfg.root + "ResponseTime"]),
  hops: hops,
};

result(out);
