// Herder operator-script SDK reference.
//
// This file is the contract every .ts script in herder-public-configs and
// operator forks types against. Maintained alongside the runtime evaluator;
// drift is caught by the upload-time type-check. A copy ships in
// herder-public-configs as types/sdk.d.ts and must stay byte-identical.
//
// One unified surface for both subsystems:
//   - Telemetry enrichment scripts (`emit`, `topology.*`, `enrichment`,
//     `batch`, `ctx`).
//   - Provisioning scripts (`device.{get,set,fetch,...}`, `provision.*`).
//
// Optional fields (`get?`, `addTag?`, etc.) split which globals each
// subsystem exposes at runtime — calling `device.get(...)` from an
// enrichment script type-checks (it's optional) but throws at runtime.
// Per-source-type stricter declarations are a follow-up if the unified
// surface confuses operators.

declare global {
  // ───────────────────────────────────────────────────────────────────
  // Common: capped logger (both subsystems)
  // ───────────────────────────────────────────────────────────────────

  /**
   * Capture a diagnostic line. Capped at sandbox.maxLogEntries per script
   * execution (default 100); excess calls are silently dropped.
   */
  function log(level: "debug" | "info" | "warn" | "error", message: string): void;

  // ───────────────────────────────────────────────────────────────────
  // Common: device metadata
  // ───────────────────────────────────────────────────────────────────

  /** Device-scoped metadata + (provisioning-only) mutation helpers. */
  const device: DeviceGlobal;

  interface DeviceGlobal {
    /** Device UUID. */
    readonly id: string;
    /** OUI extracted from serial / MAC, e.g. "001E58". */
    readonly oui: string;
    readonly serialNumber?: string;
    readonly manufacturer?: string;
    readonly model?: string;
    readonly firmware?: string;
    readonly tags: ReadonlyArray<string>;

    // ── Provisioning-only methods ─────────────────────────────────
    // These are injected into provisioning script VMs. Enrichment
    // scripts run in a VM that does NOT inject them — calling these
    // from an enrichment context throws a runtime ReferenceError. The
    // type-check declares them as required for provisioning ergonomics
    // (operator scripts shouldn't have to non-null-assert every call);
    // operators wiring enrichment scripts that reach for `device.set`
    // hit a runtime error, by design.

    /**
     * Three-tier overlay-aware lookup (raw cache → canonical resolver).
     * A search path filters instances the session already knows:
     * `get('Device.WiFi.SSID.[SSID=="guest"].Enable')` returns the
     * matched instance's leaf, and without a leaf the matched
     * instance's concrete path. Lowest instance wins; no match is null.
     *
     * A wildcard returns an object, empty when nothing matched, which
     * is truthy: check its keys, not the object. A canonical wildcard
     * keys on the captured index (`{"1": "HomeWiFi"}`), a raw one on
     * the full parameter path, the same shape `fetch` gives for the
     * same pattern.
     *
     * With `{ maxAge }`, a value this session's Inform carried (or an
     * earlier `fetch` in this evaluation) is returned from cache, and
     * anything else becomes a `fetch`: null now, the live value on the
     * replay pass. Freshness resolves per session, not per second, so
     * the number is not compared against anything yet and a larger
     * maxAge does not avoid the round trip. Not supported on wildcard
     * or search paths.
     */
    get(path: string, options?: { maxAge: number }): string | number | null | undefined;

    /**
     * `get` parsed as a number, null when the path is unknown or the
     * value is not numeric. Every parameter crosses the wire as a
     * string, so this is the read that saves a hand-rolled parseInt and
     * its null check at every numeric comparison.
     */
    getNumber(path: string, options?: { maxAge: number }): number | null;

    /**
     * `get` parsed as a boolean, null when the path is unknown or the
     * value is not one of TR-069's encodings. "0", "1", "true" and
     * "false" all answer, using the same vocabulary the converge layer
     * compares with, so a script and the diff cannot disagree about
     * what the device meant.
     */
    getBool(path: string, options?: { maxAge: number }): boolean | null;

    /**
     * Stage a desired-state SPV. Poisons the cache at `path` so subsequent
     * `device.get(path)` returns null until the CPE confirms.
     *
     * Numbers render as an operator would write them: an integral value
     * is an integer string whatever arithmetic produced it, and nothing
     * reaches the CPE in exponent notation.
     */
    set(path: string, value: string | number | boolean): void;

    /**
     * Register a path for live retrieval; returns null on first run,
     * the cached value on replay. Search paths read live: the
     * expression keys fetch as wildcards from the CPE and the filter
     * applies on replay, so
     * `fetch('Device.NAT.PortMapping.[ExternalPort==8080].InternalClient')`
     * answers from current device state.
     */
    fetch(path: string): string | number | null | undefined;

    /**
     * Declare that an instance matching the search expression must
     * exist with the given parameters, e.g.
     * `device.ensureObject('Device.WiFi.SSID.[SSID=="guest"]', { Enable: true })`.
     * The expression takes `==` terms joined by `&&`; its terms seed
     * the new instance when nothing matches, so identity is written
     * once. Matching instances get the params applied; a missing
     * instance is created (TR-069 AddObject / USP Add). The table path
     * may be device-native or a canonical object entry from the
     * device's mapping profile; match and param keys are always leaf
     * names relative to the instance.
     */
    ensureObject(searchPath: string, params?: Record<string, string | number | boolean>): void;

    /**
     * Declare that every instance matching the search expression, or
     * the one concrete instance path, must not exist. Removing what is
     * already absent is a no-op.
     */
    removeObject(path: string): void;

    /**
     * Ask the CPE to reboot, after everything else this evaluation
     * stages. Service-interrupting, and the script re-runs on every
     * replay pass and again on every session, so the action is keyed on
     * its cause: `reason` names why the reboot is wanted, two causes are
     * two reboots, and one cause already carried out is not carried out
     * again for a day. Omitting it defaults to the rule name, which
     * bounds a script that forgets to a single reboot per rule per day
     * rather than one per session.
     *
     * On TR-069 the reason travels as the Reboot CommandKey, so the
     * CPE names it back in the following Inform.
     */
    reboot(options?: { reason?: string }): void;

    /** Factory reset, keyed on its cause exactly as `reboot` is. */
    factoryReset(options?: { reason?: string }): void;

    /**
     * Move the device to a firmware release. Names a version, never a
     * URL: which image this CPE needs is a question about this CPE, and
     * the firmware catalog answers it the same way it does for a
     * campaign, including the signed URL, the size and the checksum.
     *
     * A device already on the target release, or one no image in the
     * release applies to, is skipped rather than failed. `force` asks
     * for the transfer anyway. The cause defaults to the version, so
     * two rules asking for the same release produce one upgrade.
     */
    upgradeFirmware(
      version: string,
      options?: { reason?: string; delaySeconds?: number; force?: boolean },
    ): void;

    // ── Tag methods (both subsystems) ─────────────────────────────
    // Provisioning applies mutations after the rule run. Enrichment
    // (#714) stages them during the run and applies them only after
    // the run's telemetry rows are written; a failed script drops its
    // staged tags with its rows. hasTag is read-your-writes within a
    // run in both subsystems.

    hasTag(tag: string): boolean;
    addTag(tag: string): void;
    removeTag(tag: string): void;

    inGroup(path: string): boolean;
    listGroups(): string[];
    addToGroup(path: string): void;
    removeFromGroup(path: string): void;
  }

  // ───────────────────────────────────────────────────────────────────
  // Enrichment: telemetry batch + per-rule operator config
  // ───────────────────────────────────────────────────────────────────

  /**
   * Telemetry batch globals — only populated for enrichment-script
   * executions. Provisioning scripts see this as undefined behaviour
   * (the global isn't injected); call sites that misuse it are caught
   * by the type-check when paired with the SDK contract.
   */
  const batch: BatchGlobal;

  interface BatchGlobal {
    /** Flat path → string-value map of every Inform parameter in this batch. */
    readonly params: Readonly<Record<string, string>>;

    /**
     * Wildcard expansion. Returns one entry per matched index, with
     * `$indexes` carrying the value of each `*` segment by name.
     *
     * Example: `batch.matches("Device.WiFi.AccessPoint.*.SSID")` yields
     * `{ $indexes: { AccessPoint: "1" }, SSID: "MyNet" }` per match.
     */
    matches(pattern: string): ReadonlyArray<MatchedEntry>;
  }

  /** A single result from `batch.matches`. */
  interface MatchedEntry {
    /** Per-`*`-segment indexes keyed by the segment name. */
    readonly $indexes: Readonly<Record<string, string>>;
    /** Sibling fields at the matched path. */
    readonly [key: string]: string | Readonly<Record<string, string>>;
  }

  /** Per-invocation context — operator-supplied config + helpers. */
  const ctx: CtxGlobal;

  interface CtxGlobal {
    /**
     * Operator-supplied per-rule parameters from the YAML's `config`
     * block. `null` when the rule omits a config block.
     */
    readonly config: Readonly<Record<string, unknown>> | null;

    /**
     * Read a config key with a default fallback. Emits an enrichment
     * warning on missing keys so typos surface in the editor preview.
     */
    configGet<T>(key: string, defaultValue: T): T;
  }

  // ───────────────────────────────────────────────────────────────────
  // Enrichment: emit a labeled-telemetry row
  // ───────────────────────────────────────────────────────────────────

  /**
   * Write one labeled-telemetry row. Three positional arguments:
   *   - `metric`: the row's metric name (`"wifi.client.rssi"`, etc).
   *   - `value`:  numeric for metrics, or `null` for presence rows.
   *   - `labels`: identity + property labels. Required (pass `{}` for
   *     unlabeled rows). Capped per emit by sandbox guardrails.
   *
   * The topology emit SDK below provides graph-specific helpers that
   * canonicalize MACs and stamp snapshot metadata; prefer those for
   * topology rows.
   */
  function emit(
    metric: string,
    value: number | string | null,
    labels: EmitLabels,
  ): void;

  /** Labels for `emit()`. Values may be `null` (omitted). */
  type EmitLabels = Record<string, string | number | boolean | null | undefined>;

  // ───────────────────────────────────────────────────────────────────
  // Enrichment: topology emit SDK (#490)
  // ───────────────────────────────────────────────────────────────────

  /**
   * Topology graph emit. Each call writes a labeled-telemetry row under
   * the `topology.*` namespace. The runtime stamps `snapshot_id` on
   * every emitted row so vanished entities don't ghost the API output.
   */
  const topology: TopologyGlobal;

  interface TopologyGlobal {
    /** Emit a node (gateway / extender / client). MAC fields canonicalize. */
    addNode(node: TopologyNode): void;

    /** Emit an edge between two nodes. parent/child must reference emitted nodes. */
    addEdge(edge: TopologyEdge): void;

    /**
     * Emit a numeric metric for one edge. `name` is appended to the
     * `topology.edge.` prefix (e.g. "rssi_dbm" → metric
     * "topology.edge.rssi_dbm").
     */
    addEdgeMetric(name: string, value: number, edge: { parent: string; child: string }): void;
  }

  /** A single node in the topology graph. Free-form properties allowed. */
  interface TopologyNode {
    /** Canonical MAC, lowercase colon-separated. */
    id: string;
    type: "gateway" | "extender" | "client" | "ssid" | "interface";
    /** Bind to a managed-device UUID when the node is itself a managed CPE. */
    managed_device_id?: string;

    hostname?: string;
    ipv4?: string;
    ipv6?: string;
    manufacturer?: string;
    model?: string;
    firmware?: string;
    serial?: string;
    /** Extender mesh-sync state; absent on gateway/client. */
    synced?: boolean;

    /** Vendor-extension scripts attach extra string properties here. */
    [property: string]: unknown;
  }

  /** A single edge in the topology graph. */
  interface TopologyEdge {
    /** Canonical MAC of the upstream node. */
    parent: string;
    /** Canonical MAC of the downstream node. */
    child: string;
    edge_type:
      | "wifi_2g"
      | "wifi_5g"
      | "wifi_6g"
      | "wifi_backhaul"
      | "ethernet"
      | "moca"
      | "other";
    /** BSSID the edge transits (per-radio identification). */
    bssid?: string;
  }

  // ───────────────────────────────────────────────────────────────────
  // Enrichment: experience score emit SDK (#714)
  // ───────────────────────────────────────────────────────────────────

  /**
   * Experience score emit. Each call writes one `experience.score`
   * labeled-telemetry row, value clamped to [0, 100].
   *
   * The hierarchy is two levels, expressed in labels:
   *   - `score.set("wifi", 74)` — the wifi dimension's score.
   *   - `score.set("wifi", 22, { component: "client_rssi" })` — a
   *     component score under wifi.
   *   - `score.set("overall", 41)` — the composite headline.
   *
   * Scripts own all aggregation (components → dimension → overall) with
   * weights from the rule's `config` block; read surfaces never derive
   * scores. Extra labels are bounded evidence (`worst_client_mac`,
   * `interface`, ...) — keep them low-cardinality.
   */
  const score: ScoreGlobal;

  interface ScoreGlobal {
    /**
     * Write one score row. `dimension` and `labels.component` must be
     * lowercase `[a-z0-9_]`, max 64 chars. Out-of-range values clamp
     * with an enrichment warning.
     */
    set(dimension: string, value: number, labels?: ScoreLabels): void;
  }

  /** Labels for `score.set()`. `dimension` is forbidden (it is the first argument). */
  type ScoreLabels = Record<string, string | number | boolean | null | undefined> & {
    component?: string;
  };

  // ───────────────────────────────────────────────────────────────────
  // Enrichment: warnings / control flow
  // ───────────────────────────────────────────────────────────────────

  const enrichment: EnrichmentGlobal;

  interface EnrichmentGlobal {
    /** Surface a warning to the operator preview / debug surface. */
    warn(message: string): void;
  }

  // ───────────────────────────────────────────────────────────────────
  // Provisioning: provision SDK
  // ───────────────────────────────────────────────────────────────────

  /** Provisioning-only globals — undefined for enrichment scripts. */
  const provision: ProvisionGlobal;

  interface ProvisionGlobal {
    log(message: string): void;
    warn(message: string): void;
    /** Skip the rule, clearing every desired/tag/group mutation it staged. */
    skip(reason: string): void;
    /**
     * Run a helper script from the same bundle, or a registered Go
     * extension (prefix `ext:`). A script target resolves beside the
     * calling script first and from the source root second, the same
     * order a rule's `script:` reference resolves in, so
     * `provision.run("lib/mgmt.ts", { informInterval: 900 })` finds the
     * helper sitting next to its caller.
     *
     * The helper runs against the same device context: what it sets,
     * tags or groups is staged on the caller's behalf. It returns its
     * last expression, which for the standard IIFE body is whatever the
     * function returns. Arguments arrive as `provision.args`. Both
     * directions cross as JSON, so functions and cyclic objects do not
     * survive; a value that cannot make the trip arrives as `null` and
     * the evaluation records a warning naming it.
     */
    run(target: string, ...args: unknown[]): unknown;

    /**
     * What the caller passed to `provision.run`, empty for a rule's own
     * script. Cast each element to the shape the helper expects:
     * `const opts = provision.args[0] as { informInterval: number };`
     */
    readonly args: ReadonlyArray<unknown>;
    readonly rule: { readonly name: string; readonly priority: number };
    /** Operator-supplied template payloads, keyed by template name. */
    readonly templates: Readonly<Record<string, unknown>>;
  }

  // ───────────────────────────────────────────────────────────────────
  // Actions: normalizer SDK
  // ───────────────────────────────────────────────────────────────────

  /**
   * Action-normalizer-only globals — undefined for every other script
   * surface.
   *
   * A normalizer is pure: it receives the parameters the engine already
   * collected from the device and returns the capability's result shape.
   * There is deliberately no way to read or write the device from here.
   * Orchestration is declarative in the profile's steps precisely so
   * this sandbox never needs blocking I/O.
   */
  const action: ActionGlobal;

  interface ActionGlobal {
    /** The capability that was requested, e.g. "speedtest". */
    readonly capability: string;
    /** The ActionProfile that ran, i.e. which implementation this is. */
    readonly profile: string;
    /** This run's id — the ref tag profiles stitch into test URLs. */
    readonly runId: string;
    /**
     * Every parameter named by a step's `collect`, keyed by the raw path
     * the device reported. Missing values are absent rather than empty,
     * so check before converting.
     */
    readonly params: Readonly<Record<string, string>>;
    /**
     * The caller's per-run inputs, validated against the profile's
     * declaration with defaults applied. The host a ping was aimed at
     * belongs in its result. Always present; an input the profile does
     * not declare is never here.
     */
    readonly inputs: Readonly<Record<string, string>>;
  }

  /**
   * Emit the normalized result. Call once. Returning an object from the
   * script works too, for a normalizer short enough to be one
   * expression.
   */
  function result(value: unknown): void;
}

// `export {}` is required so this file is treated as a module — without
// it, the `declare global` block is interpreted as a script and the
// declarations leak into every other file that doesn't have a clean
// scope.
export {};
