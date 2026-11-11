// Seasonal touches: a small badge on the logo and a greeting on Home during holidays, Middle East and international.
// Lunar and solar-lunar dates are tabled for 2025–2030 (civil calendars vary by a day between countries).
export type Holiday = { id: string; name: string; emoji: string; greeting: string; from: string; to: string; scope: 'ME' | 'Intl' | 'India' }

const fixed: { id: string; name: string; emoji: string; greeting: string; m: number; d: number; days?: number; scope: Holiday['scope'] }[] = [
  { id: 'newyear', name: "New Year's Day", emoji: '🎆', greeting: 'Happy New Year', m: 1, d: 1, scope: 'Intl' },
  { id: 'republic', name: 'Republic Day (India)', emoji: '🇮🇳', greeting: 'Happy Republic Day', m: 1, d: 26, scope: 'India' },
  { id: 'kuwait', name: 'Kuwait National Day', emoji: '🇰🇼', greeting: 'Happy National Day, Kuwait', m: 2, d: 25, days: 2, scope: 'ME' },
  { id: 'women', name: "International Women's Day", emoji: '💐', greeting: "Happy Women's Day", m: 3, d: 8, scope: 'Intl' },
  { id: 'nowruz', name: 'Nowruz', emoji: '🌷', greeting: 'Nowruz Mubarak', m: 3, d: 20, days: 2, scope: 'ME' },
  { id: 'earth', name: 'Earth Day', emoji: '🌍', greeting: 'Happy Earth Day', m: 4, d: 22, scope: 'Intl' },
  { id: 'indiaday', name: 'Independence Day (India)', emoji: '🇮🇳', greeting: 'Happy Independence Day', m: 8, d: 15, scope: 'India' },
  { id: 'saudi', name: 'Saudi National Day', emoji: '🇸🇦', greeting: 'Happy National Day, Saudi Arabia', m: 9, d: 23, scope: 'ME' },
  { id: 'halloween', name: 'Halloween', emoji: '🎃', greeting: 'Happy Halloween', m: 10, d: 31, scope: 'Intl' },
  { id: 'uaeflag', name: 'UAE Flag Day', emoji: '🇦🇪', greeting: 'Happy Flag Day', m: 11, d: 3, scope: 'ME' },
  { id: 'oman', name: 'Oman National Day', emoji: '🇴🇲', greeting: 'Happy National Day, Oman', m: 11, d: 18, scope: 'ME' },
  { id: 'uaeday', name: 'UAE National Day', emoji: '🇦🇪', greeting: 'Happy Eid Al Etihad', m: 12, d: 2, days: 2, scope: 'ME' },
  { id: 'bahrain', name: 'Bahrain National Day', emoji: '🇧🇭', greeting: 'Happy National Day, Bahrain', m: 12, d: 16, days: 2, scope: 'ME' },
  { id: 'qatar', name: 'Qatar National Day', emoji: '🇶🇦', greeting: 'Happy National Day, Qatar', m: 12, d: 18, scope: 'ME' },
  { id: 'christmas', name: 'Christmas', emoji: '🎄', greeting: 'Merry Christmas', m: 12, d: 24, days: 3, scope: 'Intl' },
  { id: 'nye', name: "New Year's Eve", emoji: '🥂', greeting: 'Happy New Year', m: 12, d: 31, scope: 'Intl' },
]

const moving: { id: string; name: string; emoji: string; greeting: string; days: number; scope: Holiday['scope']; dates: Record<number, string> }[] = [
  { id: 'ramadan', name: 'Ramadan', emoji: '🌙', greeting: 'Ramadan Kareem', days: 29, scope: 'ME', dates: { 2025: '2025-03-01', 2026: '2026-02-18', 2027: '2027-02-08', 2028: '2028-01-28', 2029: '2029-01-16', 2030: '2030-01-05' } },
  { id: 'eidfitr', name: 'Eid Al Fitr', emoji: '🌙', greeting: 'Eid Mubarak', days: 3, scope: 'ME', dates: { 2025: '2025-03-30', 2026: '2026-03-20', 2027: '2027-03-09', 2028: '2028-02-26', 2029: '2029-02-14', 2030: '2030-02-04' } },
  { id: 'eidadha', name: 'Eid Al Adha', emoji: '🕌', greeting: 'Eid Mubarak', days: 4, scope: 'ME', dates: { 2025: '2025-06-06', 2026: '2026-05-27', 2027: '2027-05-16', 2028: '2028-05-05', 2029: '2029-04-24', 2030: '2030-04-13' } },
  { id: 'hijri', name: 'Islamic New Year', emoji: '🗓️', greeting: 'Happy Hijri New Year', days: 1, scope: 'ME', dates: { 2025: '2025-06-26', 2026: '2026-06-16', 2027: '2027-06-06', 2028: '2028-05-25', 2029: '2029-05-14', 2030: '2030-05-03' } },
  { id: 'lunar', name: 'Lunar New Year', emoji: '🏮', greeting: 'Happy Lunar New Year', days: 3, scope: 'Intl', dates: { 2025: '2025-01-29', 2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26', 2029: '2029-02-13', 2030: '2030-02-03' } },
  { id: 'onam', name: 'Onam', emoji: '🌼', greeting: 'Happy Onam', days: 2, scope: 'India', dates: { 2025: '2025-09-05', 2026: '2026-08-26', 2027: '2027-09-14', 2028: '2028-09-02', 2029: '2029-08-22', 2030: '2030-09-10' } },
  { id: 'diwali', name: 'Diwali', emoji: '🪔', greeting: 'Happy Diwali', days: 2, scope: 'India', dates: { 2025: '2025-10-20', 2026: '2026-11-08', 2027: '2027-10-29', 2028: '2028-10-17', 2029: '2029-11-05', 2030: '2030-10-26' } },
]

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d) }

/** Every holiday with its date range in the given year. */
export function holidaysOf(year: number): Holiday[] {
  const out: Holiday[] = []
  for (const f of fixed) { const from = `${year}-${String(f.m).padStart(2, '0')}-${String(f.d).padStart(2, '0')}`; out.push({ id: f.id, name: f.name, emoji: f.emoji, greeting: f.greeting, from, to: addDays(from, (f.days ?? 1) - 1), scope: f.scope }) }
  for (const m of moving) { const from = m.dates[year]; if (from) out.push({ id: m.id, name: m.name, emoji: m.emoji, greeting: m.greeting, from, to: addDays(from, m.days - 1), scope: m.scope }) }
  return out.sort((a, b) => a.from.localeCompare(b.from))
}

/** The holiday happening today, if any (Middle East first, then India, then international). */
export function currentHoliday(at = new Date()): Holiday | undefined {
  const today = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
  const hits = holidaysOf(at.getFullYear()).filter((h) => h.from <= today && today <= h.to)
  const rank = { ME: 0, India: 1, Intl: 2 }
  return hits.sort((a, b) => rank[a.scope] - rank[b.scope])[0]
}

export const holidayById = (id: string, year = new Date().getFullYear()) => holidaysOf(year).find((h) => h.id === id)
export const ALL_HOLIDAYS = [...fixed.map((f) => ({ id: f.id, name: f.name, emoji: f.emoji })), ...moving.map((m) => ({ id: m.id, name: m.name, emoji: m.emoji }))]
