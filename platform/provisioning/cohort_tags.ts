// Cohort tags at first contact: which firmware ring a gateway is on, and
// whether it serves a business line.
//
// This rule stands in for the CRM. In a real deployment the tags below
// arrive through the tag API when the subscriber is provisioned or their
// contract changes: `ring:canary` for the households the ISP trusts to
// take a build first, `sla:business` for contracts with an uptime
// commitment. The ACS does not decide either; it only carries the
// decision. The demo has no CRM, so this script derives both from a
// hash of the serial, deterministically: the same gateway lands on the
// same ring on every bootstrap, and the spread across the fleet is what
// a CRM push would produce (5 percent canary, 25 percent early, the
// rest general; 8 percent business lines).
//
// Group assignment rules turn the tags into groups (rollout.canary,
// rollout.early, rollout.general, sla.business) and campaigns target the
// groups through the group_path selector. Tags are permanent and the
// guards below make the rule once-ever per gateway, so a ring is a
// property of the household, not of the session.

var key = device.oui + "-" + (device.serialNumber || "");

// djb2, the hash the inform spread uses, under a salt per question so
// ring and line are independent draws.
function band(salt: string): number {
  var h = 5381;
  var s = salt + key;
  for (var i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h % 100;
}

if (!device.hasTag("ring:canary") && !device.hasTag("ring:early") && !device.hasTag("ring:general")) {
  // A product under an open advisory puts half its cohort on the canary
  // ring, so the first remediation wave reaches enough of it to be worth
  // watching. In production this is the NOC pushing ring:canary onto the
  // affected serials when the advisory lands.
  var canaryShare = device.model === "FAST5280" ? 50 : 5;
  var r = band("ring:");
  var ring = r < canaryShare ? "canary" : r < canaryShare + 25 ? "early" : "general";
  device.addTag("ring:" + ring);
}

if (!device.hasTag("sla:business") && !device.hasTag("sla:residential")) {
  device.addTag(band("sla:") < 8 ? "sla:business" : "sla:residential");
}
