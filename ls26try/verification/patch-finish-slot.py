from pathlib import Path
p=Path('ls26try/admin-new/js/top-statusbar-session-tools.js')
s=p.read_text()
old='const destination=slot&&panel&&!panel.hidden?slot:row;'
new='const destination=slot||row;'
if s.count(old)!=1:raise ValueError('Unexpected statusbar finish-placement implementation')
p.write_text(s.replace(old,new))
p=Path('ls26try/shared/performance-tools-ui.js')
s=p.read_text()
old='const finishDestination=completeView?finishSlot:row;'
new='const finishDestination=finishSlot||row;'
if s.count(old)!=1:raise ValueError('Unexpected performance finish placement')
p.write_text(s.replace(old,new))
print('LyricView FINISH & NEXT removed from top row and mounted at Song Complete only')
