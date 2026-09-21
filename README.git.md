# Git Workflow

## Repository layout

| Name | Purpose |
| --- | --- |
| `origin` | Private repository; push your work here |
| `upstream` | Fedora's `rpms/gnome-shell` packaging repository |
| `develop` | Working branch, tracking `origin/develop` |
| `upstream/f44` | Fedora 44 updates to review and merge |

## Everyday work

Start with a clean working tree and update from the private repository:

```bash
git switch develop
git pull --ff-only
```

Make your changes, then review and commit the relevant files:

```bash
git diff
git add <paths>
git diff --cached
git commit -m "Describe the change"
make
git push origin develop
```

Replace `<paths>` with the files you changed. Build and test before pushing.
Keep generated archives and RPMs in the ignored `build/` directory. Commit
before building RPMs you intend to keep: release numbers and changelog entries
derive from Git history. See [build instructions](README.build.md).

## Fedora updates

Start with a clean working tree. Update `develop`, fetch Fedora changes, and
review them before merging on a temporary branch:

```bash
git switch develop
git pull --ff-only
git fetch upstream
git log --oneline HEAD..upstream/f44
git diff HEAD...upstream/f44 -- gnome-shell.spec sources
git switch -c update/f44
git merge upstream/f44
```

Use a fresh update branch name if `update/f44` already exists. If there are
conflicts, edit the affected files, stage them, and run `git merge --continue`.
Retain the launcher archive, custom patches, and theme rebuild steps in the
spec. Keep source checksums aligned with the package version.

Run `make`, then test the RPMs on Fedora 44: desktop login, launcher shortcuts,
searches and prefixes, arrow keys, Enter, Escape, and outside-click dismissal.
Once verified:

```bash
git switch develop
git merge --ff-only update/f44
git push origin develop
```

Normal pulls update from your private repository. Fedora updates are fetched
and merged explicitly; no push to Fedora is needed. Moving to a new Fedora
release also requires updating the container, build target, and patches.

## After a fresh clone

Cloning the private repository sets up `origin`. Add the Fedora remote once
and make the private repository the default push destination:

```bash
git remote add upstream https://src.fedoraproject.org/rpms/gnome-shell.git
git config remote.pushDefault origin
git switch develop
```
