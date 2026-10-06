/* Public gigs use Malta wall time; Date/Firestore Timestamp values are instants. */
(function (root) {
  'use strict';
  const zone = 'Europe/Malta';
  const partsFormat = new Intl.DateTimeFormat('en-GB', {timeZone:zone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const cache = new Map();
  function parts(date) {
    return Object.fromEntries(partsFormat.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  }
  function wallMillis(p) { return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second); }
  function localDate(date) {
    const p = parts(date);
    return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
  }
  function localInstant(day, time = '00:00') {
    const key = `${day}T${time}`;
    if (cache.has(key)) return cache.get(key) === null ? null : new Date(cache.get(key));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return null;
    const [year,month,date] = day.split('-').map(Number);
    const [hour,minute,second=0] = time.split(':').map(Number);
    const naive = Date.UTC(year,month-1,date,hour,minute,second);
    if (new Date(naive).toISOString().slice(0,10) !== day) return null;
    const offsets = new Set([-36,0,36].map(h => {
      const sample = new Date(naive + h*3600000);
      return wallMillis(parts(sample)) - sample.getTime();
    }));
    const candidates = [...offsets].map(offset => naive-offset).filter(ms => wallMillis(parts(new Date(ms))) === naive).sort((a,b)=>a-b);
    // DST gap: reject a nonexistent local time. DST fold: use the earlier
    // occurrence deterministically; an explicit Timestamp can select the later one.
    const ms = candidates[0] ?? null;
    if (cache.size > 1000) cache.clear();
    cache.set(key,ms);
    return ms === null ? null : new Date(ms);
  }
  function instant(value) {
    let date = null;
    if (value instanceof Date) date = value;
    else if (value && typeof value.toDate === 'function') date = value.toDate();
    else if (value && Number.isFinite(value.seconds)) date = new Date(value.seconds*1000 + (value.nanoseconds || 0)/1e6);
    else if (typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) date = new Date(value);
    return date && Number.isFinite(date.getTime()) ? date : null;
  }
  function start(event) {
    for (const key of ['startAt','startTimestamp','start']) {
      const date = instant(event?.[key]);
      if (date) return date;
    }
    return localInstant(event?.date,event?.startTime || '00:00');
  }
  function hasStartTime(event) {
    return !!event?.startTime || ['startAt','startTimestamp','start'].some(key => !!instant(event?.[key]));
  }
  function end(event) {
    for (const key of ['endAt','endTimestamp','end']) {
      const date = instant(event?.[key]);
      if (date) return date;
    }
    if (!event?.endTime) return null;
    const beginning = start(event);
    if (!beginning) return null;
    const day = event.endDate || event.date || localDate(beginning);
    let ending = localInstant(day,event.endTime);
    if (ending && ending <= beginning && !event.endDate) {
      const next = new Date(`${day}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate()+1);
      ending = localInstant(next.toISOString().slice(0,10),event.endTime);
    }
    return ending;
  }
  function time(date) { return new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date); }
  function day(date) { return new Intl.DateTimeFormat('en-GB',{timeZone:zone,weekday:'short',day:'numeric',month:'short'}).format(date); }
  function compare(a,b) { return (start(a)?.getTime() ?? Infinity) - (start(b)?.getTime() ?? Infinity); }
  root.LKEventTime = {zone,localInstant,instant,start,end,hasStartTime,time,day,localDate,compare};
  if (typeof module !== 'undefined') module.exports = root.LKEventTime;
})(typeof window !== 'undefined' ? window : globalThis);
