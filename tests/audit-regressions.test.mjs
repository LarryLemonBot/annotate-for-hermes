import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {AnnotateController,readAttachments} from '../desktop/plugin.js'
import {createSdk} from './sdk.mjs'

let controller,sdk,state,api
const captured=text=>({text,session:'chat-a',anchor:{left:30,top:100,bottom:120}})
const type=comment=>{const input=document.querySelector('textarea');input.value=comment;input.dispatchEvent(new Event('input'));return input}
beforeEach(()=>{document.body.replaceChildren();({sdk,state,api}=createSdk());sdk.composer.focus=vi.fn();controller=new AnnotateController(sdk);controller.mount()})
afterEach(()=>controller.dispose())

describe('audit interaction regressions',()=>{
  it.each(['Home','End','PageUp','PageDown','ArrowLeft','ArrowRight'])('offers a valid selection after Shift+%s without intercepting typing',key=>{
    api.captureSelection=()=>captured('Selected passage')
    document.dispatchEvent(new KeyboardEvent('keyup',{key,shiftKey:true,bubbles:true}))
    expect(document.querySelector('[aria-label="Add to chat"]')).not.toBeNull()
    controller.edit(captured('Selected passage'))
    const input=type('Feedback')
    input.dispatchEvent(new KeyboardEvent('keyup',{key,shiftKey:true,bubbles:true}))
    expect(controller.toolbar).toBeNull()
    expect(document.activeElement).toBe(input)
  })
  it('moves the editor with its live passage and preserves unfinished work when clipped',()=>{
    const paragraph=document.createElement('p');paragraph.textContent='Selected passage';document.body.append(paragraph)
    const range=document.createRange();range.selectNodeContents(paragraph)
    let top=100
    range.getClientRects=()=>[{left:30,right:180,top,bottom:top+20}]
    controller.edit({...captured(paragraph.textContent),range})
    type('Keep this comment')
    const before=controller.panel.style.top
    top=200;document.dispatchEvent(new Event('scroll'))
    expect(controller.panel.style.top).not.toBe(before)
    top=-200;document.dispatchEvent(new Event('scroll'))
    expect(controller.panel).toBeNull()
    expect(controller.pending.get(controller.scope()).comment).toBe('Keep this comment')
    controller.edit(captured('Another selection'))
    expect(controller.panel.getAttribute('aria-label')).toBe('Unfinished comment')
    top=200;document.querySelector('[aria-label="Resume the unsaved comment"]').click()
    expect(document.querySelector('textarea').value).toBe('Keep this comment')
  })
  it('resolves unfinished work before explicit chip review and leaves passive previews harmless',async()=>{
    const payload={type:'response-annotations',version:1,label:'1 annotation',annotations:[{id:'one',text:'First',comment:''}]}
    state.drafts.set('chat-a',api.format(payload))
    const request={value:readAttachments(state.drafts.get('chat-a'),api)[0].value,editable:true}
    controller.edit(captured('Second'));const input=type('Still typing')
    for(const interaction of ['hover','focus'])await controller.open({...request,interaction})
    expect(document.activeElement).toBe(input)
    await controller.open(request)
    expect(controller.panel.getAttribute('aria-label')).toBe('Unfinished comment')
    document.querySelector('[aria-label="Resume the unsaved comment"]').click()
    expect(document.querySelector('textarea').value).toBe('Still typing')
    await controller.open(request)
    document.querySelector('[aria-label="Discard it and review annotations"]').click()
    for(let i=0;i<12;i++)await Promise.resolve()
    expect(controller.panel.dataset.afh).toBe('review')
    expect(controller.pending.size).toBe(0)
    expect(state.writes).toBe(0)
  })
  it('provides keyboard reachable close controls and restores composer focus',async()=>{
    controller.edit(captured('Passage'))
    const cancel=document.querySelector('[aria-label="Cancel annotation"]')
    expect(cancel.tabIndex).toBe(0)
    cancel.focus();cancel.click()
    expect(controller.panel).toBeNull();expect(sdk.composer.focus).toHaveBeenLastCalledWith('chat-a')
    const value=JSON.stringify({type:'response-annotations',version:1,label:'1 annotation',annotations:[{id:'one',text:'First',comment:''}]})
    await controller.open({value,editable:false})
    const close=document.querySelector('[aria-label="Close annotations"]')
    expect(close.tabIndex).toBe(0)
    close.focus();close.click()
    expect(controller.panel).toBeNull();expect(sdk.composer.focus).toHaveBeenCalledTimes(2)
  })
  it('resolves unfinished work before clearing a chip and preserves the ordinary reply',async()=>{
    const payload={type:'response-annotations',version:1,label:'1 annotation',annotations:[{id:'one',text:'First',comment:'Saved feedback'}]}
    const original=api.format(payload)+'\n\nExisting reply  '
    state.drafts.set('chat-a',original)
    const request={value:readAttachments(original,api)[0].value,editable:true,remove:true}
    controller.edit(captured('Second'));type('Unfinished feedback')
    await controller.open(request)
    expect(state.drafts.get('chat-a')).toBe(original)
    expect(state.writes).toBe(0)
    expect(controller.panel.getAttribute('aria-label')).toBe('Unfinished comment')
    document.querySelector('[aria-label="Resume the unsaved comment"]').click()
    expect(document.querySelector('textarea').value).toBe('Unfinished feedback')
    await controller.open(request)
    expect(state.drafts.get('chat-a')).toBe(original)
    document.querySelector('[aria-label="Discard it and remove annotations"]').click()
    for(let i=0;i<12;i++)await Promise.resolve()
    expect(state.drafts.get('chat-a')).toBe('Existing reply  ')
    expect(state.writes).toBe(1)
    expect(controller.pending.size).toBe(0)
  })
  it('ignores an unrelated carousel scroll but dismisses when the draft chip ancestor scrolls',async()=>{
    const owner=document.createElement('section'),carousel=document.createElement('div'),chip=document.createElement('button')
    owner.append(chip);document.body.append(owner,carousel)
    const descriptor=Object.getOwnPropertyDescriptor(document,'elementsFromPoint')
    Object.defineProperty(document,'elementsFromPoint',{configurable:true,value:()=>[chip,owner,document.body]})
    const payload={type:'response-annotations',version:1,label:'1 annotation',annotations:[{id:'one',text:'Tile passage',comment:'Feedback'}]}
    state.drafts.set('chat-a',api.format(payload))
    try {
      await controller.open({value:JSON.stringify(payload),editable:true,anchor:{left:30,top:100,bottom:120,width:100}})
      const review=controller.panel
      carousel.dispatchEvent(new Event('scroll'))
      expect(controller.panel).toBe(review)
      expect(document.activeElement).toBe(review)
      owner.dispatchEvent(new Event('scroll'))
      expect(controller.panel).toBeNull()
      expect(state.writes).toBe(0)
    } finally {
      if(descriptor)Object.defineProperty(document,'elementsFromPoint',descriptor)
      else delete document.elementsFromPoint
    }
  })
  it('tracks a focused sent-chip opener without an anchor and still dismisses on document scroll',async()=>{
    const owner=document.createElement('section'),unrelated=document.createElement('div'),chip=document.createElement('button')
    owner.append(chip);document.body.append(owner,unrelated)
    const value=JSON.stringify({type:'response-annotations',version:1,label:'1 annotation',annotations:[{id:'one',text:'Sent passage',comment:''}]})
    chip.focus()
    await controller.open({value,editable:false})
    const review=controller.panel
    unrelated.dispatchEvent(new Event('scroll'))
    expect(controller.panel).toBe(review)
    owner.dispatchEvent(new Event('scroll'))
    expect(controller.panel).toBeNull()
    chip.focus();await controller.open({value,editable:false})
    document.dispatchEvent(new Event('scroll'))
    expect(controller.panel).toBeNull()
    expect(state.writes).toBe(0)
  })
})
