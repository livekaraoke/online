#!/usr/bin/env python3
"""Apply a narrow, checked change to LiveSuite's existing status-bar controller."""
from pathlib import Path

controller = Path("ls26try/admin-new/js/top-statusbar-session-tools.js")
css_path = Path("ls26try/admin-new/css/top-statusbar-session-tools.css")
source = controller.read_text()

def replace_once(old, new):
    global source
    if source.count(old) != 1:
        raise SystemExit(f"Expected one match, found {source.count(old)}: {old[:75]}")
    source = source.replace(old, new)

replace_once(
    "  function renderRemaining() {",
    """  // Scheduled end is extended by any actual late start, without modifying
  // the original booking. An explicit host-edited projected end takes priority.
  function remainingTarget(schedule, actualStart, projectedEnd) {
    if (projectedEnd) return projectedEnd;
    if (!schedule.end) return null;
    const lateMs = schedule.start && actualStart
      ? Math.max(0, actualStart.getTime() - schedule.start.getTime())
      : 0;
    return new Date(schedule.end.getTime() + lateMs);
  }

  function remainingColour(ms) {
    if (!Number.isFinite(ms)) return "";
    if (ms < 0) return "is-overdue";
    return ms <= 15 * 60 * 1000 ? "is-warning" : "is-normal";
  }

  function renderRemaining() {"""
)

replace_once(
    '''    const setValueState = (el, ms) => {
      if (!el) return;
      if (!Number.isFinite(ms)) {
        el.textContent = "-";
        el.classList.remove("is-overdue", "is-remaining");
        return;
      }
      const overdue = ms <= -300000;
      const value=shortDuration(ms);if(el.textContent!==value)el.textContent=value;
      el.classList.toggle("is-overdue", overdue);
      el.classList.toggle("is-remaining", !overdue);
    };''',
    '''    const setValueState = (el, ms) => {
      if (!el) return;
      const colour = remainingColour(ms);
      el.classList.remove("is-overdue", "is-remaining", "is-warning", "is-normal");
      if (!colour) {
        el.textContent = "-";
        return;
      }
      const value=shortDuration(ms);if(el.textContent!==value)el.textContent=value;
      el.classList.add(colour);
    };'''
)

replace_once(
    '''    // Scheduled commitment stays fixed unless the host explicitly edits the target.
    const target=tsDate(state.session?.projectedEndAt)||schedule.end;''',
    '''    // Countdown uses scheduled end + start delay, unless the host edited the end.
    const explicitEnd = tsDate(state.session?.projectedEndAt || state.currentControl?.projectedEndAt);
    const target = remainingTarget(schedule, actualStart, explicitEnd);'''
)

replace_once(
    'if (delay > 0) adjustedHint.textContent = `Started ${delay} min${delay === 1 ? "" : "s"} late • scheduled finish unchanged`;',
    'if (explicitEnd) adjustedHint.textContent = "Host-adjusted projected finish";\n        else if (delay > 0) adjustedHint.textContent = `Started ${delay} min${delay === 1 ? "" : "s"} late • finish extended`;'
)
replace_once(
    'else if (delay < 0) adjustedHint.textContent = `Started ${Math.abs(delay)} min${Math.abs(delay) === 1 ? "" : "s"} early • scheduled finish unchanged`;',
    'else if (delay < 0) adjustedHint.textContent = `Started ${Math.abs(delay)} min${Math.abs(delay) === 1 ? "" : "s"} early • scheduled finish retained`;'
)

styles = css_path.read_text()
marker = "/* Remaining colour thresholds: use late-adjusted finish. */"
if marker in styles:
    raise SystemExit("Colour patch already applied")
styles += """
""" + marker + """
#topStatusBar #tsCompactRemaining.is-normal,
#topStatusBar #tsAdjustedRemainingTime.is-normal,
#topStatusBar #tsRemainingTime.is-normal {
  color: #38bdf8 !important;
  text-shadow: none !important;
}
#topStatusBar #tsCompactRemaining.is-warning,
#topStatusBar #tsAdjustedRemainingTime.is-warning,
#topStatusBar #tsRemainingTime.is-warning {
  color: #f2cf4d !important;
  text-shadow: none !important;
}
#topStatusBar #tsCompactRemaining.is-overdue,
#topStatusBar #tsAdjustedRemainingTime.is-overdue,
#topStatusBar #tsRemainingTime.is-overdue {
  color: #ff4b55 !important;
  text-shadow: 0 0 8px rgba(255,75,85,.14) !important;
}
"""

controller.write_text(source)
css_path.write_text(styles)
print("Patched remaining-time target and blue/amber/red thresholds")
