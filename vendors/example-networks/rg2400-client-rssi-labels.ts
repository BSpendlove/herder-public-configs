// Example Networks RG2400 per-client WiFi label enrichment.
//
// Output: per-client labeled rows tagged with client_mac. The family
// reports client signal under the X_00005E_* vendor spellings on the
// standard TR-098 AssociatedDevice table; band comes from the
// WLANConfiguration index (1 = 2.4GHz, 2 = 5GHz on this hardware).
const WLAN_BAND: Record<string, string> = {
  "1": "2.4GHz",
  "2": "5GHz",
};

function normaliseMac(s: unknown): string | null {
  if (typeof s !== "string") return null;
  return s.toLowerCase().replace(/-/g, ":");
}

function toInt(s: unknown): number | null {
  if (typeof s !== "string" && typeof s !== "number") return null;
  const n = parseInt(String(s), 10);
  return isNaN(n) ? null : n;
}

const clients = batch.matches(
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.*.AssociatedDevice.*",
);
for (let i = 0; i < clients.length; i++) {
  const ad = clients[i];
  const mac = normaliseMac(ad.AssociatedDeviceMACAddress);
  if (!mac) continue;
  const labels = {
    client_mac: mac,
    via: "gateway",
    band: WLAN_BAND[ad.$indexes.WLANConfiguration] ?? "unknown",
    wlan_idx: ad.$indexes.WLANConfiguration,
  };
  const rssi = ad.X_00005E_RSSI as string | undefined;
  if (rssi !== undefined && rssi !== "") {
    emit("wifi.client.rssi", toInt(rssi), labels);
  }
  const sig = ad.X_00005E_SignalStrength as string | undefined;
  if (sig !== undefined && sig !== "") {
    emit("wifi.client.signal", toInt(sig), labels);
  }
  const tx = ad.LastDataTransmitRate as string | undefined;
  if (tx !== undefined && tx !== "") {
    emit("wifi.client.tx_rate", toInt(tx), labels);
  }
}
