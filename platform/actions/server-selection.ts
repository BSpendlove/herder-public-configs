// Normalizer for server_selection: the winner and its numbers.

interface Result {
  capability: string;
  method: string;
  state: string | null;
  hosts: string;
  fastest_host: string;
  rtt_min_ms: number | null;
  rtt_avg_ms: number | null;
  rtt_max_ms: number | null;
}

const p = action.params;
const ROOT = "Device.IP.Diagnostics.ServerSelectionDiagnostics.";

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const out: Result = {
  capability: action.capability,
  method: action.profile,
  state: p[ROOT + "DiagnosticsState"] ?? null,
  hosts: action.inputs["hosts"] ?? "",
  fastest_host: p[ROOT + "FastestHost"] ?? "",
  rtt_min_ms: num(p[ROOT + "MinimumResponseTime"]),
  rtt_avg_ms: num(p[ROOT + "AverageResponseTime"]),
  rtt_max_ms: num(p[ROOT + "MaximumResponseTime"]),
};
result(out);
