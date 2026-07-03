requireAuth(async user => {
  renderShell('dashboard'); mobileNav('dashboard');
  const hiveId = await ensureHive(user); setHiveId(hiveId);
  const hive = await loadHiveHeader(user, hiveId);
  renderMembers(hive);
  listenDashboard(hiveId);
});
function renderMembers(hive){ const el=$('members'); const members=Object.values(hive.members||{}); el.innerHTML=members.map(m=>`<div class="member"><img src="${escapeHtml(m.photoURL||'')}" class="avatar"><div><b>${escapeHtml(m.displayName||m.email)}</b><div class="small">${escapeHtml(m.email)} · ${escapeHtml(m.role||'member')}</div></div></div>`).join('') || '<p class="muted">No members yet.</p>'; }
async function inviteMemberPrompt(){ const email=(await showModal('Invite member','<input id="inviteEmail" placeholder="partner@gmail.com">',[{label:'Cancel',value:false},{label:'Invite',value:true,className:'primary'}])); if(!email) return; const val=normalizeEmail(document.getElementById('inviteEmail').value); if(!val) return; const hiveId=getHiveId(); await db.collection('hives').doc(hiveId).update({inviteEmails:firebase.firestore.FieldValue.arrayUnion(val),updatedAt:firebase.firestore.FieldValue.serverTimestamp()}); toast('Invitation added. They can sign in with that email and join.'); }
function listenDashboard(hiveId){
  const cards=[['shopping','🛒','Shopping List','shopping.html','items'],['events','📅','Calendar','calendar.html','events'],['notes','📝','Notes','notes.html','notes'],['links','🔗','Link Share','links.html','links'],['photos','🖼️','Photos','photos.html','photos'],['tasks','✅','Tasks','shopping.html','tasks']];
  const data={}; cards.forEach(([col])=> db.collection('hives').doc(hiveId).collection(col).limit(8).onSnapshot(s=>{ data[col]=[]; s.forEach(d=>data[col].push({id:d.id,...d.data()})); renderCards(cards,data); if(col==='events') renderUpcoming(data[col]); }));
}
function renderCards(cards,data){ $('dashboardCards').innerHTML=cards.map(([col,icon,title,href,label])=>{ const arr=data[col]||[]; return `<a class="card" href="${href}"><h3>${icon} ${title}<span class="badge">${arr.length} ${label}</span></h3><div class="list">${arr.slice(0,4).map(x=>`<div class="check-row"><span class="check ${x.done?'done':''}"></span><span>${escapeHtml(x.title||x.name||x.url||'Untitled')}</span></div>`).join('')||'<p class="muted">Nothing yet.</p>'}</div><p class="muted">View all ›</p></a>`; }).join(''); }
function renderUpcoming(events){ const arr=(events||[]).sort((a,b)=>(a.start||'').localeCompare(b.start||'')).slice(0,5); $('upcomingEvents').innerHTML=arr.map(e=>`<div class="item"><div class="badge">${escapeHtml(dayDate(e.start))}</div><div><div class="item-title">${escapeHtml(e.title)}</div><div class="item-meta">${escapeHtml(e.startTime||'')}</div></div></div>`).join('')||'<p class="muted">No events.</p>'; }
