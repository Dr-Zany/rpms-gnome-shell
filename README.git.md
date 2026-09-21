# Private Repository and Fedora Updates

## Recommended setup

Keep the existing history and use two remotes:

| Name | Role |
| --- | --- |
| `origin` | Your private repository; push your custom work here |
| `upstream` | `https://src.fedoraproject.org/rpms/gnome-shell.git` |
| `develop` | Your customized Fedora 44 package, tracking `origin/develop` |
| `upstream/f44` | Fedora 44 packaging updates to review and merge |

Fetching from Fedora only downloads its changes. Merging brings those changes
into your branch; it may require resolving conflicts with your customization.
Pushing to `origin` publishes only to your private repository. No push to Fedora
is needed.

Here, upstream means Fedora's packaging repository. GNOME source archives are
downloaded separately during builds. Preserving history supports future merges
and the spec's `%autorelease` and `%autochangelog` processing.

## Initial setup

Create an empty private repository on your Git host, without an initial README
or license commit. Replace `PRIVATE_REPO_URL` below with its clone URL.

This checkout started detached at `e9bd16b` on Fedora's `f44` history. Create
`develop` from the current checkout to retain that base and your working changes.
The existing local `rawhide` branch targets a newer GNOME release.

After reviewing `git status` and `git remote -v`, run these commands once:

```bash
git switch -c develop
git remote rename origin upstream
git remote add origin PRIVATE_REPO_URL
git config remote.pushDefault origin
```

Review and stage your source, patch, packaging, container, and documentation
changes with `git add <paths>`. Check the staged diff, commit, and push:

```bash
git diff --cached
git commit -m "Add desktop launcher and direct desktop login"
git push -u origin develop
```

Set `develop` as the default branch on your Git host. Generated RPMs and archives
stay in the ignored `build/` directory. Subsequent clones of your private repo
need the Fedora remote added locally:

```bash
git remote add upstream https://src.fedoraproject.org/rpms/gnome-shell.git
git config remote.pushDefault origin
```

## Taking Fedora updates

Start with a clean working tree. Fetch and review Fedora 44 changes, then merge
on a temporary branch (choose a fresh branch name for each update):

```bash
git switch develop
git fetch upstream
git log --oneline HEAD..upstream/f44
git diff HEAD...upstream/f44 -- gnome-shell.spec sources
git switch -c update/f44
git merge upstream/f44
```

Resolve conflicts while retaining the launcher archive, custom patch
declarations, and theme rebuild steps in the spec. Keep Fedora's source
checksums aligned with the package version. Commit after resolving conflicts.

Run `make` to check patch application and build RPMs. Test on a matching Fedora
44 desktop: login, launcher shortcuts, searches and prefixes, Up/Down, Enter,
Escape, and outside-click dismissal. Then merge and push:

```bash
git switch develop
git merge --ff-only update/f44
git push origin develop
```

Merges preserve published history without force pushes. An ordinary `git pull`
on `develop` updates from your private repository; Fedora updates are explicit.
Moving to a new Fedora release is a separate upgrade of the build target,
container, dependencies, and patches.

Commit release changes before producing RPMs you intend to keep: release
numbers and changelog entries derive from Git history.
