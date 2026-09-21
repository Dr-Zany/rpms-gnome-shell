# GNOME Shell Launcher

Personal GNOME Shell customization packaged as Fedora 44 RPMs, preserving
Fedora's packaging history. The package version is in `gnome-shell.spec`.

## Behavior

- Login opens the desktop directly.
- Super, Super+A, and Show Apps open the launcher.
- The launcher sits near the top of the active screen and grows downward.
- Plain text searches enabled providers; `. firefox` searches apps only and
  `$ display` searches Settings when its search provider is enabled.
- Up/Down select results, Enter launches the selection, and Escape closes it.
- The entry displays "Launch". Overview and workspace gestures remain available.

## Development

See [build instructions](README.build.md) for container builds and patch
preparation, and [Git workflow](README.git.md) for private hosting and updates.

| Path | Purpose |
| --- | --- |
| `launcher-source/` | Editable launcher JavaScript and Sass |
| `0002-shell-replace-applications-entry-points-with-launcher.patch` | Launcher integration into Shell |
| `0003-shell-start-session-on-desktop.patch` | Direct desktop login |
| `gnome-shell.spec` | Dependencies, patches, and RPM build steps |
| `sources` | Fedora source archive checksums |
| `.devcontainer/` | Fedora build environment |
| `build/` | Ignored source trees, archives, and RPM artifacts |

Edit launcher files under `launcher-source/`; files under `build/` are generated.
The launcher source archive is included in source RPMs.

The inherited `.packit.yaml`, `README.packit`, and `rpminspect.yaml` describe
Fedora packaging automation. They do not configure private repository CI or
publish these custom RPMs. The local build entry point is `make`.
