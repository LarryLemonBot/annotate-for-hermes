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
