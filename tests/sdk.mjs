export const host = {}
export function createSdk() {
  const state = {session:'chat-a',drafts:new Map([['chat-a','Existing reply  '],['chat-b','Other chat']]),fail:false,submits:0,callbacks:[],notices:[],reads:0,writes:0}
  const api = {
    version:1,
    captureSelection:()=>null,
    parse(value) { try { const p=JSON.parse(value); return p.type==='response-annotations' && p.version===1 && p.annotations.length>0 && p.annotations.length<=100 && p.annotations.every(a=>a.text && a.text.length<=64000 && a.comment.length<=64000) ? p : null } catch { return null } },
    format(value) { if(!this.parse(JSON.stringify(value))) throw new Error('Annotation limit reached.'); return '@annotation:`'+JSON.stringify(value).replace(/[`@<>/]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'`' },
    onOpen(fn) {state.open=fn;return()=>{state.open=null}}
  }
  const sdk={state:{focusedStoredSessionId:{get:()=>state.session,listen:fn=>{state.callbacks.push(fn);return()=>{state.callbacks=state.callbacks.filter(f=>f!==fn)}}},focusedSessionId:{get:()=>state.session}},notify:n=>state.notices.push(n),composer:{annotations:api,getDraft:async sid=>{state.reads++;return state.drafts.get(sid)||null},setDraft:async(sid,text)=>{state.writes++;if(state.fail||sid!==state.session)return false;state.drafts.set(sid,text);return true},focus:()=>{},submit:()=>{state.submits++}}}
  return {sdk,state,api}
}
