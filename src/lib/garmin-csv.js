export function parseGarminSleepCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const isKV = lines.some(l => {
    const ci = l.indexOf(",");
    if (ci < 0) return false;
    return l.slice(0, ci).trim().toLowerCase() === "date" &&
           /^\d{4}-\d{2}-\d{2}$/.test(l.slice(ci + 1).trim());
  });

  if (isKV) {
    const parseHM = str => {
      if (!str) return 0;
      const hm = str.match(/(\d+)h\s*(\d+)m/);
      if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2]);
      const h = str.match(/^(\d+)h$/);
      if (h) return parseInt(h[1]) * 60;
      const m = str.match(/^(\d+)m$/);
      if (m) return parseInt(m[1]);
      return 0;
    };
    const kv = {};
    for (const line of lines) {
      const ci = line.indexOf(",");
      if (ci < 0) continue;
      const key = line.slice(0, ci).trim().toLowerCase();
      const val = line.slice(ci + 1).trim();
      if (!val || val === "--") continue;
      if (!kv[key]) kv[key] = val;
    }
    const date = kv["date"] || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const total = parseHM(kv["durée du sommeil"]);
    if (!total) return [];
    return [{
      date, total,
      deep:  parseHM(kv["durée du sommeil profond"]),
      light: parseHM(kv["durée du sommeil léger"]),
      rem:   parseHM(kv["durée du sommeil paradoxal"]),
      awake: parseHM(kv["temps d'éveil"]),
      score: kv["score de sommeil"] ? (parseInt(kv["score de sommeil"]) || null) : null,
    }];
  }

  const header = lines[0].split(",").map(h => h.replace(/"/g, "").trim().toLowerCase());
  const col = (...patterns) => {
    for (const p of patterns) {
      const idx = header.findIndex(h => h.includes(p));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const dateIdx  = col("date");
  const totalIdx = col("sleep time", "durée de sommeil");
  const deepIdx  = col("deep sleep", "sommeil profond");
  const lightIdx = col("light sleep", "sommeil léger");
  const remIdx   = col("rem sleep", "sommeil paradoxal");
  const awakeIdx = col("awake time", "durée d'éveil", "veil");
  const scoreIdx = col("sleep score", "score de sommeil");

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",").map(v => v.replace(/"/g, "").trim());
    if (!row[dateIdx]) continue;
    const toMin = idx => {
      if (idx < 0 || !row[idx]) return 0;
      const v = parseFloat(row[idx]);
      return isNaN(v) ? 0 : Math.round(v / 60);
    };
    const raw = row[dateIdx];
    let date = "";
    if (/^\d{4}-\d{2}-\d{2}/.test(raw))        date = raw.slice(0, 10);
    else if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) { const [d, m, y] = raw.split("/"); date = `${y}-${m}-${d}`; }
    else continue;
    const total = toMin(totalIdx);
    if (total === 0) continue;
    results.push({
      date, total,
      deep:  toMin(deepIdx),
      light: toMin(lightIdx),
      rem:   toMin(remIdx),
      awake: toMin(awakeIdx),
      score: scoreIdx >= 0 && row[scoreIdx] ? parseInt(row[scoreIdx]) || null : null,
    });
  }
  return results.sort((a, b) => a.date.localeCompare(b.date));
}
