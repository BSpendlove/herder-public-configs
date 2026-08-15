// Normalizer for the dns_lookup capability, both data model families.
//
// Answers are per-repetition rows on the device; they are dedued into
// one answer set here because "what does this name resolve to" has one
// answer per address, and four repetitions of the same A record are
// evidence of stability, not four answers.

interface Attempt {
  status: string;
  answer_type: string;
  host_name_returned: string;
  ip_addresses: string[];
  dns_server_ip: string;
  response_time_ms: number | null;
}

interface Result {
  capability: string;
  method: string;
  state: string | null;
  hostname: string;
  server: string;
  success_count: number | null;
  addresses: string[];
  attempts: Attempt[];
}

const p = action.params;

const ROOTS = [
  "Device.DNS.Diagnostics.NSLookupDiagnostics.",
  "InternetGatewayDevice.NSLookupDiagnostics.",
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

const attempts: Attempt[] = [];
const addresses: string[] = [];
for (let i = 1; i <= 32; i++) {
  const base = root + "Result." + i + ".";
  const status = p[base + "Status"];
  if (status === undefined) continue;
  const ips: string[] = [];
  for (const part of (p[base + "IPAddresses"] ?? "").split(",")) {
    const ip = part.trim();
    if (ip === "") continue;
    ips.push(ip);
    if (addresses.indexOf(ip) < 0) addresses.push(ip);
  }
  attempts.push({
    status: status,
    answer_type: p[base + "AnswerType"] ?? "",
    host_name_returned: p[base + "HostNameReturned"] ?? "",
    ip_addresses: ips,
    dns_server_ip: p[base + "DNSServerIP"] ?? "",
    response_time_ms: num(p[base + "ResponseTime"]),
  });
}

const out: Result = {
  capability: action.capability,
  method: action.profile,
  state: p[root + "DiagnosticsState"] ?? null,
  hostname: action.inputs["hostname"] ?? "",
  server: action.inputs["server"] ?? "",
  success_count: num(p[root + "SuccessCount"]),
  addresses: addresses,
  attempts: attempts,
};

result(out);
