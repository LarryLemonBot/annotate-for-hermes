# Proposed native response-annotations API

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

## 0.23.0 local review candidate

`response-annotations-v0.23.0.patch` is the complete annotation-only patch against stable commit `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`. Apply it instead of the older patch on that base. It adds optional `interaction: 'hover' | 'focus' | 'leave'` intent to `onOpen` events; plugins using click-only events remain compatible. These local changes have not been published to the upstream PR.
