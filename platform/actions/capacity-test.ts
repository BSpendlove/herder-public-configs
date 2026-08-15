// Normalizer for capacity_test: the headline capacity and the quality
// figures measured at it. The loss ratio and delay variation AT the
// maximum are what distinguish a clean gigabit from one achieved by
// buffering, which is the whole reason TR-471 exists.

interface Result {
  capability: string;
  method: string;
  state: string | null;
  direction: string;
  max_capacity_mbps: number | null;
  time_of_max: string | null;
  loss_ratio_at_max: number | null;
  rtt_range_at_max_ms: number | null;
  pdv_range_at_max_ms: number | null;
  min_oneway_delay_at_max_ms: number | null;
}

const p = action.params;
const ROOT = "Device.IP.Diagnostics.IPLayerCapacityMetrics.";

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const out: Result = {
  capability: action.capability,
  method: action.profile,
  state: p[ROOT + "DiagnosticsState"] ?? null,
  direction: p[ROOT + "TestType"] ?? action.inputs["direction"] ?? "",
  max_capacity_mbps: num(p[ROOT + "MaxIPLayerCapacity"]),
  time_of_max: p[ROOT + "TimeOfMax"] ?? null,
  loss_ratio_at_max: num(p[ROOT + "LossRatioAtMax"]),
  rtt_range_at_max_ms: num(p[ROOT + "RTTRangeAtMax"]),
  pdv_range_at_max_ms: num(p[ROOT + "PDVRangeAtMax"]),
  min_oneway_delay_at_max_ms: num(p[ROOT + "MinOnewayDelayAtMax"]),
};
result(out);
