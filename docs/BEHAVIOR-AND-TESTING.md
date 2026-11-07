# Behavior and testing

## Interaction

- Selection toolbar action: **Add to chat**.
- Editor primary action: **Add to reply** for a new annotation; **Save** when editing an existing one. A duplicate selection shows **Already added**.
- A compact rounded bar contains **Add an optional comment…** and an arrow button. The selected quote and keyboard instructions remain available to assistive technology.
- Numbered passage markers track live selections. Hover or focus an attachment or marker to preview; moving into the preview keeps its edit/delete controls available. Passive previews do not move keyboard focus.
- The interface follows Hermes typography, selected elevated-surface color, and accent.
- **Dictate comment** records through Hermes using its configured speech-to-text provider. Press the microphone again to stop and transcribe; review the text before staging it. Escape cancels the recording while keeping typed text. Closing the editor or switching chats cancels capture. The microphone is disabled on builds without the proposed dictation API. Audio is handled by Hermes and its configured provider; only the resulting text enters the annotation attachment.
- Keyboard text selection supports Shift+Arrow, Shift+Home, Shift+End, Shift+PageUp, and Shift+PageDown. Open editors follow their source passage while scrolling; if the passage leaves view, the pending comment is kept for recovery.
- Explicit attachment review or removal asks Resume or Discard before replacing an unfinished comment. Close controls are keyboard-reachable and become visible on keyboard focus.
- Enter stages a comment; Shift+Enter inserts a line break. Staging never sends a message.
- Escape or the close control on an unfinished comment asks **Resume** or **Discard**.
- Multiple selections and comments stay paired in one attachment.
- The ordinary reply keeps its contents and whitespace.
- Selected text and comments retain their full contents, including code indentation. Host limits (1,000 items, 64k per field, 512k encoded) surface recovery copy; drafts are not truncated on failure.
- Comments remain editable when a draft write fails. Unfinished comments stay in memory for their original connection, profile, and chat while the plugin remains loaded.
- Owner guards: every read and write is scoped to the focused chat's owner (connection, profile, chat). When the host exposes `focusedSessionOwner`, an unresolved owner fails closed and nothing is staged. Older hosts fall back to `focusedSessionProfile` and the connection ID. If the focused chat changes while a draft read is in flight, the write is abandoned and the comment stays editable; an unfinished comment is restored only when its original owner is focused again.
- A compact preview uses the current Hermes theme, short motion, and the operating system's reduced-motion preference.
- Normal copy commands, model selection, tools, and other plugins are not changed.

The compact editor, hover preview, and optional dictation are included in the hackathon preview. Historical fixture checks below describe their tested scope.

## Developer setup

The current local review base is Hermes v0.23.0, commit `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`, using `../integration/response-annotations-v0.23.0.patch`. The older patch targets `5057eaa3a4d0cbef0e30078418a5115faa62889e`. Use a separate checkout and a disposable Hermes home. Do not apply the extension over unrelated work.

1. Build a compatible Hermes desktop with the native extension in `../integration/`.
2. Install this repository using Hermes' plugin installer, pinning an exact commit:

   ```sh
   hermes plugins install https://github.com/LarryLemonBot/annotate-for-hermes --ref FULL_COMMIT_SHA --enable
   ```

3. In **Capabilities → Plugins**, open **Annotate for Hermes** and enable its **Desktop** switch. The CLI `--enable` flag controls the separate agent component.
4. Use **Reload desktop plugins** in the command palette if the app was already open.
5. Select assistant text and choose **Add to chat**. An existing draft should stay intact.

Development dependencies are confined to `tests/`; installing the plugin does not require npm.

The plugin is plain JavaScript with no runtime dependencies, Python hooks, model requests, external network calls, or background processes. All composer reads and writes use the proposed composer SDK. Selection eligibility belongs to the native API so the plugin does not depend on private transcript markup.

## Verification

```sh
npm --prefix tests ci
npm --prefix tests test
hermes plugins validate .
```

Current automated coverage in this repository:

- **Unit (vitest):** 64 tests in four files covering selection popup polish, Escape Resume/Discard, duplicate handling, highlight cleanup, hover previews, dictation insertion and cancellation, draft preservation, host limit recovery copy, and the owner guards (owner switches, null owner, profile fallback, owner changes during asynchronous draft reads). Regression cases also cover editor anchoring during scrolling, hidden or detached selections, keyboard selection, pending-comment recovery before review or removal, visible keyboard close controls, repeated notifications for the same chat owner, and scrolling outside the review pane.
- **`hermes plugins validate`:** manifest, security scan, desktop SDK surface, and no core override on the plugin tip.
- **`tests/native.mjs`:** isolated development renderer through Hermes' performance-test connection. Set `HERMES_SOURCE_DIR`, `HERMES_TEST_HOME`, `HERMES_TEST_CDP_PORT`, and `HERMES_TEST_DEV_PORT`. The script refuses a desktop whose plugin root differs from the disposable test home. It checks three distinct passages, a single native composer chip, exact comments, edit/remove, draft preservation, reduced motion, and zero automatic submissions. It uses synthetic assistant messages and does not call a language model.

A local fixture check on macOS used a production-built renderer of a Hermes desktop build containing exactly `../integration/response-annotations.patch`, a real local backend, and a fresh disposable Hermes home and user-data directory. It installed this plugin with `hermes plugins install --ref` and enabled and disabled it with the visible **Desktop** switch. It confirmed that ordinary reply text with doubled spaces, a leading indent, and a tab, plus an indented code selection and multi-line comments, came through add, edit, and remove unchanged. It also confirmed that a saved draft annotation persisted through both an app restart and a full backend restart with a successful `session.resume`. Separate sent-annotation evidence was not captured in this fresh fixture (draft only). The assistant text came from a deterministic local stub, not a model.

Additional disposable real-build checks (local artifacts, not CI) have exercised light/dark/system UI, keyboard flows, and annotation wire format against **OpenAI-family TEST DOUBLE** stubs and, separately, a real Grok path. These checks do not establish stock-Hermes compatibility or coverage of other real model providers.

The [README screenshot](../README.md) uses synthetic fixture messages, not personal chats.

Detailed native and real-build results are local artifacts, excluded from Git. Runtime evidence is macOS (Apple silicon) only. Windows, Linux, screen-reader behavior, and touch input are untested.

## Candidate verification: November 6, 2026

A separate checkout of Hermes v0.23.0 accepted the complete 17-file `response-annotations-v0.23.0.patch`, then completed a production build and macOS packaging. Focused native runs passed 229 distinct tests across 14 files. Coverage includes payload parsing, owner routing, composer attachments and submission, dictation, directive rendering and actions, rich-editor behavior, sent-chip interaction, and actual DOM focus routing. These checks are additional to the 64 plugin tests in four files.

The latest audit fixes keep editors anchored while scrolling, recover unfinished comments before explicit review or removal, expose keyboard close controls, and use separate native chip open/remove controls. A native SDK routing fix restores focus to the addressed visible composer tile. Automated regressions passed. Packaged macOS runtime checks also passed explicit review and keyboard focus recovery in a split pane while the main pane showed Capabilities without a primary chat composer. The review stayed open for more than 30 seconds through background carousel rotation. Keyboard Close returned typing focus to the correct tile; temporary test text was removed, and all three saved annotations remained. This used an existing profile with the candidate plugin JavaScript loaded manually, not a fresh full-candidate installation.

The published preview at `71c688fd2dd26554e404b467b48bff6d2ecfdb32` also installed by exact SHA into a new disposable Hermes home. That verifies the installer path for that published revision; it is not evidence that stock Hermes provides the missing SDK or that an unpublished candidate can be installed from GitHub.

**Earlier three-comment workflow check:** the candidate was loaded in a packaged macOS Hermes development build. Three comments on a real project plan were staged, reviewed, and sent together. The real Grok response moved the gallery to phase two, added a 15-minute cleanup buffer, and supplied a five-step launch checklist. No website was built in this demonstration. This verifies the annotation workflow with that model and build, not every provider or future release.

**Seven-comment website workflow:** seven comments on the fictional Juniper website proposal were sent together, and the real Grok response revised the proposal. A separate instruction then asked Hermes to build a local website preview from that plan. The annotations applied to assistant text, not a rendered webpage; sending annotations did not automatically build a website.

The test dependencies reported no known vulnerabilities in `npm audit` on this date. The plugin has no runtime npm dependencies. The GitHub Actions workflow runs the plugin unit suite on Node 22 and 26; a successful local run is not a claim that a remote workflow has run.

The sent-annotation click regression was reproduced in a packaged build: its event reached the containing message editor. The updated native patch stops click and pointer-down propagation for annotation chips. A regression test reproduced the failure before the fix and passed afterward, alongside the existing directive tests. That sent-chip fix subsequently passed a fresh packaged macOS check: the sent preview stayed read-only, and ordinary message editing still worked. This used an existing profile with candidate desktop JavaScript loaded manually; it was not a fresh full-candidate installation. The later split-pane review and focus checks above used the final candidate plugin; the earlier sent-chip check retains its separate scope.

## Update behavior and limits

Hermes owns plugin installation and updates. This plugin does not update itself or rewrite application files. A native desktop update can replace a locally built extension until upstream includes the API; compatibility is detected at activation, and the plugin shows a notice instead of failing silently. Updating a stock Hermes install (including v0.23.0) does not add the API. The official Hermes updater has not been tested with this plugin in an isolated environment, so update survival through it is unverified.

The native attachment contract allows up to 1,000 items, 64,000 characters per selection or comment, and 512,000 characters in the encoded attachment. Over-limit additions fail visibly and keep the comment available to edit. The model's context limit can be smaller.

Draft attachments are self-contained and survive ordinary Hermes draft persistence. Unsaved popover comments and source highlights are temporary and do not survive an app reload. Source highlights and numbered markers are not reconstructed after reload; the saved attachment still contains every selected passage and comment. Hermes remains responsible for sending, queuing, and restoring failed sends.

