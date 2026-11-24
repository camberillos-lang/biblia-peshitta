// Horas civiles del dispositivo. La base de datos de zonas de Intl resuelve los
// cambios de horario sin asumir una diferencia fija respecto de UTC.
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const formats = new Map();

function formatter(zone) {
  if (!formats.has(zone)) {
    if (formats.size > 80) formats.clear();
    formats.set(zone, new Intl.DateTimeFormat("en-GB", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }));
  }
  return formats.get(zone);
}

function localStamp(ms, zone) {
  const fields = Object.fromEntries(formatter(zone).formatToParts(ms).map(p => [p.type, p.value]));
  return Date.UTC(+fields.year, +fields.month - 1, +fields.day, +fields.hour, +fields.minute);
}

function minuteOf(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("Usa horas de 00:00 a 23:59.");
  }
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function within(minute, start, end) {
  return start <= end ? minute >= start && minute <= end : minute >= start || minute <= end;
}

function allowedMinutes(s) {
  const start = minuteOf(s.start);
  const end = minuteOf(s.end);
  const quietStart = minuteOf(s.quietStart);
  const quietEnd = minuteOf(s.quietEnd);
  const minutes = [];
  for (let m = 0; m < 1440; m++) {
    if (within(m, start, end) && !(s.quiet && within(m, quietStart, (quietEnd + 1439) % 1440))) minutes.push(m);
  }
  return minutes;
}

export function scheduleSettings(value) {
  if (!value || typeof value !== "object") throw new Error("Falta el horario.");
  if (typeof value.timezone !== "string" || !value.timezone || value.timezone.length > 80) throw new Error("Elige una zona horaria válida.");
  try { formatter(value.timezone); } catch { throw new Error("El dispositivo indicó una zona horaria desconocida."); }
  if (!Array.isArray(value.days) || !value.days.length || value.days.length > 7 || value.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error("Elige al menos un día de la semana.");
  if (!Number.isInteger(value.count) || value.count < 1 || value.count > 48) throw new Error("Elige entre 1 y 48 avisos diarios.");
  if (value.mode !== "fixed" && value.mode !== "random") throw new Error("Indica si el horario será fijo o aleatorio.");
  if (!Number.isInteger(value.minInterval) || value.minInterval < 1 || value.minInterval > 1440) throw new Error("El intervalo debe medir de 1 a 1,440 minutos.");
  const s = {
    timezone: value.timezone, days: [...new Set(value.days)].sort(), count: value.count,
    start: value.start, end: value.end, mode: value.mode, minInterval: value.minInterval,
    special: value.special === true, quiet: value.quiet !== false,
    quietStart: value.quietStart ?? "22:00", quietEnd: value.quietEnd ?? "07:00"
  };
  if (s.quiet && s.quietStart === s.quietEnd) throw new Error("Elige horas distintas para el inicio y el fin del descanso.");
  const eligible = allowedMinutes(s);
  if (s.mode === "fixed" && value.times != null && (!Array.isArray(value.times) || value.times.length)) {
    if (!Array.isArray(value.times) || value.times.length !== s.count) throw new Error("Incluye una hora fija por cada aviso.");
    s.times = [...value.times].sort();
    let previous = -Infinity;
    for (const t of s.times) {
      const m = minuteOf(t);
      if (!eligible.includes(m) || m - previous < s.minInterval) throw new Error("Las horas elegidas deben respetar la franja, el descanso y el intervalo mínimo.");
      previous = m;
    }
  }
  // Prueba el espacio disponible incluso cuando todavía no hay una suscripción.
  plannedMinutes(s, 0, eligible);
  return s;
}

function dayRandom(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    return hash / 4294967296;
  };
}

function firstAtLeast(values, threshold) {
  let low = 0, high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid] < threshold) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function plannedMinutes(s, seed, eligible = allowedMinutes(s)) {
  if (s.times) return s.times.map(minuteOf);
  const last = new Array(s.count);
  let right = eligible.length - 1;
  for (let i = s.count - 1; i >= 0; i--) {
    if (right < 0) throw new Error("Los avisos no caben en esa franja con ese intervalo. Amplía la franja o reduce la cantidad.");
    last[i] = right;
    right = firstAtLeast(eligible, eligible[right] - s.minInterval + 1) - 1;
  }
  const random = dayRandom(seed);
  const chosen = [];
  let left = 0;
  for (let i = 0; i < s.count; i++) {
    right = last[i];
    const ideal = s.count === 1 ? 0 : Math.round(i * (eligible.length - 1) / (s.count - 1));
    const index = s.mode === "random" ? left + Math.floor(random() * (right - left + 1)) : Math.max(left, Math.min(right, ideal));
    chosen.push(eligible[index]);
    left = firstAtLeast(eligible, eligible[index] + s.minInterval);
  }
  return chosen;
}

function offsetsOnDay(day, zone) {
  // Consultar ambos lados del día civil recoge tanto el salto como la repetición.
  const samples = [day - DAY, day + DAY / 2, day + 2 * DAY];
  return [...new Set(samples.map(stamp => localStamp(stamp, zone) - stamp))];
}

function instant(day, minute, offsets, zone) {
  const wall = day + minute * MINUTE;
  const candidates = offsets.map(offset => wall - offset).filter(ms => localStamp(ms, zone) === wall);
  // Una hora inexistente se omite; en la hora repetida solo se usa la primera.
  return candidates.length ? Math.min(...candidates) : null;
}

export function allowedAt(s, stamp) {
  const local = localStamp(stamp, s.timezone);
  const weekday = new Date(local).getUTCDay();
  const m = (local % DAY) / MINUTE;
  return s.days.includes(weekday) && allowedMinutes(s).includes(m);
}

export function nextReminder(s, now, seed, recent = []) {
  const firstDay = Math.floor(localStamp(now, s.timezone) / DAY) * DAY;
  const eligible = allowedMinutes(s);
  const recentLocal = recent.map(event => ({...event, day: Math.floor(localStamp(event.at, s.timezone) / DAY) * DAY}));
  // El intervalo real entre minutos se mide en UTC, incluso al cambiar de reloj.
  const lastDelivery = Math.max(-Infinity, ...recent.map(x => x.at));
  const gapUntil = lastDelivery + s.minInterval * MINUTE;
  for (let offset = 0; offset <= 15; offset++) {
    const day = firstDay + offset * DAY;
    if (!s.days.includes(new Date(day).getUTCDay())) continue;
    const sentToday = recentLocal.filter(x => x.day === day);
    if (sentToday.length >= s.count) continue;
    const offsets = offsetsOnDay(day, s.timezone);
    const minutes = plannedMinutes(s, `${seed}/${day}`, eligible);
    for (const m of minutes) {
      const at = instant(day, m, offsets, s.timezone);
      if (at !== null && at > now && at >= Math.floor(gapUntil / MINUTE) * MINUTE) {
        // Si el envío anterior terminó unos segundos tarde, conservar el minuto
        // elegido y respetar también el intervalo real entre los dos envíos.
        return {at:Math.max(at, gapUntil), kind: s.special && sentToday.length === 0 ? "daily" : "regular", id: "h" + at.toString(36)};
      }
    }
  }
  throw new Error("No se encontró una fecha posible durante las próximas dos semanas.");
}
