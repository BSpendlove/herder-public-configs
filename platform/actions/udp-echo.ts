// Normalizer for udp_echo: loss, RTT and jitter.
//
// Jitter is computed from the per-packet send and receive timestamps
// as the mean absolute difference between consecutive RTTs (RFC 3550's
// estimator, simplified to a batch): the aggregate min/avg/max alone
// cannot distinguish a steady 40 ms from 10 ms with spikes, and the
// spikes are what a VoIP complaint is about.

interface Result {
  capability: string;
  method: string;
  state: string | null;
  host: string;
  success_count: number | null;
  failure_count: number | null;
  rtt_min_ms: number | null;
  rtt_avg_ms: number | null;
  rtt_max_ms: number | null;
  jitter_ms: number | null;
  packets: number;
}

const p = action.params;
const ROOT = "Device.IP.Diagnostics.UDPEchoDiagnostics.";

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Per-packet RTTs from the send/receive timestamps, in packet order.
const rtts: number[] = [];
for (let i = 1; i <= 256; i++) {
  const base = ROOT + "IndividualPacketResult." + i + ".";
  const sent = p[base + "PacketSendTime"];
  const recv = p[base + "PacketReceiveTime"];
  if (sent === undefined) continue;
  if (p[base + "PacketSuccess"] === "false" || recv === undefined || recv === "") continue;
  const rtt = Date.parse(recv) - Date.parse(sent);
  if (Number.isFinite(rtt) && rtt >= 0) rtts.push(rtt);
}

let jitter: number | null = null;
if (rtts.length > 1) {
  let sum = 0;
  for (let i = 1; i < rtts.length; i++) sum += Math.abs(rtts[i] - rtts[i - 1]);
  jitter = Math.round((sum / (rtts.length - 1)) * 10) / 10;
}

const out: Result = {
  capability: action.capability,
  method: action.profile,
  state: p[ROOT + "DiagnosticsState"] ?? null,
  host: p[ROOT + "Host"] ?? action.inputs["host"] ?? "",
  success_count: num(p[ROOT + "SuccessCount"]),
  failure_count: num(p[ROOT + "FailureCount"]),
  rtt_min_ms: num(p[ROOT + "MinimumResponseTime"]),
  rtt_avg_ms: num(p[ROOT + "AverageResponseTime"]),
  rtt_max_ms: num(p[ROOT + "MaximumResponseTime"]),
  jitter_ms: jitter,
  packets: rtts.length,
};
result(out);
