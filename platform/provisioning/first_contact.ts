// Seed: First Contact — parameter discovery + initial config.
// Triggered on: first_contact (TR-069 "0 BOOTSTRAP")
//
// Uses canonical paths — the mapping profile translates to the correct
// device-native paths (TR-098/TR-181/vendor) automatically.

// No fetches. Parameter discovery is the telemetry phase's job, and
// every set below is unconditional, so a fetch here only added device
// round-trips to the eval on the busiest session the fleet has. At
// 100k a boot storm's evals went from milliseconds to seconds on
// exactly those round-trips, and the queue died of old age.

// Set up connection request credentials (deterministic per device).
const crUsername = device.oui + "-" + (device.serialNumber || "");
device.set("canonical.mgmt.connection_request_username", crUsername);
device.set("canonical.mgmt.connection_request_password", crUsername);

// Enable and configure periodic inform. PeriodicInformTime carries a
// deterministic per-device phase offset (hash of the serial spread over
// the interval) so a fleet's informs land uniformly instead of pulsing
// together: after an ISP-wide outage every CPE reboots at the same
// moment, and without a phase offset the whole fleet would re-inform in
// synchronized waves forever (#649). Deterministic-from-serial matters:
// re-running first_contact must not re-randomize the phase.
// 900, not 300. The interval is the fleet's steady-state load: at 100k
// CPEs a 300s interval is 333 sessions per second forever, which on the
// reference rig is the whole database write budget, so the steady
// state starves the very bootstraps a recovering fleet needs admitted.
// 900s is 111 per second, comfortably inside capacity, and still far
// fresher than the 24h window the console's "not informing" measures
// against. Real deployments at this scale run 900s or slower.
var informInterval = 900;
var phase = 0;
var serial = device.serialNumber || "";
for (var i = 0; i < serial.length; i++) {
  phase = (phase * 31 + serial.charCodeAt(i)) % informInterval;
}
// Per TR-069, only PeriodicInformTime's phase (time modulo interval)
// matters; the date part is arbitrary and may be in the past.
var mm = Math.floor(phase / 60);
var ss = phase % 60;
function pad2(n: number) { return (n < 10 ? "0" : "") + n; }
device.set("canonical.mgmt.periodic_inform_enable", true);
device.set("canonical.mgmt.periodic_inform_interval", informInterval);
device.set(
  "canonical.mgmt.periodic_inform_time",
  "2001-01-01T00:" + pad2(mm) + ":" + pad2(ss) + "Z"
);

// Tag the device as discovered.
device.addTag("discovered");
device.removeTag("undiscovered");

provision.log("first contact complete for " + (device.serialNumber || "(unknown)"));
