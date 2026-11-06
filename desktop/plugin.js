import { host } from '@hermes/plugin-sdk'

const ROOT = '[data-afh]'
const REFERENCE = /@annotation:`([^`]+)`/g
const symbols = {
  note: '<path d="M8 10h8M8 14h5"/><path d="M20 11.5v4A3.5 3.5 0 0 1 16.5 19H9l-4 3v-4a3.5 3.5 0 0 1-2-3.2V6.5A3.5 3.5 0 0 1 6.5 3h10A3.5 3.5 0 0 1 20 6.5Z"/>',
  edit: '<path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15Z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  arrow: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>'
}

function icon(name) {
  const span = document.createElement('span')
  span.className = 'afh-icon'
  // Only fixed, authored icon paths enter innerHTML. User content uses textContent.
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name]}</svg>`
  return span
}

function node(tag, className, text) {
  const element = document.createElement(tag)
  element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

function button(label, symbol, action, className = 'afh-icon-button') {
  const element = node('button', className)
  element.type = 'button'
  element.setAttribute('aria-label', label)
  element.title = label
  if (symbol) element.append(icon(symbol))
  element.addEventListener('click', action)
  return element
}

export function readAttachments(draft, api) {
  return [...draft.matchAll(REFERENCE)].flatMap(match => {
    const data = api.parse(match[1])
    return data ? [{ token: match[0], value: match[1], start: match.index, data }] : []
  })
}

export function replaceAttachment(draft, previous, annotations, api) {
  const payload = { type: 'response-annotations', version: 1, label: `${annotations.length} annotation${annotations.length === 1 ? '' : 's'}`, annotations }
  const token = annotations.length ? api.format(payload) : ''
  if (previous) {
    const start = draft.indexOf(previous.token)
    if (start < 0) throw new Error('This annotation changed. Reopen it to continue.')
    let end = start + previous.token.length
    // Own only the separator inserted before an ordinary reply, never its whitespace.
    if (!token && start === 0 && draft.slice(end, end + 2) === '\n\n') end += 2
    return draft.slice(0, start) + token + draft.slice(end)
  }
  return token + (draft ? `\n\n${draft}` : '')
}

/** Host response-annotations caps (composer SDK): ≤1,000 items, ≤64k per text/comment, ≤512k wire JSON. */
const MAX_ANNOTATIONS = 1000
const MAX_FIELD_CHARS = 64_000

export function limitRecoveryMessage(annotations) {
  if (annotations.length > MAX_ANNOTATIONS) {
    return 'This draft already has 1,000 annotations. Remove one or send this batch before adding more.'
  }
  if (annotations.some(item => item.text.length > MAX_FIELD_CHARS || item.comment.length > MAX_FIELD_CHARS)) {
    return 'That selection or comment is too long. Shorten or split the selected text or comments, then try again.'
  }
  return 'These annotations are too large to send together. Shorten or split the selected text or comments, then try again.'
}

function mapFormatLimitError(error, annotations) {
  const message = String(error?.message || '')
  if (!/invalid response annotations|annotation limit reached|limit/i.test(message)) return null
  return limitRecoveryMessage(annotations)
}


const styles = `
/* Use the selected Hermes elevated surface, not its translucent glass treatment. */
[data-afh]{--afh-bg:var(--ui-bg-elevated,light-dark(#ffffff,#2c2c2e));--afh-fg:var(--ui-text-primary,light-dark(#18181b,#f4f4f5));--afh-muted:var(--ui-text-secondary,light-dark(#5f5f68,#a9a9b1));--afh-line:var(--ui-stroke-secondary,light-dark(#0000001f,#ffffff20));--afh-hover:var(--chrome-action-hover,light-dark(#0000000a,#ffffff0c));--afh-accent:var(--ui-accent,light-dark(#2563eb,#6395f6));--afh-danger:var(--ui-text-danger,light-dark(#b42318,#ed8d88));box-sizing:border-box;color:var(--afh-fg);font:13px/1.5 var(--font-sans,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);z-index:var(--z-modal-popover,1000)}
[data-afh] *,[data-afh] *::before,[data-afh] *::after{box-sizing:border-box}
[data-afh] button{font:inherit;color:inherit;cursor:pointer;border:0;background:none;flex-shrink:0}
[data-afh] button:disabled{opacity:.5;cursor:wait}
[data-afh] button:focus-visible{outline:2px solid var(--afh-accent);outline-offset:3px}
.afh-surface{position:fixed;background:var(--afh-bg);isolation:isolate;border:1px solid var(--afh-line);box-shadow:0 1px 3px light-dark(#00000012,#0000004d),0 4px 16px light-dark(#0000001f,#00000066);animation:afh-appear 120ms cubic-bezier(.2,0,0,1) both}
.afh-toolbar{height:28px;border-radius:8px;padding:2px}
.afh-add{display:flex;align-items:center;gap:7px;height:22px;padding:0 8px;border-radius:5px}
.afh-add:hover,.afh-icon-button:hover{background:var(--afh-hover)}
.afh-icon{display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center;flex:none}
.afh-icon svg{width:100%;height:100%}
.afh-panel{width:320px;max-width:calc(100vw - 24px);border-radius:8px;padding:10px;max-height:calc(100vh - 24px);overflow:auto;overscroll-behavior:contain;animation-duration:160ms}
.afh-panel:focus{outline:none}
[data-afh="review"]{width:min(360px,calc(100vw - 24px))}
.afh-header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.afh-title{font-size:13px;font-weight:600;letter-spacing:-.1px}
.afh-icon-button{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;transition:background 100ms ease,color 100ms ease}
.afh-selected-label{display:block;margin:0 0 6px;font-size:12px;color:var(--afh-muted)}
.afh-quote{margin:0;padding:8px 10px;border-left:2px solid var(--afh-line);border-radius:0 6px 6px 0;background:color-mix(in srgb,var(--afh-fg) 4%,transparent);color:var(--afh-fg);font-size:13px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;max-height:62px;overflow:auto;user-select:text;-webkit-user-select:text}
.afh-comment-label{display:block;margin:12px 0 6px;font-size:12px;color:var(--afh-muted)}
[data-afh] .afh-input{display:block;resize:none;width:100%;min-height:52px;max-height:120px;border:1px solid var(--afh-line);border-radius:8px;padding:8px 10px;background:transparent;color:var(--afh-fg);font:inherit;line-height:1.55;outline:none}
[data-afh] .afh-input:focus-visible{border-color:var(--afh-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--afh-accent) 28%,transparent)}
[data-afh] .afh-input::placeholder{color:var(--afh-muted);opacity:.7}
.afh-footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:10px}
.afh-hint{font-size:11px;color:var(--afh-muted);white-space:normal;line-height:1.35;min-width:0;flex:1 1 8rem}
[data-afh] .afh-save{--afh-save-bg:color-mix(in srgb,var(--afh-accent) 60%,#000);height:28px;padding:0 10px;border-radius:6px;display:flex;align-items:center;justify-content:center;background:var(--afh-save-bg);color:#fff;transition:filter 100ms ease,transform 100ms ease}
.afh-save:hover{filter:brightness(.94)}
.afh-save:active{transform:scale(.96)}
[data-afh] .afh-save[data-duplicate]{background:transparent;color:var(--afh-muted);border:1px solid var(--afh-line);filter:none;transform:none;cursor:default;opacity:1}
.afh-confirm{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px}
.afh-confirm-text{font-size:12px;color:var(--afh-fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.afh-confirm-actions{display:flex;gap:6px}
[data-afh] .afh-secondary{height:28px;padding:0 10px;border-radius:6px;border:1px solid var(--afh-line)}
.afh-secondary:hover{background:var(--afh-hover)}
.afh-error{font-size:12px;color:var(--afh-danger);margin-top:10px}
.afh-error:empty{display:none}
.afh-items{list-style:none;padding:0;margin:0;max-height:min(360px,50vh);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}
.afh-item{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;padding:14px 0;border-top:1px solid var(--afh-line)}
.afh-item:first-child{padding-top:0;border-top:0}
.afh-item:last-child{padding-bottom:0}
.afh-number{font-size:12px;color:var(--afh-muted);padding-top:6px;font-variant-numeric:tabular-nums}
.afh-item-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:6px;color:var(--afh-muted);font-size:12px}
.afh-actions{display:flex;gap:2px;margin-right:-6px}
.afh-item .afh-quote{border:0;padding:0;border-radius:0;background:transparent;color:var(--afh-fg);max-height:156px}
.afh-comment{margin:10px 0 0;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--afh-muted)}
.afh-status{position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
::highlight(annotate-for-hermes){background:color-mix(in srgb,var(--ui-accent,#2563eb) 9%,transparent);text-decoration:underline dashed;text-decoration-thickness:1px;text-underline-offset:2px;text-decoration-color:color-mix(in srgb,var(--ui-accent,#2563eb) 40%,transparent)}
.afh-sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip-path:inset(50%);white-space:nowrap!important;border:0!important}
[data-afh="editor"]:has(.afh-comment-bar){width:360px;padding:8px;border-radius:28px;overflow:visible}
.afh-dictate[aria-pressed="true"]{color:var(--afh-accent);background:var(--afh-hover)}
.afh-dictate .afh-icon{width:18px;height:18px}
.afh-comment-bar{display:flex;align-items:flex-end;gap:8px}
[data-afh] .afh-comment-bar .afh-input{flex:1;min-width:0;min-height:24px;max-height:120px;padding:6px 9px;border:0;border-radius:18px;box-shadow:none;background:transparent}
[data-afh="editor"]:focus-within{border-color:var(--ui-stroke-primary,var(--afh-line));outline:none}
[data-afh] .afh-comment-bar .afh-save{width:32px;height:32px;min-width:32px;padding:0;border-radius:50%;background:var(--afh-fg);color:var(--afh-bg)}
[data-afh] .afh-comment-bar .afh-save[data-duplicate]{width:auto;padding:0 10px;background:transparent;color:var(--afh-muted)}
[data-afh="editor"]:has(.afh-comment-bar) .afh-footer{margin:0;gap:0}
[data-afh="editor"]:has(.afh-comment-bar) .afh-error:not(:empty){padding:0 8px 6px}
[data-afh="review"]{width:390px;padding:14px;border-radius:12px}
.afh-item{padding:12px 0;gap:8px}
.afh-number{padding-top:3px}
.afh-item-head{margin-bottom:0}
.afh-item .afh-comment-label{margin:10px 0 2px}
.afh-item .afh-comment{margin:0;color:var(--afh-fg)}
[data-afh="marker"]{position:fixed;display:flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid var(--afh-bg);border-radius:12px 12px 12px 3px;background:var(--afh-accent);color:var(--ui-text-on-accent,light-dark(#fff,#101014));font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 1px 3px light-dark(#00000018,#00000050)}
[data-afh="marker"][hidden]{display:none}
[data-afh="marker"]:focus-visible{outline:2px solid var(--afh-accent);outline-offset:2px}
@keyframes afh-appear{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
@media(prefers-reduced-motion:reduce){[data-afh],[data-afh] *{animation:none!important;transition:none!important}}
`

export class AnnotateController {
  constructor(sdk = host) {
    this.host = sdk
    this.api = sdk.composer.annotations
    this.disposers = []
    this.ranges = new Map()
    this.pending = new Map()
    this.markers = new Map()
    this.openGeneration = 0
    this.busy = false
    this.disposed = false
  }

  session() {
    return this.host.state.focusedStoredSessionId?.get() || this.host.state.focusedSessionId.get() || 'new'
  }

  // Connection-qualified scope for the FOCUSED chat. Prefer focusedSessionOwner
  // whenever the host exposes it. A null/unresolved owner fails CLOSED (no ambient
  // gateway/profile fallback) so a tile focus move across sources cannot stage into
  // the wrong owner when durable chat IDs collide. Legacy hosts without the owner
  // atom keep the focusedSessionProfile + connectionId ladder.
  scope() {
    if (this.host.state.focusedSessionOwner !== undefined) {
      const owner = this.host.state.focusedSessionOwner?.get?.()
      if (!owner || typeof owner.connectionId !== 'string' || !owner.connectionId.trim() || typeof owner.profile !== 'string' || !String(owner.profile).trim()) {
        return null
      }
      return JSON.stringify([owner.connectionId.trim(), String(owner.profile).trim(), this.session()])
    }
    const profile = this.host.state.focusedSessionProfile?.get?.() || this.host.state.profile?.get?.() || 'default'
    return JSON.stringify([this.host.state.connectionId?.get() || 'local', profile || 'default', this.session()])
  }

  mount() {
    if (this.api?.version !== 1 || !this.api.captureSelection) {
      this.host.notify({kind:'warning',title:'Annotate for Hermes',message:'This desktop needs the response-annotations API extension. See the installation guide before enabling Annotate.'})
      return
    }
    this.style = node('style', '')
    this.style.textContent = styles
    document.head.append(this.style)
    this.status = node('div', 'afh-status')
    this.status.dataset.afh = 'status'
    this.status.setAttribute('role', 'status')
    document.body.append(this.status)
    const listen = (target, event, fn, options) => {
      target.addEventListener(event, fn, options)
      this.disposers.push(() => target.removeEventListener(event, fn, options))
    }
    listen(document, 'mouseup', event => { if (!event.target.closest?.(ROOT)) this.offer() })
    listen(document, 'selectionchange', () => {
      if (this.toolbar && !this.api.captureSelection()) { this.toolbar.remove(); this.toolbar = null }
    })
    listen(document, 'keyup', event => { if (event.key.startsWith('Arrow') && event.shiftKey) this.offer() })
    listen(document, 'keydown', event => {
      if (event.key === 'Escape' && (this.panel || this.toolbar)) {
        event.stopPropagation()
        if (this.panel?.dataset.afh === 'editor' && this.panel.escape) { this.panel.escape(); return }
        this.close(true)
      }
    }, true)
    listen(document, 'pointerdown', event => {
      if (this.panel?.dataset.afh === 'review' && !event.target.closest?.(ROOT)) this.close(false)
    })
    listen(window, 'resize', () => { this.position(); this.positionMarkers() })
    listen(document, 'scroll', event => {
      if (event.target.closest?.(ROOT)) return
      this.toolbar?.remove(); this.toolbar = null
      this.positionMarkers()
      if (this.panel?.dataset.afh === 'review') this.close(false)
    }, true)
    // Watch only the passages that hold a tracked highlight (the parent of each range's element,
    // so a replaced paragraph is noticed), never the whole document, and only while one exists.
    this.observer = new MutationObserver(records => {
      const own = node => (node.nodeType === 1 ? node : node.parentElement)?.closest?.(ROOT)
      if (records.some(record => !own(record.target) && (record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some(node => !own(node))))) this.refreshHighlights()
    })
    this.disposers.push(() => this.observer.disconnect())
    for (const atom of [this.host.state.focusedStoredSessionId, this.host.state.focusedSessionId, this.host.state.focusedSessionOwner, this.host.state.focusedSessionProfile, this.host.state.connectionId, this.host.state.profile]) {
      if (atom?.listen) this.disposers.push(atom.listen(() => {
        this.close(false)
        this.refreshHighlights()
        const scope = this.scope()
        if (scope == null || this.busy) return
        const pending = this.pending.get(scope)
        if (pending) this.edit(pending)
      }))
    }
    this.disposers.push(this.api.onOpen(request => this.open(request)))
  }

  surface(kind) {
    const element = node('div', `afh-surface afh-${kind === 'toolbar' ? 'toolbar' : 'panel'}`)
    element.dataset.afh = kind
    document.body.append(element)
    return element
  }

  offer() {
    const selected = this.api.captureSelection()
    this.toolbar?.remove()
    this.toolbar = null
    if (!selected) return
    const scope = this.scope()
    if (scope == null) return
    const {text, range, anchor} = selected
    const captured = { text, range, anchor, session: this.session(), scope }
    this.toolbar = this.surface('toolbar')
    this.toolbar.setAttribute('role', 'toolbar')
    this.toolbar.setAttribute('aria-label', 'Selection annotation')
    const add = button('Add to chat', 'note', () => {
      this.edit(captured)
    }, 'afh-add')
    add.setAttribute('aria-haspopup', 'dialog')
    add.append(node('span', '', 'Add to chat'))
    add.addEventListener('mousedown', event => event.preventDefault())
    this.toolbar.append(add)
    this.place(this.toolbar, anchor)
  }

  place(element, anchor) {
    if (!element || !anchor) return
    const box = element.getBoundingClientRect()
    const below = anchor.bottom + 10
    const above = anchor.top - box.height - 10
    const preferAbove = element.dataset.afh === 'editor' || element.dataset.afh === 'review'
    const top = preferAbove && above >= 12 ? above : below + box.height <= window.innerHeight - 12 || above < 12 ? below : above
    element.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - box.width - 12))}px`
    element.style.top = `${Math.max(12, Math.min(top, window.innerHeight - box.height - 12))}px`
  }

  position() { this.place(this.panel, this.anchor) }

  close(focus) {
    const session = this.owner
    this.openGeneration++
    clearTimeout(this.previewTimer)
    this.previewValue = null
    this.preview = false
    this.panel?.cancelDictation?.()
    this.panel?.remove()
    this.toolbar?.remove()
    this.panel = this.toolbar = null
    if (focus && session === this.session()) this.host.composer.focus(session)
  }

  edit(captured, existing = captured.existing || null, attachment = captured.attachment || null) {
    const scope = this.scope()
    if (this.busy || scope == null || captured.session !== this.session() || (captured.scope && captured.scope !== scope)) return
    const pending = this.pending.get(scope)
    if (pending && pending !== captured) {
      if (pending.comment?.trim()) return this.conflict(pending, { captured, existing, attachment })
      this.pending.delete(scope)
    }
    this.close(false)
    this.owner = captured.session
    this.anchor = captured.anchor
    const entry = { ...captured, scope, existing, attachment, comment: captured.comment ?? existing?.comment ?? '' }
    this.pending.set(entry.scope, entry)
    this.panel = this.surface('editor')
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-label', existing ? 'Edit annotation' : 'Add annotation')
    const panel = this.panel
    const header = node('div', 'afh-header')
    const cancel = button('Cancel annotation', 'close', () => { if (!this.busy) panel.escape?.() })
    cancel.tabIndex = -1
    header.append(node('span', 'afh-title', existing ? 'Edit annotation' : 'Add annotation'), cancel)
    const selectedLabel = node('div', 'afh-selected-label', 'Selected text')
    selectedLabel.id = 'afh-selected-label'
    const quote = node('blockquote', 'afh-quote', captured.text)
    quote.setAttribute('aria-labelledby', selectedLabel.id)
    const label = node('label', 'afh-comment-label', 'Comment')
    const input = node('textarea', 'afh-input')
    input.id = 'afh-comment'
    input.setAttribute('aria-label', 'Comment')
    input.placeholder = 'Add an optional comment…'
    input.rows = 1
    input.maxLength = 64000
    input.value = entry.comment
    label.htmlFor = input.id
    const resize = () => { input.style.height = 'auto'; input.style.height = `${Math.min(120, Math.max(24, input.scrollHeight))}px` }
    input.addEventListener('input', () => { entry.comment = input.value; resize(); this.position() })
    const footer = node('div', 'afh-footer')
    const error = node('div', 'afh-error')
    error.setAttribute('role', 'alert')
    const save = button(existing ? 'Save annotation' : 'Add to reply', 'arrow', () => commit(), 'afh-save')
    save.title = existing ? 'Save annotation' : 'Add to reply'
    const commit = async () => {
      if (this.busy || this.disposed || panel.dictating) return
      this.busy = true
      save.disabled = true
      cancel.disabled = true
      input.readOnly = true
      let duplicate = false
      try {
        await this.save(entry)
        this.pending.delete(entry.scope)
        if (!this.disposed && this.scope() === entry.scope) {
          if (this.panel === panel) this.close(true)
          this.status.textContent = existing ? 'Annotation updated.' : 'Annotation added to your draft.'
        }
      } catch (failure) {
        if (failure.duplicate) {
          duplicate = true
          save.dataset.duplicate = ''
          save.textContent = 'Already added'
          save.setAttribute('aria-label', 'This selection is already in your draft')
          this.status.textContent = 'This selection is already in your draft.'
          hint.textContent = 'Esc closes'
          hint.setAttribute('aria-label', 'This selection is already in your draft. Escape to close')
          panel.escape = () => { this.pending.delete(entry.scope); this.close(true) }
        } else error.textContent = failure.message
      }
      finally { this.busy = false; save.disabled = duplicate; cancel.disabled = false; input.readOnly = false }
    }
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); event.stopPropagation(); void commit() }
    })
    const hint = node('span', 'afh-hint', existing ? '↵ save · ⇧↵ new line · Esc cancel' : '↵ add · ⇧↵ newline · Esc cancel')
    hint.setAttribute('aria-label', `Enter to ${existing ? 'save' : 'add to reply'}, Shift Enter for a new line, Escape to cancel`)
    hint.id = 'afh-editor-hint'
    input.setAttribute('aria-describedby', hint.id)
    footer.append(hint, save)
    // Keep the selection and shortcut guidance available to assistive technology.
    // The visible editor is a single comment bar, anchored to the selected passage.
    for (const element of [header, selectedLabel, quote, label, hint]) element.classList.add('afh-sr-only')
    const bar = node('div', 'afh-comment-bar')
    const mic = this.dictationControl(panel, input, save, error, entry)
    bar.append(input, mic, save)
    this.panel.append(header, selectedLabel, quote, label, bar, footer, error)
    panel.escape = () => {
      if (this.busy) return
      if (panel.dictating) { panel.cancelDictation(); return }
      if (!input.value.trim()) { this.pending.delete(entry.scope); this.close(true); return }
      if (panel.querySelector('.afh-confirm')) { resume(); return }
      footer.hidden = true
      save.hidden = true
      const row = node('div', 'afh-confirm')
      row.setAttribute('role', 'group')
      row.setAttribute('aria-label', 'Unsaved comment')
      const actions = node('div', 'afh-confirm-actions')
      const keep = button('Resume editing', null, () => resume(), 'afh-secondary')
      keep.textContent = 'Resume'
      const discard = button('Discard comment', null, () => { this.pending.delete(entry.scope); this.close(true) }, 'afh-save')
      discard.textContent = 'Discard'
      actions.append(keep, discard)
      row.append(node('span', 'afh-confirm-text', 'Discard this comment?'), actions)
      panel.insertBefore(row, error)
      input.readOnly = true
      this.position()
      keep.focus()
    }
    const resume = () => {
      panel.querySelector('.afh-confirm')?.remove()
      footer.hidden = false
      save.hidden = false
      input.readOnly = false
      this.position()
      input.focus()
    }
    resize()
    this.position()
    input.focus()
  }

  conflict(stale, next) {
    this.close(false)
    this.owner = stale.session
    this.anchor = next.captured.anchor || stale.anchor
    const panel = this.panel = this.surface('editor')
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', 'Unfinished comment')
    const header = node('div', 'afh-header')
    header.append(node('span', 'afh-title', 'Unfinished comment'), button('Close', 'close', () => this.close(true)))
    const note = node('p', 'afh-comment', 'You have an unsaved comment on another selection.')
    note.style.marginTop = '0'
    const quote = node('blockquote', 'afh-quote', stale.text)
    const footer = node('div', 'afh-confirm')
    const actions = node('div', 'afh-confirm-actions')
    const resume = button('Resume the unsaved comment', null, () => { this.close(false); this.edit(stale) }, 'afh-secondary')
    resume.textContent = 'Resume'
    const discard = button('Discard it and annotate the new selection', null, () => {
      this.pending.delete(stale.scope)
      this.close(false)
      this.edit(next.captured, next.existing, next.attachment)
    }, 'afh-save')
    discard.textContent = 'Discard'
    actions.append(resume, discard)
    footer.append(node('span', 'afh-confirm-text', `“${stale.comment.trim().slice(0, 40)}”`), actions)
    panel.append(header, note, quote, footer)
    this.position()
    resume.focus()
  }

  dictationControl(panel, input, save, error, entry) {
    let take = null
    let generation = 0
    let phase = 'idle'
    const available = this.host.composer.dictation?.version === 1
    const mic = button('Dictate comment', 'mic', () => {
      if (phase === 'recording') { take?.stop(); return }
      if (phase !== 'idle' || this.busy || input.readOnly) return
      const current = ++generation
      const before = input.value
      const start = input.selectionStart
      const end = input.selectionEnd
      const live = () => current === generation && this.panel === panel && entry.scope === this.scope() && !this.disposed
      let finished = false
      error.textContent = ''
      const handle = this.host.composer.dictation.start(entry.session, {
        onState: status => {
          if (!live()) return
          update(status)
          if (status === 'idle') { finished = true; take = null; input.focus() }
        },
        onTranscript: text => {
          if (!live()) return
          const prefix = before.slice(0, start)
          const suffix = before.slice(end)
          const spoken = (/\S$/.test(prefix) ? ' ' : '') + text + (/^[\p{L}\p{N}]/u.test(suffix) ? ' ' : '')
          const next = prefix + spoken + suffix
          if (next.length > MAX_FIELD_CHARS) { error.textContent = 'This comment is too long. Shorten it and dictate again.'; return }
          input.value = next
          input.setSelectionRange(prefix.length + spoken.length, prefix.length + spoken.length)
          input.dispatchEvent(new Event('input'))
        }
      })
      if (!handle) { update('idle'); error.textContent = 'Dictation is unavailable or already in use. Check Hermes voice settings and try again.' }
      else if (!finished) take = handle
    }, 'afh-icon-button afh-dictate')
    const update = status => {
      phase = status
      panel.dictating = status !== 'idle'
      input.readOnly = panel.dictating
      save.disabled = panel.dictating
      mic.disabled = !available || status === 'starting' || status === 'transcribing'
      const label = { idle: 'Dictate comment', starting: 'Starting microphone…', recording: 'Stop dictation', transcribing: 'Transcribing comment…' }[status]
      mic.setAttribute('aria-label', label)
      mic.setAttribute('aria-pressed', String(panel.dictating))
      mic.title = label
      mic.replaceChildren(icon(status === 'recording' ? 'stop' : 'mic'))
      this.status.textContent = status === 'idle' ? '' : label
    }
    panel.cancelDictation = () => {
      generation++
      take?.cancel()
      take = null
      update('idle')
    }
    update('idle')
    if (!available) mic.title = 'Dictation needs the Hermes dictation API extension.'
    return mic
  }

  // Same passage = same live DOM range (identical start and end points) on an annotation already in this draft.
  samePassage(entry, annotations) {
    if (!entry.range) return false
    return annotations.some(item => {
      const tracked = this.ranges.get(item.id)
      if (!tracked || tracked.scope !== entry.scope || tracked.text !== entry.text) return false
      try {
        return tracked.range.compareBoundaryPoints(Range.START_TO_START, entry.range) === 0 && tracked.range.compareBoundaryPoints(Range.END_TO_END, entry.range) === 0
      } catch { return false }
    })
  }

  async save(entry) {
    if (entry.scope == null || this.scope() == null || entry.scope !== this.scope() || this.disposed) throw new Error('Return to the original chat to add this annotation.')
    const rangeText = entry.range?.toString()
    const draft = await this.host.composer.getDraft(entry.session)
    if (draft === null) throw new Error('The draft is unavailable. Your comment is kept here; try again.')
    if (entry.scope !== this.scope() || this.disposed) throw new Error('The chat changed. Your comment is still here.')
    const attachments = readAttachments(draft, this.api)
    const previous = entry.existing
      ? attachments.find(part => part.data.annotations.some(item => item.id === entry.existing.id))
      : attachments[0]
    const annotations = previous ? [...previous.data.annotations] : []
    const id = entry.existing?.id || crypto.randomUUID()
    const item = { id, text: entry.text, comment: entry.comment }
    if (entry.existing) {
      const index = annotations.findIndex(value => value.id === id)
      if (index < 0 || JSON.stringify(annotations[index]) !== JSON.stringify(entry.existing)) throw new Error('This annotation changed. Reopen it to continue.')
      annotations[index] = item
    } else {
      if (this.samePassage(entry, annotations)) throw Object.assign(new Error('Already added'), { duplicate: true })
      annotations.push(item)
    }
    if (annotations.length > MAX_ANNOTATIONS || annotations.some(value => value.text.length > MAX_FIELD_CHARS || value.comment.length > MAX_FIELD_CHARS)) {
      throw new Error(limitRecoveryMessage(annotations))
    }
    let next
    try {
      next = replaceAttachment(draft, previous, annotations, this.api)
    } catch (error) {
      throw new Error(mapFormatLimitError(error, annotations) || error.message)
    }
    await this.writeDraft(entry.session, entry.scope, draft, next)
    if (entry.range) this.ranges.set(id, { scope: entry.scope, range: entry.range, rangeText, text: entry.text, session: entry.session })
    this.syncMarkerNumbers(annotations)
    this.refreshHighlights()
  }

  async writeDraft(session, scope, previous, next) {
    const current = await this.host.composer.getDraft(session)
    if (this.disposed || scope == null || this.scope() == null || scope !== this.scope()) throw new Error('The chat changed. Return to the original chat to continue.')
    if (current !== previous) throw new Error('The draft changed. Nothing was overwritten; try again.')
    if (!await this.host.composer.setDraft(session, next)) throw new Error('The draft is unavailable. Nothing was changed; try again.')
  }

  async open(request) {
    if (request.interaction === 'leave') {
      if (this.previewValue === request.value) this.schedulePreviewClose()
      return
    }
    const passive = request.interaction === 'hover' || request.interaction === 'focus'
    if (this.busy || (passive && this.panel?.dataset.afh === 'editor')) return
    clearTimeout(this.previewTimer)
    if (passive && this.previewValue === request.value && this.panel?.dataset.afh === 'review') return
    const generation = ++this.openGeneration
    this.previewValue = request.value
    const data = this.api.parse(request.value)
    if (!data) return
    const session = this.session()
    const scope = this.scope()
    if (scope == null) return
    const draft = request.editable ? await this.host.composer.getDraft(session) ?? '' : ''
    if (this.disposed || this.busy || this.scope() !== scope || generation !== this.openGeneration) return
    const attachment = readAttachments(draft, this.api).find(part => part.value === request.value)
    if (request.editable && !attachment) return
    if (request.remove) {
      if (request.editable) await this.remove(session, attachment, null, scope)
      return
    }
    this.close(false)
    this.owner = session
    this.preview = passive
    this.previewValue = request.value
    this.anchor = request.anchor || { left: 24, top: window.innerHeight - 180, bottom: window.innerHeight - 170 }
    this.panel = this.surface('review')
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-label', 'Response annotations')
    this.panel.addEventListener('pointerenter', () => clearTimeout(this.previewTimer))
    this.panel.addEventListener('pointerleave', () => this.schedulePreviewClose())
    this.panel.addEventListener('focusin', () => clearTimeout(this.previewTimer))
    this.panel.addEventListener('focusout', () => this.schedulePreviewClose())
    const header = node('div', 'afh-header')
    header.append(node('span', 'afh-title', data.label), button('Close annotations', 'close', () => this.close(true)))
    const list = node('ol', 'afh-items')
    data.annotations.forEach((item, index) => {
      const row = node('li', 'afh-item')
      row.append(node('span', 'afh-number', `${index + 1}.`))
      const body = node('div', '')
      const heading = node('div', 'afh-item-head')
      heading.append(node('span', '', 'Selected text:'))
      if (request.editable) {
        const actions = node('div', 'afh-actions')
        actions.append(button(`Edit annotation ${index + 1}`, 'edit', () => this.edit({ text: item.text, session, scope, anchor: this.anchor }, item, attachment)), button(`Remove annotation ${index + 1}`, 'trash', async () => {
          const next = await this.remove(session, attachment, item.id, scope)
          if (next) await this.open({ ...request, value: next })
        }))
        heading.append(actions)
      }
      body.append(heading, node('blockquote', 'afh-quote', item.text))
      if (item.comment) {
        body.append(node('div', 'afh-comment-label', 'User comment:'), node('p', 'afh-comment', item.comment))
      }
      row.append(body)
      list.append(row)
    })
    header.classList.add('afh-sr-only')
    header.querySelector('button').tabIndex = -1
    this.panel.append(header, list)
    this.position()
    this.panel.tabIndex = -1
    if (!passive) this.panel.focus({ preventScroll: true })
  }

  async remove(session, attachment, id, scope = this.scope()) {
    if (this.busy || !attachment || scope == null) return null
    this.busy = true
    try {
      const draft = await this.host.composer.getDraft(session) ?? ''
      if (this.disposed || this.scope() == null || this.scope() !== scope) return null
      const current = readAttachments(draft, this.api).find(part => part.token === attachment.token)
      if (!current) throw new Error('This annotation changed. Reopen it to continue.')
      const items = id ? current.data.annotations.filter(item => item.id !== id) : []
      await this.writeDraft(session, scope, draft, replaceAttachment(draft, current, items, this.api))
      for (const item of current.data.annotations) if (!items.some(remaining => remaining.id === item.id)) this.ranges.delete(item.id)
      this.syncMarkerNumbers(items)
      this.refreshHighlights()
      this.close(true)
      this.status.textContent = 'Annotation removed.'
      return items.length ? this.api.format({ ...current.data, label: `${items.length} annotation${items.length === 1 ? '' : 's'}`, annotations: items }).slice(13, -1) : null
    } catch (error) {
      this.host.notify({ kind: 'error', message: error.message })
      return null
    } finally { this.busy = false }
  }

  schedulePreviewClose() {
    clearTimeout(this.previewTimer)
    this.previewTimer = setTimeout(() => {
      if ((this.preview || (!this.panel && this.previewValue)) && !this.panel?.matches(':hover, :focus-within')) this.close(false)
    }, 350)
  }

  syncMarkerNumbers(annotations) {
    annotations.forEach((item, index) => {
      const entry = this.ranges.get(item.id)
      if (entry) entry.number = index + 1
    })
  }

  async openMarker(id, interaction, marker) {
    const entry = this.ranges.get(id)
    if (!entry || entry.scope !== this.scope()) return
    const draft = await this.host.composer.getDraft(entry.session)
    if (this.disposed || entry.scope !== this.scope() || !marker.isConnected) return
    const part = readAttachments(draft || '', this.api).find(value => value.data.annotations.some(item => item.id === id))
    // A sent or externally removed draft no longer owns an editable marker.
    if (!part) { this.ranges.delete(id); this.refreshHighlights(); return }
    await this.open({ value: part.value, editable: true, anchor: marker.getBoundingClientRect(), interaction })
  }

  positionMarkers() {
    for (const [id, marker] of this.markers) {
      const entry = this.ranges.get(id)
      if (!entry || entry.scope !== this.scope()) { marker.remove(); this.markers.delete(id) }
    }
    const placed = []
    for (const [id, entry] of this.ranges) {
      if (entry.scope !== this.scope() || !entry.number) continue
      const rects = entry.range.getClientRects?.()
      const rect = rects?.[rects.length - 1]
      if (!rect) continue
      let marker = this.markers.get(id)
      if (!marker) {
        marker = button(`Annotation ${entry.number}`, null, () => this.openMarker(id, undefined, marker), 'afh-marker')
        marker.dataset.afh = 'marker'
        marker.setAttribute('aria-haspopup', 'dialog')
        marker.addEventListener('pointerenter', () => this.openMarker(id, 'hover', marker))
        marker.addEventListener('pointerleave', () => this.schedulePreviewClose())
        marker.addEventListener('focus', () => this.openMarker(id, 'focus', marker))
        marker.addEventListener('blur', () => this.schedulePreviewClose())
        document.body.append(marker)
        this.markers.set(id, marker)
      }
      marker.textContent = String(entry.number)
      marker.setAttribute('aria-label', `Annotation ${entry.number}`)
      marker.hidden = rect.bottom < 0 || rect.top > window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth
      let left = Math.max(8, Math.min(rect.right - 10, window.innerWidth - 32))
      let top = Math.max(8, rect.top - 23)
      while (placed.some(p => Math.abs(p.left - left) < 27 && Math.abs(p.top - top) < 27)) {
        if (left + 56 < window.innerWidth) left += 28
        else top += 28
      }
      placed.push({left, top})
      marker.style.left = `${left}px`
      marker.style.top = `${top}px`
    }
  }

  observeRanges() {
    if (!this.observer) return
    this.observer.disconnect()
    const watched = new Set()
    for (const { range } of this.ranges.values()) {
      const ancestor = range.commonAncestorContainer
      const element = ancestor.nodeType === 1 ? ancestor : ancestor.parentElement
      const target = element?.parentElement || element
      if (target && !watched.has(target)) {
        watched.add(target)
        this.observer.observe(target, { childList: true, characterData: true, subtree: true })
      }
    }
  }

  refreshHighlights() {
    for (const [id, entry] of this.ranges) {
      if (!entry.range.commonAncestorContainer.isConnected || entry.range.collapsed || entry.range.toString() !== (entry.rangeText ?? entry.text)) this.ranges.delete(id)
    }
    this.observeRanges()
    this.positionMarkers()
    if (!globalThis.CSS?.highlights || !globalThis.Highlight) return
    const ranges = [...this.ranges.values()].filter(entry => entry.scope === this.scope() && entry.range.commonAncestorContainer.isConnected).map(entry => entry.range)
    CSS.highlights.set('annotate-for-hermes', new Highlight(...ranges))
  }

  dispose() {
    this.disposed = true
    this.close(false)
    this.disposers.forEach(dispose => dispose())
    this.style?.remove()
    this.status?.remove()
    globalThis.CSS?.highlights?.delete('annotate-for-hermes')
    this.pending.clear()
    this.ranges.clear()
    this.markers.forEach(marker => marker.remove())
    this.markers.clear()
  }
}

export default {
  id: 'annotate-for-hermes',
  name: 'Annotate for Hermes',
  register(ctx) {
    const controller = new AnnotateController()
    controller.mount()
    ctx.onDispose(() => controller.dispose())
  }
}
