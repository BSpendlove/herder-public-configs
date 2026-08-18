// Connection request credentials, derived from the device's identity.
//
// Called by every CWMP seed rule with provision.run, so the derivation
// lives in one place. Two properties matter and both come from deriving
// rather than generating: the same CPE gets the same credential on
// every pass, so provisioning converges instead of rewriting the pair
// every session, and each CPE gets a different one, so a credential
// read off one gateway does not open the rest of the fleet.

(function () {
  const cr = device.oui + "-" + (device.serialNumber || "");
  device.set("canonical.mgmt.connection_request_username", cr);
  device.set("canonical.mgmt.connection_request_password", cr);
  return cr;
})();
