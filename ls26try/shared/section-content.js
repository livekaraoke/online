/* Normalize obsolete editor prompts and section-start markers without changing song formatting. */
(function () {
  "use strict";
  const prompt = "Enter lyrics and chords here...";
  const marker = /^(?:\*\*\s*●\s*\*\*|●)[ \t\u00a0]*/;
  function cleanText(value) {
    const text = String(value || "").replace(/^[\s\u200b]*(?=(?:\*\*\s*●|●))/, "").replace(marker, "");
    return text.trim() === prompt ? "" : text;
  }
  function cleanHtml(value) {
    const root = document.createElement("div");
    root.innerHTML = String(value || "");
    function stripStart(container) {
      for (const node of [...container.childNodes]) {
        if (node.nodeType === 8) continue;
        if (node.nodeType === 3) {
          const text = node.nodeValue || "";
          if (!text.replace(/[\s\u200b]/g, "")) continue;
          node.nodeValue = text.replace(/^[\s\u200b]*(?=(?:\*\*\s*●|●))/, "").replace(marker, "");
          return true;
        }
        if (node.nodeType !== 1) continue;
        // Tab cursor dots, media and actual lists are content, not section prefixes.
        if (node.matches('.tab-block,ul,ol,img,svg,video,audio,iframe,table')) return true;
        if (node.classList.contains("section-marker") && /^\s*●?\s*$/.test(node.textContent)) {
          node.remove();
          return true;
        }
        if (stripStart(node)) {
          if (!node.textContent.trim() && !node.querySelector('img,svg,video,audio,iframe,table')) node.remove();
          return true;
        }
      }
      return false;
    }
    stripStart(root);
    if (root.textContent.trim() === prompt && !root.querySelector('img,svg,video,audio,iframe,table,.tab-block')) return "";
    return root.innerHTML;
  }
  window.LS26SectionContent = { cleanHtml, cleanText, prompt };
})();
