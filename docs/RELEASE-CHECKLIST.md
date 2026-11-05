# Maintainer release checklist

This checklist is for a future production-ready release. No production-ready release exists yet; the existing draft catalog pin remains blocked. Do not publish while any **Blocking** item is open.

## Blocking (upstream)

- [ ] Hermes PR #146959 (`host.composer.annotations`) is merged. Status at last check: open, unmerged.
- [ ] A stable Hermes release ships the API. The latest stable release at last check, v0.23.0, does not.
- [ ] Set `requires_hermes` in `plugin.yaml` to the first stable release that ships the API. Until then, `>=0.22.5` is only a development baseline.
- [ ] Re-run all checks below against that stable release, not only a patched dev build.

## Plugin checks (on the exact commit to release)

- [ ] `npm --prefix tests ci && npm --prefix tests test`: all tests pass (33 at the time of writing).
- [ ] `hermes plugins validate .` passes: manifest, security scan, desktop SDK surface, no core override.
- [ ] `tests/native.mjs` passes against a disposable Hermes home.
- [ ] Fresh-profile fixture: install with `--ref <full sha>`, then use the visible Desktop switch to enable, disable, and re-enable the plugin. Confirm add, edit, and remove keep ordinary text and whitespace exact, and that a saved draft survives an app restart and a backend restart with a successful `session.resume`.
- [ ] Stock Hermes without the API shows the compatibility notice and changes nothing.
- [ ] Light and dark screenshots are refreshed from synthetic fixtures only.
- [ ] Official Hermes updater verification in a fully isolated environment (separate HOME, package manager, venv, shims, and fleet): confirm the plugin survives an official update path. **Blocking release check** — do not release while unverified.

## Metadata and catalog

- [ ] Supported platforms in catalog metadata match the evidence. Runtime evidence today is macOS only; do not list Windows or Linux as tested until they are.
- [ ] The catalog entry body describes the released behavior and current test count. Any older text (for example, a ten-test or artwork-only description) must be updated.
- [ ] Catalog PR #146960 is pinned to the full 40-character SHA of the release commit only after the upstream items above are complete.

## Privacy and authorship

- [ ] Commits use `LarryLemonBot <LarryLemonBot@users.noreply.github.com>`.
- [ ] Screenshots, fixtures, and docs contain no personal chats, paths, tokens, or account data.
- [ ] Local evidence (logs, sandboxes, videos) stays outside Git.

## Not yet verified

- Windows, Linux, screen readers, and touch input.
