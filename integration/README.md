# Proposed native response-annotations API

For the hackathon preview, use **Hermes v0.23.0**, commit `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`, with `response-annotations-v0.23.0.patch`. This complete 15-file patch includes compact-preview events and optional dictation. Apply it in a separate checkout with `git apply --check`, then `git apply`, and follow Hermes desktop build instructions. Use a disposable Hermes home for testing.

The older base below is retained for the original upstream proposal.

This developer patch adds a generic attachment reference and a public selection capture method to Hermes Desktop. It is not run by the plugin installer and is not a substitute for upstream acceptance.

Tested base: `5057eaa3a4d0cbef0e30078418a5115faa62889e`.

In a separate Hermes checkout at that commit:

```sh
git apply --check /absolute/path/to/response-annotations.patch
git apply /absolute/path/to/response-annotations.patch
```

Then use that checkout's documented desktop development/build workflow. If the check fails, stop and review the differences; do not force the patch. This does not install or replace an application automatically.

The eight changed desktop files and SDK documentation cover the annotation reference, the composer chip, saved-message rendering, SDK methods, styles, and tests. There are no gateway, provider, authentication, model, tool, or memory changes.

`host.composer.annotations` exposes `version: 1`, `captureSelection()`, `format(payload)`, `parse(value)`, and `onOpen(listener)`. Selection capture accepts text within one assistant response and rejects the composer and user messages. The native layer owns transcript markup. The plugin owns its popovers and reads/writes the draft through the existing composer SDK.

The payload is a versioned, self-contained reference with ordered `{id, text, comment}` entries. Formatting escapes reference delimiters, at-signs, slashes and HTML delimiters in JSON strings. Selected text remains data, including literal references and commands. The parser validates size limits and unique item IDs. No separate lookup store is needed to interpret a persisted draft or message.

Editable chip events target the current draft. Saved-message chips open a read-only preview. The existing Hermes send/queue lifecycle owns submission; the plugin never calls submit.

The patch carries Hermes source context under `HERMES-LICENSE`.

## 0.23.0 hackathon preview

`response-annotations-v0.23.0.patch` is the complete annotation-only patch against stable commit `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`. Apply it instead of the older patch on that base. It adds optional `interaction: 'hover' | 'focus' | 'leave'` intent to `onOpen` events; plugins using click-only events remain compatible. This patch is newer than the current core PR implementation; inclusion here does not imply upstream acceptance.


### Optional comment dictation

The 0.23.0 review patch also proposes `host.composer.dictation.version === 1` and `start(sessionId, { onTranscript, onState })`. It returns `{ stop(), cancel() }`, or `null` when the addressed composer cannot claim the request. State is `starting`, `recording`, `transcribing`, or `idle`. Start only after an explicit user action; call `cancel()` when the recipient field closes. Stop transcribes using the addressed composer's existing STT path; cancel discards the take and suppresses late results. The host cancels on composer teardown or session/scope change. The recipient receives text without changing or submitting the chat draft. The microphone permissions, recording limits, provider configuration, and STT routing remain owned by Hermes.

The plugin feature-detects this optional capability and keeps typed annotations available without it. Both API additions remain local review proposals; plugin catalog approval alone does not make them stable host APIs.
