(function () {
  const api = window.LiveSuiteDbActivity;
  const STORAGE_KEY = api?.storageKey || "livesuite.dbActivity.v1";
  const CHANNEL_NAME = api?.channelName || "livesuite-db-activity";
  let activeFilter = "all";
  let searchTerm = "";
  let channel = null;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function readEntries() {
    try {
      api?.flush?.();
      return (JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") || [])
        .filter(item => item && typeof item === "object")
        .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
    } catch (_) {
      return [];
    }
  }

  function matches(entry) {
    if (activeFilter !== "all" && entry.kind !== activeFilter) return false;
    if (!searchTerm) return true;
    const haystack = [entry.operation, entry.target, entry.page, entry.detail, entry.projectId, entry.source]
      .join(" ").toLowerCase();
    return haystack.includes(searchTerm);
  }

  function total(entries, kind) {
    return entries
      .filter(entry => entry.kind === kind && entry.status !== "error")
      .reduce((sum, entry) => sum + Math.max(0, Number(entry.count || 0)), 0);
  }

  function shortSource(value) {
    const text = String(value || "");
    if (!text) return "—";
    const parts = text.split(" | ");
    const useful = parts.find(part => /\.js(?::\d+){1,2}/.test(part)) || parts[0] || text;
    return useful.replace(/^at\s+/, "").slice(0, 140);
  }

  function render() {
    const all = readEntries();
    const filtered = all.filter(matches);

    $("projectBadge").textContent = `Project: ${api?.projectId || window.firebase?.app?.()?.options?.projectId || "unknown"}`;
    $("readCount").textContent = total(all, "read").toLocaleString();
    $("listenCount").textContent = total(all, "listen").toLocaleString();
    $("writeCount").textContent = total(all, "write").toLocaleString();
    $("deleteCount").textContent = total(all, "delete").toLocaleString();
    $("errorCount").textContent = all.filter(entry => entry.kind === "error" || entry.status === "error").length.toLocaleString();
    $("entryCount").textContent = all.length.toLocaleString();
    $("showingLabel").textContent = `Showing ${filtered.length.toLocaleString()} of ${all.length.toLocaleString()} local entries`;

    const body = $("logsBody");
    body.innerHTML = filtered.slice(0, 1000).map(entry => {
      const d = new Date(Number(entry.ts || Date.now()));
      const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 });
      const kind = entry.kind || "unknown";
      const title = entry.source ? ` title="${esc(entry.source)}"` : "";
      return `<tr${title}>
        <td class="time">${esc(time)}</td>
        <td><span class="type-pill ${esc(kind)}">${esc(kind.toUpperCase())}</span></td>
        <td class="count">${esc(entry.count ?? 0)}</td>
        <td>${esc(entry.operation || "—")}</td>
        <td class="target">${esc(entry.target || "—")}</td>
        <td class="page">${esc(entry.page || "—")}</td>
        <td class="source">${esc(shortSource(entry.source || ""))}</td>
        <td class="detail">${esc(entry.detail || "")}</td>
      </tr>`;
    }).join("");

    $("emptyState").classList.toggle("show", filtered.length === 0);
    updateCaptureButton();
  }

  function updateCaptureButton() {
    const paused = api?.isPaused?.() === true;
    const badge = $("captureBadge");
    const btn = $("pauseBtn");
    badge.textContent = paused ? "Ⅱ PAUSED" : "● CAPTURING";
    badge.classList.toggle("live", !paused);
    badge.classList.toggle("paused", paused);
    btn.textContent = paused ? "RESUME" : "PAUSE";
  }

  function exportCsv() {
    const entries = readEntries().filter(matches);
    const rows = [["timestamp", "project", "page", "kind", "operation", "count", "target", "status", "detail", "source"]];
    for (const entry of entries) {
      rows.push([
        new Date(Number(entry.ts || 0)).toISOString(), entry.projectId || "", entry.page || "", entry.kind || "",
        entry.operation || "", entry.count ?? 0, entry.target || "", entry.status || "", entry.detail || "", entry.source || ""
      ]);
    }
    const quote = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const blob = new Blob([rows.map(row => row.map(quote).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `livesuite-db-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function bind() {
    document.querySelectorAll("[data-filter]").forEach(button => {
      button.addEventListener("click", () => {
        activeFilter = button.dataset.filter || "all";
        document.querySelectorAll("[data-filter]").forEach(x => x.classList.toggle("active", x === button));
        render();
      });
    });

    $("logSearch").addEventListener("input", event => {
      searchTerm = String(event.target.value || "").trim().toLowerCase();
      render();
    });

    $("pauseBtn").addEventListener("click", () => {
      api?.setPaused?.(!(api?.isPaused?.() === true));
      render();
    });

    $("clearBtn").addEventListener("click", () => {
      if (!confirm("Clear the local DB activity history in this browser? This does not delete anything from Firestore.")) return;
      api?.clear?.();
      render();
    });

    $("exportBtn").addEventListener("click", exportCsv);

    window.addEventListener("storage", event => {
      if (event.key === STORAGE_KEY || event.key === api?.settingsKey) render();
    });
    window.addEventListener("livesuite-db-activity", render);
    try {
      if ("BroadcastChannel" in window) {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = render;
      }
    } catch (_) {}
  }

  function requireAdmin() {
    const auth = window.LK?.auth || window.firebase?.auth?.();
    if (!auth) return;
    auth.onAuthStateChanged(user => {
      if (!user) window.location.href = "admin.html";
    });
  }

  bind();
  render();
  requireAdmin();
  setInterval(render, 1500);
})();
