// Periodic inform, spread across the fleet rather than in lockstep.
//
// provision.args[0] is { base: number, spread: number }: the shortest
// interval to use, and the width of the window to spread over. Returns
// the interval this CPE was given.
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

(function () {
  const opts = provision.args[0] as { base: number; spread: number };

  const informKey = device.oui + "-" + (device.serialNumber || "");
  let informHash = 5381;
  for (let i = 0; i < informKey.length; i++) {
    informHash = ((informHash * 33) ^ informKey.charCodeAt(i)) >>> 0;
  }
  const informInterval = opts.base + (informHash % opts.spread);

  device.set("canonical.mgmt.periodic_inform_enable", true);
  device.set("canonical.mgmt.periodic_inform_interval", informInterval);
  return informInterval;
})();
