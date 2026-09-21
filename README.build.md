# Building GNOME Shell for Fedora 44

See [README.md](README.md) for project behavior and [README.git.md](README.git.md)
for private hosting and Fedora updates.

## Development container

Open this checkout in VS Code and select **Dev Containers: Reopen in Container**.
Run `make` in its terminal. Keep Git history available for rpmautospec.

## Podman build

Use rootless Podman to build RPMs in Fedora 44, including when the host runs a
different Fedora release. Install Podman on the host if needed:

```bash
sudo dnf install podman
```

From this repository, build the image containing the packaging tools and the
spec's build dependencies:

```bash
podman build -t localhost/gnome-shell-build:f44 -f .devcontainer/Dockerfile .
```

Build the RPMs from the current checkout:

```bash
podman run --rm --userns=keep-id:uid=1000,gid=1000 \
  -v "$PWD:/workspace:Z" \
  localhost/gnome-shell-build:f44
```

The container runs `make`, which prepares `build/`, packages `launcher-source/`
as `build/SOURCES/launcher-source.tar.xz`, downloads and verifies upstream
sources, resolves `%autorelease` and `%autochangelog` from Git history, and
builds source and binary RPMs. The checkout must include its `.git` directory.
Source downloads explicitly use Fedora's `rpms/gnome-shell` package name, so
your private repository can have a different name.

Build files remain under `build/`; all RPMs are written to `build/artifacts/`,
owned by your host user. Fedora's SELinux volume label is handled by `:Z`.

Rebuild the image after changing `BuildRequires` in the spec. Patch and source
changes are read directly from the checkout on each run. Build dependencies stay
inside the image; you do not need `dnf builddep` on the host.

For an interactive build shell:

```bash
podman run --rm -it --userns=keep-id:uid=1000,gid=1000 \
  -v "$PWD:/workspace:Z" \
  localhost/gnome-shell-build:f44 bash
```

These RPMs target Fedora 44. Test them in a Fedora 44 desktop environment with
the matching Mutter and GNOME dependencies.

## Launcher sources

Edit `launcher-source/js/ui/launcher.js` and
`launcher-source/data/theme/gnome-shell-sass/widgets/_launcher.scss` directly.
The `0002-shell-replace-applications-entry-points-with-launcher.patch` patch
registers these files and connects the launcher to Shell entry points. The spec
extracts the additional sources during `%prep`.

The launcher opens near the top of the active screen and grows downward.
Escape dismisses it. Type normally to search all enabled providers, use
`. firefox` to search applications only, or `$ display` to search Settings.
Settings results require the GNOME Settings search provider to be enabled.

Inside the development container (or a Fedora 44 host with the build dependencies
installed), run:

```bash
make
```

Available targets:

- `make prepare`: create the build directories.
- `make launcher-source`: regenerate the launcher archive in `build/SOURCES/`.
- `make rpms` (default): prepare sources and build source and binary RPMs in
  `build/artifacts/`.
- `make patch-dir`: run the spec's preparation step in `build/patches/`, applying
  existing patches and overlaying launcher sources without compiling.

The archive is included in source RPMs, so rebuilding a source RPM does not
require this checkout.

## Preparing a new patch

Run `make patch-dir`, then locate and enter the prepared source tree:

```bash
find build/patches -type d -name .git
cd build/patches/<path-to-source-tree>
```

The spec initializes a Git repository and applies existing patches. Record the
remaining preparation changes (including the launcher overlay) as your baseline
before editing:

```bash
git add -A
git -c user.name='Patch Builder' -c user.email='builder@localhost' commit --allow-empty -m 'Prepared source baseline'
# Edit source files, then stage the changes (including any new files).
git add -A
git diff --cached --binary > /workspace/0004-my-change.patch
```

Replace `/workspace` with your checkout path when working on the host. Add the
new patch to `gnome-shell.spec`, then run `make` to build it. For launcher-only
changes, edit `launcher-source/` directly so they are included in its archive.

`make patch-dir` refuses to overwrite an existing `build/patches/`; move that
directory aside before preparing a fresh tree. RPM builds use `build/BUILD/`
and do not modify the patch workspace.
