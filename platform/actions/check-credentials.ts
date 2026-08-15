// Normalizer for check_credentials. The result is the CPE's terminal
// state and the username it was asked about; the password is masked
// before this sandbox ever runs and is not read here.

interface Result {
  capability: string;
  method: string;
  state: string | null;
  username: string;
  valid: boolean;
}

const p = action.params;
const state =
  p["Device.Users.CheckCredentialsDiagnostics.DiagnosticsState"] ?? null;

const out: Result = {
  capability: action.capability,
  method: action.profile,
  state: state,
  username: action.inputs["username"] ?? "",
  // "Complete" is the spec's success terminal; vendors spell failures
  // as Error_ states. Anything that is not Complete is not a pass.
  valid: state === "Complete",
};
result(out);
