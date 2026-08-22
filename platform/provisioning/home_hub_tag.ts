// Which households have the smart-home product, as a tag.
//
// `app:home-hub` says the subscriber bought the hub. It does not say
// the gateway is running it right now: the tag is what the install
// campaign targets and what scopes the Home section on the device
// page, so both hold steady while a gateway is mid-install, swapped or
// waiting for its nightly reinstall.
//
// This rule stands in for the CRM, the same way the cohort tags do. In
// a deployment the tag arrives through the tag API when the contract
// changes, on the households that bought the product and no others.
// The demo has no CRM and every simulated USP gateway is meant to show
// the hub, so the rule tags the fleet it is scoped to.
if (!device.hasTag("app:home-hub")) {
  device.addTag("app:home-hub");
}
