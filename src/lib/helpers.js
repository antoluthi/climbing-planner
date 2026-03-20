export function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function formatDate(date) {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function weekKey(monday) {
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function calcEndTime(startTime, duration) {
  if (!startTime || !duration) return null;
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + Number(duration);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function migrateWeekKeys(data) {
  const weeks = data?.weeks;
  if (!weeks) return data;
  const oldKeys = Object.keys(weeks).filter(k => {
    const d = new Date(k + "T12:00:00");
    return d.getDay() === 0;
  });
  if (oldKeys.length === 0) return data;
  const newWeeks = { ...weeks };
  oldKeys.forEach(k => {
    const corrected = localDateStr(addDays(new Date(k + "T12:00:00"), 1));
    if (!newWeeks[corrected]) newWeeks[corrected] = newWeeks[k];
    delete newWeeks[k];
  });
  return { ...data, weeks: newWeeks };
}

export function getDaySessions(data, date) {
  const monday = getMondayOf(date);
  const wKey = weekKey(monday);
  const ws = data.weeks[wKey];
  if (!ws) return [];
  const day = date.getDay();
  const idx = day === 0 ? 6 : day - 1;
  return ws[idx] || [];
}

export function getDayCharge(data, date) {
  return getDaySessions(data, date).reduce((a, s) => a + s.charge, 0);
}

export function getMonthWeeks(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startMonday = getMondayOf(firstDay);
  const weeks = [];
  let d = new Date(startMonday);
  while (d <= lastDay) {
    weeks.push(new Date(d));
    d = addDays(d, 7);
  }
  return weeks;
}
