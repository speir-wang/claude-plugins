# Commits

The commit type sets the plugin version (release-please). Choose it by what changes for someone who installs the plugin:

- `feat`: new behavior → minor
- `fix`: broken behavior now works → patch
- `perf` / `refactor`: same behavior → patch
- `docs`, `test`, `ci`, `build`, `chore`, `style`: nothing they run changes → no release
- Breaking change: `feat!:` plus a `BREAKING CHANGE:` footer → major

Use the plugin name as scope: `fix(todo-commits): ...`. Only files in `plugins/<name>/` count toward its release. Never edit `version` in plugin.json by hand.
