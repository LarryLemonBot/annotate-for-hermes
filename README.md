# Annotate for Hermes

![Annotate for Hermes](docs/catalog-banner.png)

Point to the exact passages you want changed. Send all your feedback in one reply.

Select text in an assistant response, choose **Add to chat**, and add an optional comment. Repeat wherever you need changes. Your selections and comments collect in one annotation attachment, ready to send with your next message.

**Hackathon development preview:** the demo uses a locally patched Hermes v0.23.0 build. Stock Hermes does not yet include the required annotation SDK. [Core API proposal](https://github.com/NousResearch/hermes-agent/pull/146959) · [Open catalog PR](https://github.com/NousResearch/hermes-agent/pull/146960)

![Two selected passages in the annotation preview, with a comment and edit controls](docs/annotation-preview.png)

Actual Hermes desktop capture with synthetic demo text; cropped to exclude account and workspace details.

## How it works

- **Select and comment.** A compact bar opens beside the passage. Type a comment, dictate one through Hermes, or leave it blank.
- **Review in place.** Numbered markers connect feedback to the text. Hover or focus the attachment to preview your selections; edit or remove comments before sending.
- **Send together.** One attachment keeps each passage paired with its comment. Adding an annotation never sends a message automatically.

The interface uses Hermes theme colors and typography. It supports up to 1,000 annotations per attachment, subject to text-size and model-context limits.

## Try the development preview

Build a separate Hermes v0.23.0 checkout with the [native integration patch](integration/README.md), then install an exact commit of this repository:

```sh
hermes plugins install https://github.com/LarryLemonBot/annotate-for-hermes --ref FULL_COMMIT_SHA --enable
```

In **Capabilities → Plugins → Annotate for Hermes**, enable the **Desktop** switch. If Hermes is already open, run **Reload desktop plugins** from the command palette. Select assistant text and choose **Add to chat**.

The CLI flag enables the separate agent component; the Desktop switch enables this interface. No npm setup is needed to use the plugin.

On stock Hermes, enabling the Desktop plugin displays a compatibility notice. The plugin does not patch the app. Its manifest minimum (`>=0.22.5`) is a development baseline, not a supported stable release. The catalog PR remains a draft until the SDK merges and ships in stable Hermes, when the minimum version and catalog pin can be finalized.

## Developer notes

Plain JavaScript, no runtime dependencies. The plugin uses composer SDK methods and does not make model requests, start background processes, or call external services. Selection capture belongs to Hermes; the plugin does not reach into private transcript markup. Dictation uses Hermes and its configured speech-to-text provider. Only the transcript enters the annotation.

```sh
npm --prefix tests ci
npm --prefix tests test
hermes plugins validate .
```

The current candidate passes 64 plugin tests. A separate Hermes v0.23.0 checkout with the included patch passed 229 focused native tests, a production build, and packaging. Earlier packaged macOS checks exercised real Grok responses, saved drafts, editing, previews, and microphone transcription. The latest packaged macOS checks passed annotation review and keyboard focus recovery in a split pane, using an existing profile with the candidate plugin loaded manually. See [behavior and testing](docs/BEHAVIOR-AND-TESTING.md) for the scope of each check.

Windows, Linux, screen readers, touch input, and the official updater path remain unverified. Native updates can replace the local SDK patch until it ships upstream. Saved attachment content persists through normal draft storage; unsaved comments and source markers do not survive an app reload. Model context limits still apply.

[Stable release checklist](docs/RELEASE-CHECKLIST.md) · [Proposed SDK and developer build](integration/README.md)

## License

MIT. The native integration contains Hermes source context under its MIT license; see [HERMES-LICENSE](integration/HERMES-LICENSE).
