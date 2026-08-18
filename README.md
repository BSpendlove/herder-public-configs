# herder-public-configs

The default configuration Herder ships with: mapping profiles, telemetry
profiles, provisioning rules, identity enrichment, topology scripts and
dashboards.

Every Herder deployment already has this. The configservice image bakes a
copy to `/etc/herder/configs` and points its default config source at it, so
a fresh install renders dashboards and provisions devices without cloning
anything. This repo is where that content is maintained, and what you fork
if you want to change it.

## Layout

Files are grouped by what they describe, not by kind. A single file usually
holds several documents, because the things that belong to one data model
are easier to read together than scattered across four directories.

```
baseline/            Vendor-neutral defaults, keyed by data model
├── tr098/           TR-098 (InternetGatewayDevice.*) mappings, telemetry, dashboards
├── tr181/           TR-181 (Device.*) mappings and telemetry
├── usp/             USP-specific telemetry (subscription-driven, not polled)
├── identity.yaml    Identity enrichment for CWMP and USP
└── client-wifi-labels.yaml + generic-client-rssi-labels.ts

platform/            Behaviour that is not tied to a vendor or data model
├── provisioning/    boot, first_contact and periodic rules with their scripts
└── topology/        EasyMesh and TR-098 topology enrichment, plus a dashboard

vendors/             Overrides for specific hardware
├── arris/           ARRIS NVG578LX: X_0000C5_* extensions, HNC topology
├── cpe-sim/         cpe-labs simulator profiles
└── dev-sim/         genieacs-sim profile
```

Scripts are TypeScript. The config walker only accepts `.ts`, and each one
is transpiled and type-checked at upload against the SDK declarations, so a
typo in a global fails when you push it rather than at 3am on a live fleet.

## What is in here

| Kind | Count | What it does |
|------|-------|--------------|
| `TelemetryProfile` | 14 | Which parameters to collect, and how often |
| `MappingTable` | 7 | Canonical name to raw CPE path |
| `MappingProfile` | 7 | Which mapping tables apply to which devices |
| `EnrichmentRule` | 5 | Per-row telemetry labelling and topology emit |
| `Dashboard` | 4 | Panel layouts over the telemetry and device data |
| `ProvisioningRule` | 3 | What to do on boot, first contact and periodically |
| `IdentityProfile` | 2 | Populating manufacturer, model and firmware |

## Using it

Nothing to do for the defaults. They are already loaded.

To run your own, add a config source pointing at your fork. Every domain
walks the whole repository, because since Config Format v2 a document's kind
comes from its own `apiVersion`/`kind` envelope rather than from where it
sits on disk. Organise your fork however reads best; the path hints in a
source only exist to scope the walk if the repository is large.

Layering is by priority, and the direction is not the same for every kind.
Mapping, telemetry and identity profiles resolve highest-first, which is why
the baselines here sit at 10 and the vendor profiles at 50 or 100. Enrichment
rules resolve lowest-first, which is why `generic-client-wifi` sits at 200 so
a narrower vendor rule at 100 beats it. Check the guide for the kind you are
writing rather than assuming, and copy the priority of the nearest existing
file.

Adding hardware support usually means one new file under `vendors/`, not
editing anything in `baseline/`.

## Selectors

Every profile, rule and dashboard carries a `deviceSelector` deciding which
devices it applies to. Selectors match labels Herder derives per device at
evaluation time (the full model is in the
[Device Selectors guide](https://docs.herder.ispx.co/guides/device-selectors/)):

| Key | Source | Example |
|-----|--------|---------|
| `oui` | `devices.oui`, always present | `oui: "0000C5"` |
| `manufacturer` | Identity enrichment | `manufacturer: "ARRIS"` |
| `model` | Identity enrichment | `model: "NVG578LX"` |
| `productClass` | CWMP DeviceID envelope, or identity enrichment | `productClass: "NVG578LX"` |
| `firmwareVersion` | Identity enrichment | `firmwareVersion: "9.3.0h0d70"` |
| `tag:<value>` | `devices.tags`, one label per tag, empty value | `{key: "tag:vip", operator: Exists}` |
| `dataModel:<id>` | Path-prefix detection during telemetry | `dataModel:igd` for TR-098, `dataModel:device` for TR-181 |
| `protocol:<value>` | `devices.protocols` | `protocol:cwmp`, `protocol:usp` |

`matchLabels` is exact-match and ANDs across keys. `matchExpressions`
supports `In`, `NotIn`, `Exists`, `DoesNotExist` and `SemverRange`, and also
ANDs. The `tag:`, `dataModel:` and `protocol:` families encode their value
in the key and carry an empty string, so they are matched with `Exists`
rather than by value.

There is no OR. For alternatives on the same key use `In`; for genuinely
different targets, ship two profiles.

Pick `dataModel:` over `protocol:` unless the wire protocol is what actually
matters. TR-181 runs under both CWMP and USP, so `dataModel:device` matches
either, which is normally what you want. Reach for `protocol:` when the
behaviour is protocol-bound, such as a rule issuing CWMP session RPCs that
would be meaningless against a USP agent.

## Editing

YAML gets completion and inline validation from the published JSON
Schemas. The `.vscode/settings.json` in this repo turns it on for VS
Code with the YAML extension; any editor speaking yaml-language-server
takes the same one-line association:

```json
{
  "yaml.schemas": {
    "https://docs.herder.ispx.co/schemas/resource.schema.json": ["**/*.yaml"]
  }
}
```

Scripts type against `types/sdk.d.ts`, the same SDK contract the
upload-time type-check enforces. Herder checks each script as its own
program, so the equivalent local check is per file:

```bash
npx tsc --noEmit --target ES2017 --lib es2017 --strict <script>.ts types/sdk.d.ts
```

A repo-wide tsconfig would put every script in one shared global scope,
which is not how they run, and it reports false name collisions between
unrelated scripts. Check per file.

## Contributing

Vendor support is the most useful thing to add: a `vendors/<name>/` file with
a selector narrow enough not to capture anyone else's hardware. Model it on
`vendors/arris/`, which covers the parameter mappings, the vendor telemetry
extensions and a topology script.

Two rules worth knowing before opening a PR. Baseline files must stay
vendor-neutral, since they match every device with the matching data model.
And paths use `{i}` for instance wildcards, not `*` or a literal index.

Guides for each content type live at
[docs.herder.ispx.co](https://docs.herder.ispx.co/), including
[Vendor Onboarding](https://docs.herder.ispx.co/guides/vendor-onboarding/),
the end-to-end path from an unknown CPE to a working `vendors/` directory,
plus [Device Selectors](https://docs.herder.ispx.co/guides/device-selectors/),
[Mapping Profiles](https://docs.herder.ispx.co/guides/mapping-profiles/),
[Telemetry Profiles](https://docs.herder.ispx.co/guides/telemetry-profiles/),
[Provisioning Rules](https://docs.herder.ispx.co/guides/provisioning-rules/)
and the [Script SDK](https://docs.herder.ispx.co/guides/script-sdk/).
