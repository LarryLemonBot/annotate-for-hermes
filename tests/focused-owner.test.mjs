import {describe,it,expect,beforeEach,afterEach} from 'vitest'
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
    // New edits also refuse while unresolved
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
    // focusedSessionOwner intentionally absent (legacy ladder)
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
