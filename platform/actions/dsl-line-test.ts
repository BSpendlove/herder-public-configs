// Normalizer for dsl_line_test, both families.
//
// The loop diagnostic returns per-subcarrier arrays (HLOG, QLN, SNR)
// that run to kilobytes. The run row keeps the scalars an operator
// triages on, and for each array its presence and length: a line whose
// QLN came back empty is a different fault from one whose QLN shows
// bridged-tap notches, and the full arrays stay readable in the raw
// parameters when that depth is needed.

interface Result {
  capability: string;
  method: string;
  state: string | null;
  attenuation_down: string;
  attenuation_up: string;
  signal_attenuation_down: string;
  signal_attenuation_up: string;
  arrays: Record<string, number>;
}

const p = action.params;
const CONFIGS = [
  { root: "Device.DSL.Diagnostics.ADSLLineTest.", state: "DiagnosticsState" },
  { root: "InternetGatewayDevice.WANDevice.1.WANDSLDiagnostics.", state: "LoopDiagnosticsState" },
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

const arrays: Record<string, number> = {};
for (const name of ["HLOGpsds", "HLOGpsus", "QLNpsds", "QLNpsus", "SNRpsds", "SNRpsus", "BITSpsds", "GAINSpsds"]) {
  const v = p[cfg.root + name];
  if (v === undefined) continue;
  arrays[name] = v === "" ? 0 : v.split(",").length;
}

const out: Result = {
  capability: action.capability,
  method: action.profile,
  state: p[cfg.root + cfg.state] ?? null,
  attenuation_down: p[cfg.root + "LATNpbds"] ?? "",
  attenuation_up: p[cfg.root + "LATNpbus"] ?? "",
  signal_attenuation_down: p[cfg.root + "SATNds"] ?? "",
  signal_attenuation_up: p[cfg.root + "SATNus"] ?? "",
  arrays: arrays,
};
result(out);
