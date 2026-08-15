// Seed: Periodic — refresh key parameters and enforce management config.
// Triggered on: periodic (TR-069 "2 PERIODIC")
//
// Uses canonical paths — the mapping profile translates to the correct
// device-native paths (TR-098/TR-181/vendor) automatically.


// Enforce connection request credentials.
const crUsername = device.oui + "-" + (device.serialNumber || "");
device.set("canonical.mgmt.connection_request_username", crUsername);
device.set("canonical.mgmt.connection_request_password", crUsername);

// Periodic inform, spread across the fleet rather than in lockstep.
//
// A fixed interval means every CPE that boots in the same window informs
// in the same window forever after. It survives one storm and then
// recreates it every interval, and a mass event (a regional power cut,
// an ACS restart) locks the whole estate into one phase. 84k devices
// arriving together is what that looks like; the admission gate sheds
// the excess with 503 + Retry-After and the ACS stays up, but the peak
// is self-inflicted and avoidable.
//
// The offset is DERIVED FROM THE DEVICE, never drawn at random. A random
// value would differ on every provisioning pass, so desired state would
// never match reported state, and each pass would write the interval
// again: a permanent write loop across the fleet, which is worse than
// the storm it set out to fix. djb2 over the device identity gives the
// same answer for the same CPE forever, and a different one per CPE.
var informBase = 900;
var informSpread = 300;

var informKey = device.oui + "-" + (device.serialNumber || "");
var informHash = 5381;
for (var i = 0; i < informKey.length; i++) {
    informHash = ((informHash * 33) ^ informKey.charCodeAt(i)) >>> 0;
}
var informInterval = informBase + (informHash % informSpread);

device.set("canonical.mgmt.periodic_inform_enable", true);
device.set("canonical.mgmt.periodic_inform_interval", informInterval);

provision.log("periodic refresh complete, firmware: " + (device.firmware || "(unreported)"));
