/* Optional helper for the existing lyricscreator page.
   Load this AFTER lyricscreator.js. It adds a button for standalone singer-visible performance cues. */
window.addEventListener("DOMContentLoaded", () => {
  const saveButton = document.getElementById("saveSectionBtn");
  if (!saveButton || typeof renderPreview !== "function") return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn performance-note-helper-btn";
  button.textContent = "＋ Performance Note";
  button.onclick = () => {
    const text = prompt("Singer-visible performance note (for example: Short instrumental — wait for signal)");
    if (!text || !text.trim()) return;
    songData.sections.push({
      type: "performanceNote",
      title: "PERFORMANCE NOTE",
      text: text.trim(),
      html: `<div class="performance-note-line">${String(text).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>`,
      collapsed: false,
      style: { fontFamily: "Verdana", color: "#41e37a", isTab: false }
    });
    renderPreview();
  };
  saveButton.parentElement?.appendChild(button);
});
