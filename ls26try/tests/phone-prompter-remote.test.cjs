const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname,"..");
const read = file => fs.readFileSync(path.join(root,file),"utf8");
const html=read("admin-new/prompter-remote.html");
const style=read("admin-new/css/prompter-remote-phone.css");
const pageJS=read("admin-new/js/prompter-remote-phone.js");
const sender=read("host/js/lyricview-prompter-remote.js");
const sidebar=read("admin-new/includes/sidebar.html");
const sidebarJS=read("admin-new/js/sidebar.js");
const receiver=read("oldadmin/host/lyrics/prompter-remote-receiver.js");

test("Admin TOOLS links to a dedicated phone Prompter Remote",()=>{
  const tools=sidebar.slice(sidebar.indexOf("tools-title"),sidebar.indexOf("music-title"));
  assert.match(tools,/href="prompter-remote\.html" data-sidebar-nav="prompter-remote"/);
  assert.match(tools,/>Prompter Remote<\/span>/);
  assert.match(html,/id="phonePrompterRemoteMount"/);
  assert.match(html,/id="ls26ShowPrompterRemote"/);
  assert.match(html,/host\/js\/lyricview-prompter-remote\.js/);
  assert.match(html,/css\/prompter-remote-phone\.css/);
  assert.match(sidebarJS,/page === "prompter-remote\.html"/);
});

test("phone page embeds the authoritative sender, not duplicated Firestore commands",()=>{
  assert.match(sender,/const phoneMount=document\.getElementById\('phonePrompterRemoteMount'\)/);
  assert.match(sender,/\(phoneMount\|\|document\.body\)\.append\(panel\)/);
  assert.match(sender,/if\(!phoneMount\)enableDragging\(\)/);
  assert.match(sender,/collection\('karaokeControl'\)\.doc\('liveLyrics'\)/);
  assert.match(receiver,/collection\('karaokeControl'\)\.doc\('liveLyrics'\)/);
  assert.match(receiver,/const valid=new Set\(\['status','toggle','slower','faster','up','down','instrumental','song'\]\)/);
  assert.doesNotMatch(pageJS,/prompterRemoteCommand|collection\(|BroadcastChannel|localStorage\.setItem/);
  assert.match(pageJS,/ls26:prompter-remote-visibility/);
  assert.match(html,/START SONG reveals the lyrics without starting scrolling/);
});

test("phone controls are owner-only and offer usable mobile touch targets",()=>{
  assert.match(pageJS,/Boolean\(user && window\.isOwner\?\.\(\)\)/);
  assert.match(pageJS,/setRemoteVisible\(owner\)/);
  assert.match(pageJS,/onAuthStateChanged\(applyAuth/);
  assert.match(style,/max-width:699px/);
  assert.match(style,/min-height:83px!important/);
  assert.match(style,/min-height:66px!important/);
  assert.match(style,/phone-remote-menu-open/);
  assert.match(html,/A successful Firestore send does not confirm/);
});
