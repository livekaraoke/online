/* Copyright © 2026 Roxanna. Act/session isolation shared by rendering and request writes. */
(function(root){
  'use strict';
  const norm=x=>String(x||'').trim().toLowerCase();
  const types=d=>[d?.type,d?.sessionType,d?.performerType,d?.eventSnapshot?.type,d?.eventSnapshot?.sessionType].filter(x=>String(x||'').trim());
  // Conflicting or missing act metadata fails closed. Never match venue/title text.
  const isRoxanna=d=>types(d).length>0&&types(d).every(x=>norm(x)==='roxanna');
  const sessionId=c=>String(c?.sessionId||c?.activeSessionId||'').trim();
  function live(c,s,id){return c?.active===true&&!!id&&sessionId(c)===id&&isRoxanna(s)&&(!types(c).length||isRoxanna(c))&&!s.endedAt&&!['ended','completed','cancelled'].includes(norm(s.status));}
  const queue=(c,s,id,r)=>live(c,s,id)&&String(r?.sessionId||'')===id&&Array.isArray(r.items)?r.items:[];
  const policy={norm,isRoxanna,sessionId,live,queue,types};
  if(typeof module!=='undefined'&&module.exports)module.exports=policy;else root.RoxannaPolicy=policy;
})(typeof window==='undefined'?globalThis:window);
