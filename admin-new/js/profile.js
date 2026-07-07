(function () {
  async function ensureMyProfile(user) {
    const ref = LK.db.collection("userProfiles").doc(user.uid);
    const snap = await ref.get();
    const defaultRole = user.email?.toLowerCase() === LK.OWNER_EMAIL.toLowerCase() ? "Admin" : "Member";

    if (!snap.exists) {
      await ref.set({
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || user.email || "User",
        photoURL: user.photoURL || "",
        phone: "",
        bio: "",
        role: defaultRole,
        isOwner: user.email?.toLowerCase() === LK.OWNER_EMAIL.toLowerCase(),
        createdAt: serverNow(),
        updatedAt: serverNow(),
        lastLoginAt: serverNow()
      }, { merge: true });
    } else {
      const patch = { email: user.email || "", lastLoginAt: serverNow(), updatedAt: serverNow() };
      if (user.email?.toLowerCase() === LK.OWNER_EMAIL.toLowerCase()) patch.role = "Admin";
      await ref.set(patch, { merge: true });
    }

    const fresh = await ref.get();
    LK.state.currentUserProfile = { id: fresh.id, ...fresh.data() };
  }

  function applyProfileToDashboard() {
    const p = LK.state.currentUserProfile || {};
    const displayName = p.displayName || p.email || LK.auth.currentUser?.email || "Admin";
    const role = p.role || "Member";

    if ($("adminUserName")) $("adminUserName").innerText = displayName;
    if ($("adminUserRole")) $("adminUserRole").innerText = role;

    const img = $("sidebarProfileImg");
    const fallback = $("sidebarProfileFallback");
    if (img && fallback) {
      if (p.photoURL) {
        img.src = p.photoURL;
        img.style.display = "block";
        fallback.style.display = "none";
      } else {
        img.src = "";
        img.style.display = "none";
        fallback.style.display = "grid";
      }
    }

    const membersPanel = $("membersPanel");
    const membersNav = $("membersNavLink");
    const showMembers = isOwner();
    if (membersPanel) membersPanel.style.display = showMembers ? "block" : "none";
    if (membersNav) membersNav.style.display = showMembers ? "block" : "none";
  }

  function openProfileModal() {
    const p = LK.state.currentUserProfile || {};
    $("profileDisplayName").value = p.displayName || "";
    $("profilePhotoURL").value = p.photoURL || "";
    $("profilePhone").value = p.phone || "";
    $("profileBio").value = p.bio || "";
    $("profileEmailLabel").innerText = p.email || LK.auth.currentUser?.email || "-";
    $("profileRoleLabel").innerText = p.role || "Member";
    $("profilePreviewName").innerText = p.displayName || p.email || "Profile";
    $("profilePreviewRole").innerText = p.role || "Member";
    const img = $("profilePreviewImg");
    img.src = p.photoURL || "";
    img.style.display = p.photoURL ? "block" : "none";
    $("profileModal").classList.remove("hidden");
  }

  function closeProfileModal() {
    $("profileModal").classList.add("hidden");
  }

  async function saveMyProfile() {
    const user = LK.auth.currentUser;
    if (!user) return;
    const ref = LK.db.collection("userProfiles").doc(user.uid);
    await ref.set({
      displayName: $("profileDisplayName").value.trim() || user.email || "User",
      photoURL: $("profilePhotoURL").value.trim(),
      phone: $("profilePhone").value.trim(),
      bio: $("profileBio").value.trim(),
      updatedAt: serverNow()
    }, { merge: true });

    const fresh = await ref.get();
    LK.state.currentUserProfile = { id: fresh.id, ...fresh.data() };
    applyProfileToDashboard();
    closeProfileModal();
    LK.dashboard.logAdmin("Profile saved.");
  }

  LK.profile = { ensureMyProfile, applyProfileToDashboard, openProfileModal, closeProfileModal, saveMyProfile };
  window.openProfileModal = openProfileModal;
  window.closeProfileModal = closeProfileModal;
  window.saveMyProfile = saveMyProfile;
})();
