import { host } from '@hermes/plugin-sdk'

const ROOT = '[data-afh]'
const REFERENCE = /@annotation:`([^`]+)`/g
const symbols = {
  note: '<path d="M8 10h8M8 14h5"/><path d="M20 11.5v4A3.5 3.5 0 0 1 16.5 19H9l-4 3v-4a3.5 3.5 0 0 1-2-3.2V6.5A3.5 3.5 0 0 1 6.5 3h10A3.5 3.5 0 0 1 20 6.5Z"/>',
  edit: '<path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15Z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
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

/** Host response-annotations caps (composer SDK): ≤100 items, ≤64k per text/comment, ≤512k wire JSON. */
const MAX_ANNOTATIONS = 100
const MAX_FIELD_CHARS = 64_000

export function limitRecoveryMessage(annotations) {
  if (annotations.length > MAX_ANNOTATIONS) {
    return 'This draft already has 100 annotations. Remove one or send this batch before adding more.'
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
/* Popover fill is opaque light-dark() so content behind cannot show through; follows color-scheme (light/dark/system). Host chrome glass tokens are not used for fill. */
[data-afh]{--afh-bg:light-dark(#ffffff,#2c2c2e);--afh-fg:var(--ui-text-primary,light-dark(#18181b,#f4f4f5));--afh-muted:var(--ui-text-secondary,light-dark(#5f5f68,#a9a9b1));--afh-line:var(--ui-stroke-secondary,light-dark(#0000001f,#ffffff20));--afh-hover:var(--chrome-action-hover,light-dark(#0000000a,#ffffff0c));--afh-accent:var(--ui-accent,light-dark(#2563eb,#6395f6));--afh-danger:var(--ui-text-danger,light-dark(#b42318,#ed8d88));box-sizing:border-box;color:var(--afh-fg);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;z-index:var(--z-modal-popover,1000)}
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
    this.busy = false
    this.disposed = false
  }

  session() {
    return this.host.state.focusedStoredSessionId?.get() || this.host.state.focusedSessionId.get() || 'new'
  }

  scope() {
    return JSON.stringify([this.host.state.connectionId?.get() || 'local', this.host.state.profile?.get() || 'default', this.session()])
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
    listen(window, 'resize', () => this.position())
    listen(document, 'scroll', () => { this.toolbar?.remove(); this.toolbar = null }, true)
    // Watch only the passages that hold a tracked highlight (the parent of each range's element,
    // so a replaced paragraph is noticed), never the whole document, and only while one exists.
    this.observer = new MutationObserver(() => this.refreshHighlights())
    this.disposers.push(() => this.observer.disconnect())
    for (const atom of [this.host.state.focusedStoredSessionId, this.host.state.focusedSessionId, this.host.state.connectionId, this.host.state.profile]) {
      if (atom?.listen) this.disposers.push(atom.listen(() => {
        this.close(false)
        this.refreshHighlights()
        const pending = this.pending.get(this.scope())
        if (pending && !this.busy) this.edit(pending)
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
    const {text, range, anchor} = selected
    const captured = { text, range, anchor, session: this.session(), scope: this.scope() }
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
    const top = below + box.height <= window.innerHeight - 12 || above < 12 ? below : above
    element.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - box.width - 12))}px`
    element.style.top = `${Math.max(12, Math.min(top, window.innerHeight - box.height - 12))}px`
  }

  position() { this.place(this.panel, this.anchor) }

  close(focus) {
    const session = this.owner
    this.panel?.remove()
    this.toolbar?.remove()
    this.panel = this.toolbar = null
    if (focus && session === this.session()) this.host.composer.focus(session)
  }

  edit(captured, existing = captured.existing || null, attachment = captured.attachment || null) {
    if (this.busy || captured.session !== this.session() || (captured.scope && captured.scope !== this.scope())) return
    const pending = this.pending.get(this.scope())
    if (pending && pending !== captured) {
      if (pending.comment?.trim()) return this.conflict(pending, { captured, existing, attachment })
      this.pending.delete(this.scope())
    }
    this.close(false)
    this.owner = captured.session
    this.anchor = captured.anchor
    const entry = { ...captured, scope: this.scope(), existing, attachment, comment: captured.comment ?? existing?.comment ?? '' }
    this.pending.set(entry.scope, entry)
    this.panel = this.surface('editor')
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-label', existing ? 'Edit annotation' : 'Add annotation')
    const panel = this.panel
    const header = node('div', 'afh-header')
    const cancel = button('Cancel annotation', 'close', () => { if (!this.busy) panel.escape?.() })
    header.append(node('span', 'afh-title', existing ? 'Edit annotation' : 'Add annotation'), cancel)
    const selectedLabel = node('div', 'afh-selected-label', 'Selected text')
    selectedLabel.id = 'afh-selected-label'
    const quote = node('blockquote', 'afh-quote', captured.text)
    quote.setAttribute('aria-labelledby', selectedLabel.id)
    const label = node('label', 'afh-comment-label', 'Comment')
    const input = node('textarea', 'afh-input')
    input.id = 'afh-comment'
    input.setAttribute('aria-label', 'Comment')
    input.placeholder = 'Add a comment…'
    input.maxLength = 64000
    input.value = entry.comment
    label.htmlFor = input.id
    const resize = () => { input.style.height = 'auto'; input.style.height = `${Math.min(120, Math.max(52, input.scrollHeight))}px` }
    input.addEventListener('input', () => { entry.comment = input.value; resize(); this.position() })
    const footer = node('div', 'afh-footer')
    const error = node('div', 'afh-error')
    error.setAttribute('role', 'alert')
    const save = button(existing ? 'Save annotation' : 'Add to reply', null, () => commit(), 'afh-save')
    save.textContent = existing ? 'Save' : 'Add to reply'
    const commit = async () => {
      if (this.busy || this.disposed) return
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
    this.panel.append(header, selectedLabel, quote, label, input, footer, error)
    panel.escape = () => {
      if (this.busy) return
      if (!input.value.trim()) { this.pending.delete(entry.scope); this.close(true); return }
      if (panel.querySelector('.afh-confirm')) { resume(); return }
      footer.hidden = true
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
    if (entry.scope !== this.scope() || this.disposed) throw new Error('Return to the original chat to add this annotation.')
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
    if (entry.range) this.ranges.set(id, { scope: entry.scope, range: entry.range, text: entry.text })
    this.refreshHighlights()
  }

  async writeDraft(session, scope, previous, next) {
    const current = await this.host.composer.getDraft(session)
    if (this.disposed || scope !== this.scope()) throw new Error('The chat changed. Return to the original chat to continue.')
    if (current !== previous) throw new Error('The draft changed. Nothing was overwritten; try again.')
    if (!await this.host.composer.setDraft(session, next)) throw new Error('The draft is unavailable. Nothing was changed; try again.')
  }

  async open(request) {
    if (this.busy) return
    const data = this.api.parse(request.value)
    if (!data) return
    const session = this.session()
    const scope = this.scope()
    const draft = request.editable ? await this.host.composer.getDraft(session) ?? '' : ''
    if (this.disposed || this.busy || this.scope() !== scope) return
    const attachment = readAttachments(draft, this.api).find(part => part.value === request.value)
    if (request.editable && !attachment) return
    if (request.remove) {
      if (request.editable) await this.remove(session, attachment, null, scope)
      return
    }
    this.close(false)
    this.owner = session
    this.anchor = request.anchor || { left: 24, top: window.innerHeight - 180, bottom: window.innerHeight - 170 }
    this.panel = this.surface('review')
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-label', 'Response annotations')
    const header = node('div', 'afh-header')
    header.append(node('span', 'afh-title', data.label), button('Close annotations', 'close', () => this.close(true)))
    const list = node('ol', 'afh-items')
    data.annotations.forEach((item, index) => {
      const row = node('li', 'afh-item')
      row.append(node('span', 'afh-number', `${index + 1}.`))
      const body = node('div', '')
      const heading = node('div', 'afh-item-head')
      heading.append(node('span', '', 'Selected text'))
      if (request.editable) {
        const actions = node('div', 'afh-actions')
        actions.append(button(`Edit annotation ${index + 1}`, 'edit', () => this.edit({ text: item.text, session, scope, anchor: this.anchor }, item, attachment)), button(`Remove annotation ${index + 1}`, 'trash', async () => {
          const next = await this.remove(session, attachment, item.id, scope)
          if (next) await this.open({ ...request, value: next })
        }))
        heading.append(actions)
      }
      body.append(heading, node('blockquote', 'afh-quote', item.text))
      if (item.comment) body.append(node('p', 'afh-comment', item.comment))
      row.append(body)
      list.append(row)
    })
    this.panel.append(header, list)
    this.position()
    this.panel.tabIndex = -1
    this.panel.focus({ preventScroll: true })
  }

  async remove(session, attachment, id, scope = this.scope()) {
    if (this.busy || !attachment) return null
    this.busy = true
    try {
      const draft = await this.host.composer.getDraft(session) ?? ''
      if (this.disposed || this.scope() !== scope) return null
      const current = readAttachments(draft, this.api).find(part => part.token === attachment.token)
      if (!current) throw new Error('This annotation changed. Reopen it to continue.')
      const items = id ? current.data.annotations.filter(item => item.id !== id) : []
      await this.writeDraft(session, scope, draft, replaceAttachment(draft, current, items, this.api))
      for (const item of current.data.annotations) if (!items.some(remaining => remaining.id === item.id)) this.ranges.delete(item.id)
      this.refreshHighlights()
      this.close(true)
      this.status.textContent = 'Annotation removed.'
      return items.length ? this.api.format({ ...current.data, label: `${items.length} annotation${items.length === 1 ? '' : 's'}`, annotations: items }).slice(13, -1) : null
    } catch (error) {
      this.host.notify({ kind: 'error', message: error.message })
      return null
    } finally { this.busy = false }
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
      if (!entry.range.commonAncestorContainer.isConnected || entry.range.collapsed || entry.range.toString() !== entry.text) this.ranges.delete(id)
    }
    this.observeRanges()
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
