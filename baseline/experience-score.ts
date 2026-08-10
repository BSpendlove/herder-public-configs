// Baseline experience score (#714).
//
// Computes component scores from standard TR-098 / TR-181 paths, rolls
// them up into wifi + wan dimension scores, and rolls those up into
// overall. All weights and thresholds come from the rule's config
// block; the read side (the device page's Experience tab, dashboards,
// the API) never derives a score.
//
// A component whose inputs are absent from this batch is skipped, and
// a dimension with no components is skipped, so partial data models
// degrade to a partial tree instead of fake zeros.

// --- Config -------------------------------------------------------------

const RSSI_FLOOR = ctx.configGet<number>("wifiRssiFloor", -85);
const RSSI_CEIL = ctx.configGet<number>("wifiRssiCeil", -55);
const RATE_FLOOR = ctx.configGet<number>("rateFloorMbps", 10);
const RATE_CEIL = ctx.configGet<number>("rateCeilMbps", 100);
const WAN_ERR_CEIL = ctx.configGet<number>("wanErrorRateCeil", 0.01);
const WAN_UPTIME_GOOD = ctx.configGet<number>("wanUptimeGoodSeconds", 86400);

// --- Helpers ------------------------------------------------------------

function toNum(s: unknown): number | null {
  if (typeof s !== "string" && typeof s !== "number") return null;
  const n = parseFloat(String(s));
  return isNaN(n) ? null : n;
}

// Linear 0-100 between floor (0) and ceil (100).
function linScore(value: number, floor: number, ceil: number): number {
  if (ceil === floor) return value >= ceil ? 100 : 0;
  const t = (value - floor) / (ceil - floor);
  return Math.max(0, Math.min(100, t * 100));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

// Weighted mean over the parts that exist, so one missing component
// does not zero its dimension.
function weightedMean(parts: Array<{ value: number | null; weight: number }>): number | null {
  let sum = 0;
  let weightSum = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.value === null) continue;
    sum += p.value * p.weight;
    weightSum += p.weight;
  }
  return weightSum > 0 ? sum / weightSum : null;
}

function applyBandTags(dimension: string, value: number): void {
  const poorBelow = ctx.configGet<number>("bandPoorBelow", 60);
  const fairBelow = ctx.configGet<number>("bandFairBelow", 80);
  const band = value < poorBelow ? "poor" : value < fairBelow ? "fair" : "good";
  const bands = ["poor", "fair", "good"];
  for (let i = 0; i < bands.length; i++) {
    const tag = "experience:" + dimension + ":" + bands[i];
    if (bands[i] === band) {
      device.addTag(tag);
    } else {
      device.removeTag(tag);
    }
  }
}

// --- WiFi components ----------------------------------------------------

interface ClientSample { rssi: number | null; rate: number | null; mac: string | null; }

const clients: ClientSample[] = [];


// Vendor-extension fallback for client signal. TR-069 vendor leaves
// follow X_<OUI>_<Name>; plenty of firmware reports client RSSI only
// under that convention (X_0000C5_RSSI, X_00005E_RSSI, ...), and a
// score that reads only the standard spelling silently drops its
// heaviest-weighted component for those fleets. The scan is the
// naming convention, not a vendor table: dBm-style RSSI is preferred,
// the percent-style SignalStrength variant is used only as a last
// resort and never mistaken for dBm (values above 0 are ignored for
// the rssi component).
function clientSignalDbm(c: Record<string, unknown>): number | null {
  const std = toNum(c.SignalStrength);
  if (std !== null && std <= 0) return std;
  const keys = Object.keys(c);
  for (let i = 0; i < keys.length; i++) {
    if (/^X_[0-9A-Fa-f]{6}_RSSI$/.test(keys[i])) {
      const v = toNum(c[keys[i]]);
      if (v !== null && v <= 0) return v;
    }
  }
  for (let i = 0; i < keys.length; i++) {
    if (/^X_[0-9A-Fa-f]{6}_SignalStrength$/.test(keys[i])) {
      const v = toNum(c[keys[i]]);
      if (v !== null && v <= 0) return v;
    }
  }
  return std;
}

const tr181Clients = batch.matches("Device.WiFi.AccessPoint.*.AssociatedDevice.*");
for (let i = 0; i < tr181Clients.length; i++) {
  const c = tr181Clients[i];
  clients.push({
    rssi: toNum(c.SignalStrength),
    rate: toNum(c.LastDataDownlinkRate),
    mac: typeof c.MACAddress === "string" ? c.MACAddress.toLowerCase() : null,
  });
}
const tr098Clients = batch.matches(
  "InternetGatewayDevice.LANDevice.*.WLANConfiguration.*.AssociatedDevice.*",
);
for (let i = 0; i < tr098Clients.length; i++) {
  const c = tr098Clients[i];
  clients.push({
    rssi: clientSignalDbm(c),
    rate: toNum(c.LastDataTransmitRate),
    mac:
      typeof c.AssociatedDeviceMACAddress === "string"
        ? c.AssociatedDeviceMACAddress.toLowerCase()
        : null,
  });
}

let wifiRssiScore: number | null = null;
let wifiRateScore: number | null = null;

const rssiScores: number[] = [];
let worstRssi: number | null = null;
let worstMac: string | null = null;
for (let i = 0; i < clients.length; i++) {
  const r = clients[i].rssi;
  if (r === null) continue;
  rssiScores.push(linScore(r, RSSI_FLOOR, RSSI_CEIL));
  if (worstRssi === null || r < worstRssi) {
    worstRssi = r;
    worstMac = clients[i].mac;
  }
}
wifiRssiScore = mean(rssiScores);
if (wifiRssiScore !== null) {
  score.set("wifi", wifiRssiScore, {
    component: "client_rssi",
    client_count: rssiScores.length,
    worst_client_mac: worstMac,
    worst_rssi_dbm: worstRssi,
  });
}

const rateScores: number[] = [];
for (let i = 0; i < clients.length; i++) {
  const rate = clients[i].rate;
  if (rate === null || rate === 0) continue;
  // Rates report in kbps on some data models; treat >10000 as kbps.
  const mbps = rate > 10000 ? rate / 1000 : rate;
  rateScores.push(linScore(mbps, RATE_FLOOR, RATE_CEIL));
}
wifiRateScore = mean(rateScores);
if (wifiRateScore !== null) {
  score.set("wifi", wifiRateScore, { component: "phy_rate" });
}

const wifiScore = weightedMean([
  { value: wifiRssiScore, weight: ctx.configGet<number>("weightWifiClientRssi", 0.7) },
  { value: wifiRateScore, weight: ctx.configGet<number>("weightWifiPhyRate", 0.3) },
]);
if (wifiScore !== null) {
  score.set("wifi", wifiScore);
  applyBandTags("wifi", wifiScore);
}

// --- WAN components -----------------------------------------------------

let wanErrorScore: number | null = null;
let wanStabilityScore: number | null = null;

// Error rate from interface stats: errors / packets received, worst
// interface wins. TR-181 Ethernet stats first, TR-098 WAN stats second.
let worstErrRate: number | null = null;
let worstErrIface: string | null = null;

// batch.matches flattens leaves under the wildcard anchor to dotted
// keys, so Stats fields read as entry["Stats.ErrorsReceived"].
const tr181Ifaces = batch.matches("Device.Ethernet.Interface.*");
for (let i = 0; i < tr181Ifaces.length; i++) {
  const s = tr181Ifaces[i];
  const errors = toNum(s["Stats.ErrorsReceived"]);
  const packets = toNum(s["Stats.PacketsReceived"]);
  if (errors === null || packets === null || packets === 0) continue;
  const rate = errors / packets;
  if (worstErrRate === null || rate > worstErrRate) {
    worstErrRate = rate;
    worstErrIface = "ethernet." + s.$indexes.Interface;
  }
}
const tr098Wans = batch.matches("InternetGatewayDevice.WANDevice.*");
for (let i = 0; i < tr098Wans.length; i++) {
  const s = tr098Wans[i];
  const errors = toNum(s["WANEthernetInterfaceConfig.Stats.ErrorsReceived"]);
  const packets = toNum(s["WANEthernetInterfaceConfig.Stats.PacketsReceived"]);
  if (errors === null || packets === null || packets === 0) continue;
  const rate = errors / packets;
  if (worstErrRate === null || rate > worstErrRate) {
    worstErrRate = rate;
    worstErrIface = "wandevice." + s.$indexes.WANDevice;
  }
}
if (worstErrRate !== null) {
  wanErrorScore = linScore(WAN_ERR_CEIL - worstErrRate, 0, WAN_ERR_CEIL);
  score.set("wan", wanErrorScore, {
    component: "error_rate",
    worst_interface: worstErrIface,
  });
}

// Stability from WAN connection uptime: a freshly re-established
// connection scores low, a day of uptime scores 100.
let bestUptime: number | null = null;
const tr098Conns = batch.matches(
  "InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*",
);
for (let i = 0; i < tr098Conns.length; i++) {
  const u = toNum(tr098Conns[i].Uptime);
  if (u === null) continue;
  if (bestUptime === null || u > bestUptime) bestUptime = u;
}
const tr181Up = toNum(batch.params["Device.DeviceInfo.UpTime"]);
if (bestUptime === null && tr181Up !== null) {
  bestUptime = tr181Up;
}
if (bestUptime !== null) {
  wanStabilityScore = linScore(bestUptime, 0, WAN_UPTIME_GOOD);
  score.set("wan", wanStabilityScore, {
    component: "stability",
    uptime_seconds: bestUptime,
  });
}

const wanScore = weightedMean([
  { value: wanErrorScore, weight: ctx.configGet<number>("weightWanErrors", 0.6) },
  { value: wanStabilityScore, weight: ctx.configGet<number>("weightWanStability", 0.4) },
]);
if (wanScore !== null) {
  score.set("wan", wanScore);
  applyBandTags("wan", wanScore);
}

// --- Overall ------------------------------------------------------------

const overall = weightedMean([
  { value: wifiScore, weight: ctx.configGet<number>("weightOverallWifi", 0.5) },
  { value: wanScore, weight: ctx.configGet<number>("weightOverallWan", 0.5) },
]);
if (overall !== null) {
  score.set("overall", overall);
  applyBandTags("overall", overall);
} else {
  enrichment.warn(
    "experience-score: no wifi or wan inputs in this batch; no scores emitted",
  );
}
