// Seed: Periodic. Refresh key parameters and enforce management config.
// Triggered on: periodic (TR-069 "2 PERIODIC")
//
// Uses canonical paths, so the mapping profile translates to the correct
// device-native paths (TR-098/TR-181/vendor) automatically. Identical
// management config to the boot seed, from the same helpers, so the two
// rules cannot drift apart and start rewriting each other's values.

provision.run("lib/mgmt_credentials.ts");
const informInterval = provision.run("lib/periodic_inform.ts", { base: 900, spread: 300 });

provision.log(
  "periodic refresh complete, inform interval " + String(informInterval) +
  "s, firmware: " + (device.firmware || "(unreported)")
);
