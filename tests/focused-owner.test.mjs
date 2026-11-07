import {describe,it,expect,afterEach} from 'vitest'
import {AnnotateController} from '../desktop/plugin.js'
import {createSdk} from './sdk.mjs'

const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve()}

describe('focusedSessionOwner scope',()=>{
  let sdk,state,controller
  afterEach(()=>{controller?.dispose()})

  it('does not stage a comment into another focused owner when gateway and session IDs stay the same',async()=>{
    ;({sdk,state}=createSdk())
    let owner={connectionId:'source-a',profile:'default'}
    sdk.state.connectionId={get:()=> 'ambient-gateway'}
    sdk.state.profile={get:()=> 'default'}
    sdk.state.focusedSessionOwner={get:()=>owner}
    controller=new AnnotateController(sdk);controller.mount()
    const captured={text:'Owner A passage',session:'chat-a',scope:controller.scope(),anchor:{left:24,top:100,bottom:120}}
    controller.edit(captured)
    const input=document.querySelector('textarea');input.value='Only for owner A';input.dispatchEvent(new Event('input'))
    owner={connectionId:'source-b',profile:'default'}
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))
    await flush()
    expect(state.writes).toBe(0)
    expect(state.drafts.get('chat-a')).toBe('Existing reply  ')
  })

  it('fails closed when focusedSessionOwner resolves to null',async()=>{
    ;({sdk,state}=createSdk())
    let owner={connectionId:'source-a',profile:'default'}
    sdk.state.focusedSessionOwner={get:()=>owner}
    controller=new AnnotateController(sdk);controller.mount()
    controller.edit({text:'Owned passage',session:'chat-a',scope:controller.scope(),anchor:{left:10,top:10,bottom:20}})
    expect(document.querySelector('textarea')).toBeTruthy()
    const input=document.querySelector('textarea');input.value='Must not land';input.dispatchEvent(new Event('input'))
    owner=null
    expect(controller.scope()).toBeNull()
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))
    await flush()
    expect(state.writes).toBe(0)
    controller.edit({text:'Again',session:'chat-a',scope:JSON.stringify(['source-a','default','chat-a']),anchor:{left:10,top:10,bottom:20}})
    expect(document.querySelector('textarea')?.value ?? null).not.toBe('Again')
    expect(state.writes).toBe(0)
  })

  it('follows focusedSessionProfile when owner API is absent and ambient profile stays put',async()=>{
    ;({sdk,state}=createSdk())
    let focusedProfile='personal'
    sdk.state.connectionId={get:()=> 'local'}
    sdk.state.profile={get:()=> 'ambient-unchanged'}
    sdk.state.focusedSessionProfile={get:()=>focusedProfile}
    controller=new AnnotateController(sdk);controller.mount()
    const scopeA=controller.scope()
    expect(scopeA).toBe(JSON.stringify(['local','personal','chat-a']))
    controller.edit({text:'Personal passage',session:'chat-a',scope:scopeA,anchor:{left:10,top:10,bottom:20}})
    const input=document.querySelector('textarea');input.value='Personal only';input.dispatchEvent(new Event('input'))
    focusedProfile='work'
    expect(controller.scope()).toBe(JSON.stringify(['local','work','chat-a']))
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))
    await flush()
    expect(state.writes).toBe(0)
    expect(state.drafts.get('chat-a')).toBe('Existing reply  ')
  })
})

describe('asynchronous owner checks during draft reads',()=>{
  for (const changeAt of [1, 2]) {
    it(`preserves draft when owner changes during draft read ${changeAt}`, async () => {
      const {sdk,state}=createSdk()
      let owner={connectionId:'a',profile:'default'}
      sdk.state.focusedSessionOwner={get:()=>owner}
      const controller=new AnnotateController(sdk);controller.mount()
      const entry={text:'Synthetic passage',comment:'Only owner A',session:'chat-a',scope:controller.scope()}
      const original=sdk.composer.getDraft
      let reads=0
      sdk.composer.getDraft=async id=>{
        const result=await original(id)
        if(++reads===changeAt) owner={connectionId:'b',profile:'default'}
        return result
      }
      try {
        await expect(controller.save(entry)).rejects.toThrow(/chat changed|original chat/i)
        expect(state.writes).toBe(0)
        expect(state.drafts.get('chat-a')).toBe('Existing reply  ')
      } finally {controller.dispose()}
    })
  }

  it('restores unfinished owner A comment only after owner A returns', async () => {
    const {sdk,state}=createSdk()
    let owner={connectionId:'a',profile:'default'}
    let listener
    sdk.state.focusedSessionOwner={get:()=>owner,listen:fn=>{listener=fn;return()=>{listener=null}}}
    const controller=new AnnotateController(sdk);controller.mount()
    try {
      controller.edit({text:'Passage A',session:'chat-a',scope:controller.scope(),anchor:{left:10,top:10,bottom:20}})
      const input=document.querySelector('textarea')
      input.value='Keep owner A comment'
      input.dispatchEvent(new Event('input'))
      owner={connectionId:'b',profile:'default'}; listener()
      expect(document.querySelector('textarea')).toBeNull()
      owner=null; listener()
      expect(document.querySelector('textarea')).toBeNull()
      owner={connectionId:'a',profile:'default'}; listener()
      expect(document.querySelector('textarea').value).toBe('Keep owner A comment')
      expect(state.writes).toBe(0)
    } finally {controller.dispose()}
  })
})

describe('unchanged focused owner notifications',()=>{
  function fixture(){
    const {sdk,state,api}=createSdk()
    let owner={connectionId:'tile-source',profile:'worker'}
    let ownerListener
    sdk.state.focusedSessionOwner={get:()=>owner,listen:fn=>{ownerListener=fn;return()=>{ownerListener=null}}}
    const controller=new AnnotateController(sdk);controller.mount()
    const value=JSON.stringify({type:'response-annotations',version:1,label:'1 annotation',annotations:[{id:'one',text:'Tile passage',comment:'Saved feedback'}]})
    state.drafts.set('chat-a',api.format(JSON.parse(value)))
    return {controller,sdk,state,value,refresh(next=owner){owner={...next};ownerListener()}}
  }

  it('keeps a clicked review focused during same-owner refresh but closes on an actual owner change',async()=>{
    const {controller,state,value,refresh}=fixture()
    try {
      await controller.open({value,editable:true})
      const review=controller.panel
      expect(document.activeElement).toBe(review)
      refresh()
      expect(controller.panel).toBe(review)
      expect(document.activeElement).toBe(review)
      expect(state.writes).toBe(0)
      refresh({connectionId:'different-source',profile:'worker'})
      expect(controller.panel).toBeNull()
      expect(state.writes).toBe(0)
    } finally {controller.dispose()}
  })

  it('keeps the exact unfinished editor and caret when same-scope state emits again',()=>{
    const {controller,state,refresh}=fixture()
    try {
      controller.edit({text:'Tile passage',session:'chat-a',scope:controller.scope(),anchor:{left:30,top:100,bottom:120}})
      const input=document.querySelector('textarea')
      input.value='Unfinished tile feedback';input.dispatchEvent(new Event('input'));input.setSelectionRange(2,7)
      refresh()
      // Other subscribed host atoms can emit while the stored chat and owner stay unchanged.
      state.callbacks.forEach(listener=>listener())
      expect(document.querySelector('textarea')).toBe(input)
      expect(document.activeElement).toBe(input)
      expect([input.selectionStart,input.selectionEnd]).toEqual([2,7])
      expect(input.value).toBe('Unfinished tile feedback')
      expect(state.writes).toBe(0)
    } finally {controller.dispose()}
  })

  it('does not cancel an explicit review whose draft read overlaps an unchanged owner refresh',async()=>{
    const {controller,sdk,state,value,refresh}=fixture()
    try {
      let finish
      sdk.composer.getDraft=()=>new Promise(resolve=>{finish=resolve})
      const opening=controller.open({value,editable:true})
      refresh()
      finish(state.drafts.get('chat-a'))
      await opening
      expect(controller.panel?.dataset.afh).toBe('review')
      expect(document.activeElement).toBe(controller.panel)
      expect(state.writes).toBe(0)
    } finally {controller.dispose()}
  })
})
