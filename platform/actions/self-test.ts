// Normalizer for self_test, both families. Results is vendor-defined
// free text and is passed through verbatim: the spec deliberately does
// not say what a self test tests, so parsing it would be a per-vendor
// list this file must never become.

interface Result {
  capability: string;
  method: string;
  state: string | null;
  results: string;
}

const p = action.params;
const ROOTS = ["Device.SelfTestDiagnostics.", "InternetGatewayDevice.SelfTestDiagnostics."];
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

const out: Result = {
  capability: action.capability,
  method: action.profile,
  state: p[root + "DiagnosticsState"] ?? null,
  results: (p[root + "Results"] ?? "").trim(),
};
result(out);
