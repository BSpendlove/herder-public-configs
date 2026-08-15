// Normalizer for the ARRIS NVG vendor neighbour scan (TR-098).
//
// Structurally identical to the TR-181 normalizer because the vendor
// tree is TR-181-shaped under an X_ prefix: Channel, SignalStrength and
// OperatingFrequencyBand all keep their standard leaf names, so only
// the root differs. The one leaf that is spelled differently,
// Bandwidth against TR-181's OperatingChannelBandwidth, is not read
// here: it is carried by the mapping table for anything computing
// overlap, and the captured firmware answers "Auto" rather than a
// width, so it cannot be summarised as a number anyway.
//
// Verified against a live NVG578LX returning 80 neighbours: the band
// list came out as both 2.4 and 5 GHz and the strongest neighbour at
// -21 dBm, which is the shape the summary is meant to convey.
//
// Pure by design: it receives the parameters the engine collected and
// returns the capability's result shape. It cannot reach the device.
//
// WHAT THIS RESULT IS AND IS NOT.
//
// It is a receipt for one sweep: how many APs the radio heard, on which
// bands, how loud the loudest was, and whether the CPE said the scan
// finished. It is NOT the neighbour list. The list lives in
// device_parameters at its raw paths, where the RF neighbourhood graph
// resolves it against the fleet BSSID index, and putting a copy of it
// here would mean two stores of the same measurement disagreeing the
// moment one of them is refreshed.
//
// NO SSID APPEARS IN THIS RESULT, AND NO BSSID EITHER.
//
// An action result is rendered in the UI, returned by the API and read
// by whoever asked for the scan. Neighbour SSIDs are the network names
// of people who are not the operator's customers, and a BSSID list is a
// map of their equipment. Neither belongs in a per-device receipt that
// answers "did the scan work". The graph needs them and holds them under
// the rules in api/app/routers/spectrum_rf.py; this does not need them
// and therefore does not have them.

interface Result {
  capability: string;
  method: string;
  // What the CPE said when it finished. Vendors spell completion and
  // their error states differently and this passes the string through
  // rather than adjudicating: an operator debugging a fleet that will
  // not scan needs the word their firmware used.
  state: string | null;
  // As the CPE counted them, which is the figure the coverage model
  // needs: zero results reported is evidence of clean air, and no count
  // at all is evidence of nothing.
  neighbours: number | null;
  bands: string[];
  strongest_dbm: number | null;
  // True when at least one result carried a signal strength that could
  // not be read as dBm. Firmware reporting a 0-100 quality percentage
  // under SignalStrength is common enough to be worth flagging, and the
  // graph's energy weighting silently understates until it is fixed.
  unreadable_signal: boolean;
  measured_at: string | null;
}

const ROOT =
  "InternetGatewayDevice.LANDevice.1.X_0000C5_Wireless.NeighboringWiFiDiagnostic.";

const p = action.params;

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// The channel number decides the band, on every radio ever built. The
// CPE's own band string is consulted for one case only: 6 GHz reuses the
// low channel numbers, so 1-14 is ambiguous without it. This mirrors
// derive_band in api/app/routers/spectrum.py, which explains at length
// why a reported band field is not trusted for anything else.
function bandOf(channel: number, reported: string): string {
  const hint = (reported || "").toLowerCase().replace(/ /g, "");
  if (channel <= 14) return hint.indexOf("6g") >= 0 ? "6 GHz" : "2.4 GHz";
  if (channel <= 177) return "5 GHz";
  return "6 GHz";
}

const bands: string[] = [];
let strongest: number | null = null;
let unreadable = false;

for (const key of Object.keys(p)) {
  if (key.indexOf(ROOT + "Result.") !== 0) continue;
  const leaf = key.substring(key.lastIndexOf(".") + 1);
  const obj = key.substring(0, key.lastIndexOf("."));

  if (leaf === "Channel") {
    const channel = num(p[key]);
    if (channel !== null && channel > 0) {
      const band = bandOf(channel, p[obj + ".OperatingFrequencyBand"] ?? "");
      if (bands.indexOf(band) < 0) bands.push(band);
    }
  }

  if (leaf === "SignalStrength") {
    const rssi = num(p[key]);
    if (rssi === null) continue;
    // dBm, and negative. Anything else is something other than a signal
    // strength and is reported as such rather than guessed at.
    if (rssi > 0 || rssi < -127) unreadable = true;
    else if (strongest === null || rssi > strongest) strongest = rssi;
  }
}

bands.sort();

const out: Result = {
  capability: action.capability,
  method: "arris-neighboring-wifi",
  state: p[ROOT + "DiagnosticsState"] ?? null,
  neighbours: num(p[ROOT + "ResultNumberOfEntries"]),
  bands: bands,
  strongest_dbm: strongest,
  unreadable_signal: unreadable,
  measured_at: null,
};

result(out);
