// Seed: Periodic. Refresh key parameters and enforce management config.
// Triggered on: periodic (TR-069 "2 PERIODIC")
//
// Uses canonical paths, so the mapping profile translates to the correct
// device-native paths (TR-098/TR-181/vendor) automatically. Identical
// management config to the boot seed, from the same helpers, so the two
// rules cannot drift apart and start rewriting each other's values.

provision.run("lib/mgmt_credentials.ts");

// Pacing comes from the rule's config block when one is set, so a
// cohort that needs a different inform rate overrides informPacing in
// its own rule's YAML rather than forking this script.
const informInterval = provision.run("lib/periodic_inform.ts", ctx.configGet("informPacing", { base: 900, spread: 300 }));

provision.log(
  "periodic refresh complete, inform interval " + String(informInterval) +
  "s, firmware: " + (device.firmware || "(unreported)")
);
