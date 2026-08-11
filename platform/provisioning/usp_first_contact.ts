// Seed: USP first contact.
//
// Radios up is the smallest piece of real intent an ACS can assert on a
// TR-369 agent, and it exercises the whole path: the rule matches on
// protocol, the canonical names resolve through the device's mapping
// profile to `Device.WiFi.Radio.*`, the engine emits a Set, the USP
// dispatcher turns it into a USP message over MQTT, and the applied
// ledger converges so the second contact writes nothing.
//
// No `canonical.mgmt.*` here. Those resolve to `Device.ManagementServer`,
// which a USP agent does not implement (obuspa answers err 7026, "Path
// does not exist in the schema"), which is why the mapping profile that
// carries them is scoped to CWMP.

device.set("canonical.wifi.radio.1.enable", true);
device.set("canonical.wifi.radio.2.enable", true);

device.addTag("discovered");
device.removeTag("undiscovered");

provision.log("usp first contact complete for " + (device.serialNumber || "(unknown)"));
