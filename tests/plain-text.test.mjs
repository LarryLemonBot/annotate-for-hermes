import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest'
import {AnnotateController,readAttachments,plainTextAnnotations,formatPlainText,neutralizeReferences} from '../desktop/plugin.js'
import {createSdk} from './sdk.mjs'

// Stock Hermes: the desktop has no host.composer.annotations API.
// Hermes v0.23.2's own reference matcher (apps/desktop/src/components/assistant-ui/reference-kinds.ts).
const HERMES_REFERENCE=/@(file|folder|url|image|tool|line|terminal|session):(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)/g
let controller,state,sdk
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()}
const capture=(text='Selected passage')=>({text,session:state.session,anchor:{left:24,top:200,bottom:220}})
const comment=async text=>{const input=document.querySelector('textarea.afh-input');input.value=text;input.dispatchEvent(new Event('input'));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await flush()}
const blocks=()=>readAttachments(state.drafts.get(state.session),controller.api)
const select=element=>{const range=document.createRange();range.selectNodeContents(element);const s=getSelection();s.removeAllRanges();s.addRange(range);return range}

beforeEach(()=>{
  document.body.innerHTML=''
  ;({sdk,state}=createSdk())
  delete sdk.composer.annotations
  Range.prototype.getClientRects=()=>[{left:10,top:40,bottom:60,right:200}]
  controller=new AnnotateController(sdk);controller.mount()
})
afterEach(()=>{controller.dispose();delete Range.prototype.getClientRects;getSelection().removeAllRanges()})

describe('stock Hermes (no annotation API)',()=>{
  it('runs in plain-text mode instead of showing the compatibility notice',()=>{
    expect(controller.api.mode).toBe('plain-text')
    expect(state.notices).toEqual([])
    expect(document.querySelector('[data-afh="status"]')).not.toBeNull()
  })

  it('captures a transcript selection with the browser Selection API only',()=>{
    const p=document.createElement('p');p.textContent='The roof needs new flashing.';document.body.append(p)
    select(p)
    const selected=controller.api.captureSelection()
    expect(selected.text).toBe('The roof needs new flashing.')
    expect(selected.anchor).toEqual({left:10,top:40,bottom:60})
  })

  it('ignores the composer, other inputs, its own UI and empty selections',()=>{
    const editable=document.createElement('div');editable.setAttribute('contenteditable','true');editable.textContent='my draft';document.body.append(editable)
    select(editable);expect(controller.api.captureSelection()).toBeNull()
    const own=document.createElement('div');own.dataset.afh='toolbar';own.textContent='Add to chat';document.body.append(own)
    select(own);expect(controller.api.captureSelection()).toBeNull()
    const blank=document.createElement('p');blank.textContent='   ';document.body.append(blank)
    select(blank);expect(controller.api.captureSelection()).toBeNull()
    getSelection().removeAllRanges();expect(controller.api.captureSelection()).toBeNull()
  })

  it('offers the toolbar after a mouse selection in a reply',()=>{
    const p=document.createElement('p');p.textContent='Use ice and water shield.';document.body.append(p)
    select(p);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))
    expect(document.querySelector('[data-afh="toolbar"] .afh-add')).not.toBeNull()
  })

  it('collects several comments in one readable block and keeps the reply text',async()=>{
    controller.edit(capture('First passage'));await comment('Too vague')
    controller.edit(capture('Second\n\n  indented line'));await comment('')
    const draft=state.drafts.get(state.session)
    expect(blocks()).toHaveLength(1)
    expect(blocks()[0].data.annotations.map(a=>a.comment)).toEqual(['Too vague',''])
    expect(draft).toBe('Comments on your reply (2):\n\n**1.**\n> First passage\n\nToo vague\n\n**2.**\n> Second\n>\n>   indented line\n\n(no comment)\n\n(end of comments)\n\nExisting reply  ')
    expect(state.submits).toBe(0)
  })

  it('never lets quoted text or comments become Hermes references',async()=>{
    controller.edit(capture('See @file:/etc/passwd and @url:`https://x.test`'));await comment('also @folder:~/secrets')
    const draft=state.drafts.get(state.session)
    expect([...draft.matchAll(HERMES_REFERENCE)]).toEqual([])
    expect(draft.replaceAll('\u2060','')).toContain('@file:/etc/passwd')
    expect(neutralizeReferences('mail me @ home, @file:x')).toBe('mail me @ home, @\u2060file:x')
  })

  it('removes one comment, then all of them, restoring the original reply exactly',async()=>{
    controller.edit(capture('One'));await comment('c1')
    controller.edit(capture('Two'));await comment('c2')
    const first=blocks()[0]
    const remaining=await controller.remove(state.session,first,first.data.annotations[0].id)
    expect(remaining).toBe(blocks()[0].value)
    expect(blocks()[0].data.annotations.map(a=>a.text)).toEqual(['Two'])
    await controller.remove(state.session,blocks()[0],null)
    expect(state.drafts.get(state.session)).toBe('Existing reply  ')
  })

  it('leaves a block the user edited by hand alone and starts a new one',async()=>{
    controller.edit(capture('One'));await comment('c1')
    state.drafts.set(state.session,state.drafts.get(state.session).replace('c1','my own words'))
    const edited=state.drafts.get(state.session)
    controller.edit(capture('Two'));await comment('c2')
    const draft=state.drafts.get(state.session)
    expect(draft.endsWith(edited)).toBe(true)
    expect(blocks()).toHaveLength(1)
    expect(blocks()[0].data.annotations.map(a=>a.text)).toEqual(['Two'])
  })

  it('keeps the same size limits as the native API',()=>{
    expect(()=>formatPlainText({annotations:Array.from({length:1001},(_,i)=>({id:String(i),text:'t',comment:''}))})).toThrow(/limit/)
    expect(()=>formatPlainText({annotations:[{id:'a',text:'x'.repeat(64001),comment:''}]})).toThrow(/limit/)
    expect(()=>formatPlainText({annotations:[{id:'a',text:'x',comment:''},{id:'a',text:'y',comment:''}]})).toThrow(/limit/)
    expect(plainTextAnnotations().parse('not ours')).toBeNull()
  })

  it('still prefers the native API when the desktop has it',()=>{
    const native=createSdk()
    const other=new AnnotateController(native.sdk)
    expect(other.api).toBe(native.api)
  })
})
