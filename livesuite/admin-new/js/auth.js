(function () {
  async function adminLogin() {
    const email = $("emailInput")?.value.trim() || "";
    const password = $("passwordInput")?.value || "";
    const error = $("passwordError");
    if (error) error.textContent = "Checking...";
    try {
      await LK.auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      console.error(err);
      if (error) error.textContent = "Incorrect email or password";
    }
  }

  function adminLogout() {
    LK.auth.signOut();
  }

  function initAuth() {
    LK.auth.onAuthStateChanged(async user => {
      if (user) {
        $("passwordGate").style.display = "none";
        $("adminContent").style.display = "grid";
        await LK.profile.ensureMyProfile(user);
        LK.profile.applyProfileToDashboard();
        LK.sessions.initSessions();
        LK.requests.initRequests();
        if (isOwner()) LK.members.loadAllMembers();
        LK.dashboard.logAdmin("Logged in as: " + (user.email || "unknown"));
      } else {
        $("passwordGate").style.display = "flex";
        $("adminContent").style.display = "none";
      }
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Enter" && $("passwordGate")?.style.display !== "none") adminLogin();
    });
  }

  LK.authModule = { initAuth, adminLogin, adminLogout };
  window.adminLogin = adminLogin;
  window.adminLogout = adminLogout;
})();
