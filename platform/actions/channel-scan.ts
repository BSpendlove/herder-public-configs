// Normalizer for channel_scan: one row per channel with the AP count
// and the radio's own score. The result shape is the capability's
// contract; a second vendor implements the same shape from its own
// tree and nothing downstream changes.

interface ChannelRow {
  channel: number;
  radio: string;
  ap_count: number | null;
  score: number | null;
}

interface Result {
  capability: string;
  method: string;
  state: string | null;
  measured_at: string | null;
  channels: ChannelRow[];
}

const p = action.params;
const ROOT = "InternetGatewayDevice.LANDevice.1.X_0000C5_Wireless.ChannelDiagnostics.";

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const channels: ChannelRow[] = [];
for (let i = 1; i <= 64; i++) {
  const base = ROOT + "Result." + i + ".";
  const ch = num(p[base + "Channel"]);
  if (ch === null) continue;
  channels.push({
    channel: ch,
    radio: p[base + "Radio"] ?? "",
    ap_count: num(p[base + "APCount"]),
    score: num(p[base + "ChannelScore"]),
  });
}
channels.sort((a, b) => a.channel - b.channel);

const out: Result = {
  capability: action.capability,
  method: action.profile,
  state: p[ROOT + "DiagnosticsState"] ?? null,
  measured_at: p[ROOT + "TimeStamp"] ?? null,
  channels: channels,
};
result(out);
