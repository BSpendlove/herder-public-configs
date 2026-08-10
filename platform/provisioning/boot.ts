// Seed: Boot — refresh parameters, enforce config, track boot events.
// Triggered on: boot (TR-069 "1 BOOT")
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

// Tag device as recently booted (operators can track reboots).
device.addTag("boot-seen");

provision.log("boot check complete, firmware: " + (device.firmware || "(unreported)"));
