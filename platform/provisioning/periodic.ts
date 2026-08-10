// Seed: Periodic — refresh key parameters and enforce management config.
// Triggered on: periodic (TR-069 "2 PERIODIC")
//
// Uses canonical paths — the mapping profile translates to the correct
// device-native paths (TR-098/TR-181/vendor) automatically.


// Enforce connection request credentials.
const crUsername = device.oui + "-" + (device.serialNumber || "");
device.set("canonical.mgmt.connection_request_username", crUsername);
device.set("canonical.mgmt.connection_request_password", crUsername);

// Enforce periodic inform config.
device.set("canonical.mgmt.periodic_inform_enable", true);
device.set("canonical.mgmt.periodic_inform_interval", 300);

provision.log("periodic refresh complete, firmware: " + (device.firmware || "(unreported)"));
