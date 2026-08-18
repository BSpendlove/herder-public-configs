// Seed: Boot. Refresh parameters, enforce config, track boot events.
// Triggered on: boot (TR-069 "1 BOOT")
//
// Uses canonical paths, so the mapping profile translates to the correct
// device-native paths (TR-098/TR-181/vendor) automatically. The
// management config it enforces is shared with the periodic and first
// contact seeds, so it lives in lib/ and runs from here.

provision.run("lib/mgmt_credentials.ts");
provision.run("lib/periodic_inform.ts", { base: 900, spread: 300 });

// Tag device as recently booted (operators can track reboots).
device.addTag("boot-seen");

provision.log("boot check complete, firmware: " + (device.firmware || "(unreported)"));
