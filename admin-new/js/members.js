(function () {
  function loadAllMembers() {
    if (!isOwner()) return;
    if (LK.state.membersUnsubscribe) LK.state.membersUnsubscribe();
    LK.state.membersUnsubscribe = LK.db.collection("userProfiles").onSnapshot(snap => {
      LK.state.allMembers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      LK.state.allMembers.sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || ""));
      renderMembersList();
    });
  }

  function renderMembersList() {
    const box = $("membersList");
    if (!box) return;
    const search = ($("memberSearchInput")?.value || "").toLowerCase().trim();
    const members = LK.state.allMembers.filter(m => `${m.displayName || ""} ${m.email || ""} ${m.role || ""}`.toLowerCase().includes(search));

    if (!members.length) {
      box.innerHTML = `<div class="request-empty">No users found</div>`;
      return;
    }

    box.innerHTML = members.map(m => `
      <div class="member-row">
        <div class="member-avatar">${m.photoURL ? `<img src="${LK.dashboard.escapeHTML(m.photoURL)}" alt="">` : "👤"}</div>
        <div class="member-main"><strong>${LK.dashboard.escapeHTML(m.displayName || m.email || "User")}</strong><span>${LK.dashboard.escapeHTML(m.email || "")}</span></div>
        <div class="member-role">${LK.dashboard.escapeHTML(m.role || "Member")}</div>
        <div class="member-last">${m.lastLoginAt ? LK.dashboard.formatDate(LK.dashboard.getDateFromTimestamp(m.lastLoginAt)) : "-"}</div>
        <button class="member-edit-btn" onclick="openMemberModal('${m.id}')">Edit</button>
      </div>`).join("");
  }

  function openMemberModal(uid) {
    if (!isOwner()) return;
    const m = LK.state.allMembers.find(x => x.id === uid);
    if (!m) return;
    $("memberUidInput").value = uid;
    $("memberEmailInput").value = m.email || "";
    $("memberDisplayNameInput").value = m.displayName || "";
    $("memberRoleInput").value = m.email?.toLowerCase() === LK.OWNER_EMAIL.toLowerCase() ? "Admin" : (m.role || "Member");
    $("memberPhotoInput").value = m.photoURL || "";
    $("memberAdminNotesInput").value = m.adminNotes || "";
    $("memberRoleInput").disabled = m.email?.toLowerCase() === LK.OWNER_EMAIL.toLowerCase();
    $("memberModal").classList.remove("hidden");
  }

  function closeMemberModal() {
    $("memberModal").classList.add("hidden");
  }

  async function saveMemberFromModal() {
    if (!isOwner()) return;
    const uid = $("memberUidInput").value;
    if (!uid) return;
    const email = $("memberEmailInput").value;
    const forcedRole = email?.toLowerCase() === LK.OWNER_EMAIL.toLowerCase() ? "Admin" : $("memberRoleInput").value;

    await LK.db.collection("userProfiles").doc(uid).set({
      displayName: $("memberDisplayNameInput").value.trim(),
      role: forcedRole,
      photoURL: $("memberPhotoInput").value.trim(),
      adminNotes: $("memberAdminNotesInput").value.trim(),
      roleUpdatedBy: LK.auth.currentUser?.email || "",
      roleUpdatedAt: serverNow(),
      updatedAt: serverNow()
    }, { merge: true });

    closeMemberModal();
    LK.dashboard.logAdmin("Member updated.");
  }

  function initMembers() {
    if (isOwner()) loadAllMembers();
  }

  LK.members = { initMembers, loadAllMembers, renderMembersList };
  window.loadAllMembers = loadAllMembers;
  window.renderMembersList = renderMembersList;
  window.openMemberModal = openMemberModal;
  window.closeMemberModal = closeMemberModal;
  window.saveMemberFromModal = saveMemberFromModal;
})();
