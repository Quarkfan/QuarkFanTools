# QuarkfanTools Platform

This repository is the parent workspace for QuarkfanTools platform modules.

It no longer contains the macOS standalone app source directly. Each major center or product line lives in its own Git repository and is referenced here as a submodule.

## Modules

| Path | Repository | Purpose |
| --- | --- | --- |
| `QuarkfanTools-Single/` | `git@github.com:Quarkfan/QuarkfanTools-Single.git` | Current macOS standalone QuarkfanTools app. It keeps the full historical codebase and all release tags through `v2.2.6`. |
| `Message-Gateway/` | `git@github.com:Quarkfan/Message-Gateway.git` | Message Gateway center: channel access, Message Hub, Message Store, Sink, RouteBinding, Cursor, Delivery, Trace, and Loop Guard design. |

Future centers should be added here as independent repositories and registered in `.gitmodules`.

## Platform Docs

- [Platform reference matrix](docs/platform-reference-matrix.md)
- [Platform centers](docs/platform-centers.md)
- [Cross-center protocols](docs/platform-interface-protocols.md)
- [macOS / Linux portability blueprint](docs/macos-linux-portability.md)

Module-specific docs live inside each submodule. Message Gateway-specific design is in [Message-Gateway/docs/message-gateway.md](Message-Gateway/docs/message-gateway.md).

## Clone

```bash
git clone --recurse-submodules git@github.com:Quarkfan/QuarkFanTools.git
```

For an existing clone:

```bash
git submodule update --init --recursive
```

## Development

Work inside the module repository that owns the change:

- Standalone app code, packaging, release tags, and user-facing app behavior belong in `QuarkfanTools-Single/`.
- Message Gateway contracts and future MG implementation belong in `Message-Gateway/`.
- This parent repository should only track module references, platform-level navigation, and integration status.

When a child module advances, commit and push inside that module first, then update the submodule gitlink in this parent repository.
