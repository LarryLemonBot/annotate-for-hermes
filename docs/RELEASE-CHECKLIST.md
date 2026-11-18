# Maintainer release checklist

This checklist is for a production-ready release. Plain-text mode no longer depends on the upstream annotation API, so the upstream items below block only native chips. Do not label the plugin production-ready while any **Blocking** item is open.

## Plain-text mode on stock Hermes (catalog listing path)

- [x] Works without #146959: plain-text mode uses only the browser selection and `host.composer` draft verbs. Checked on stock v0.23.2 on November 18, 2026 (see [behavior and testing](BEHAVIOR-AND-TESTING.md)).
- [x] `requires_hermes` set to `>=0.23.2`, the stock release it was tested on.
- [ ] Stock macOS check (packaged or dev build) with a fresh profile; Linux dev-renderer evidence exists, macOS stock evidence does not yet.

## Native chips (upstream, not blocking plain-text listing)

- [ ] Hermes PR #146959 (`host.composer.annotations`) is merged. Status at last check (November 18, 2026): open, unmerged, no maintainer review.
- [ ] A stable Hermes release ships the API. The latest stable release at last check, v0.23.2, does not.
- [ ] Re-pin if the final API differs from the patch, then re-run the native checks below against that stable release.

## Plugin checks (on the exact commit to release)

- [ ] `npm --prefix tests ci && npm --prefix tests test`: all tests pass (74 in the current candidate).
- [ ] Focused native tests pass against the final patch (229 distinct tests in 14 files in the current candidate), followed by a fresh build and packaged-runtime check. The current patched macOS checks passed with an existing-profile plugin overlay; repeat on the exact stable release candidate.
- [ ] `hermes plugins validate .` passes: manifest, security scan, desktop SDK surface, no core override.
- [ ] `tests/native.mjs` passes against a disposable Hermes home.
- [ ] Fresh-profile fixture: install with `--ref <full sha>`, then use the visible Desktop switch to enable, disable, and re-enable the plugin. Confirm add, edit, and remove keep ordinary text and whitespace exact, and that a saved draft survives an app restart and a backend restart with a successful `session.resume`.
- [x] Stock Hermes without the API runs plain-text mode (`tests/stock.mjs`, v0.23.2).
- [ ] Light and dark screenshots are refreshed from synthetic fixtures only.
- [ ] Official Hermes updater verification in a fully isolated environment (disposable Hermes data root, isolated package manager and runtime state): confirm the plugin survives an official update path. **Blocking release check** — do not release while unverified.

## Metadata and catalog

- [ ] Supported platforms in catalog metadata match the evidence. Runtime evidence today is macOS only; do not list Windows or Linux as tested until they are.
- [ ] The catalog entry body describes the released behavior and current test count. Any older text (for example, a ten-test or artwork-only description) must be updated.
- [ ] Catalog PR #146960 is pinned to the full 40-character SHA of the release commit.

## Privacy and authorship

- [ ] Commits use `LarryLemonBot <LarryLemonBot@users.noreply.github.com>`.
- [ ] Screenshots, fixtures, and docs contain no personal chats, paths, tokens, or account data.
- [ ] Local evidence (logs, sandboxes, videos) stays outside Git.

## Not yet verified

- Windows, Linux, screen readers, and touch input.
