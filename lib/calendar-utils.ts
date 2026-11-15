import { AttendancePolicyConfig, CalendarEvent, CalendarEventCategory } from './types';

export const BENGALI_MONTHS = [
  'বৈশাখ',
  'জ্যৈষ্ঠ',
  'আষাঢ়',
  'শ্রাবণ',
  'ভাদ্র',
  'আশ্বিন',
  'কার্তিক',
  'অগ্রহায়ণ',
  'পৌষ',
  'মাঘ',
  'ফাল্গুন',
  'চৈত্র',
] as const;

export const GREGORIAN_MONTHS_BN = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
] as const;

export const HIJRI_MONTHS_BN = [
  'মহররম',
  'সফর',
  'রবিউল আউয়াল',
  'রবিউস সানি',
  'জমাদিউল আউয়াল',
  'জমাদিউস সানি',
  'রজব',
  'শাবান',
  'রমজান',
  'শাওয়াল',
  'জিলকদ',
  'জিলহজ',
] as const;

export const WEEKDAYS_SHORT_BN = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'] as const;

export const WEEKDAYS_FULL_BN = [
  'রবিবার',
  'সোমবার',
  'মঙ্গলবার',
  'বুধবার',
  'বৃহস্পতিবার',
  'শুক্রবার',
  'শনিবার',
] as const;

export const WEEKDAYS_EN = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const BN_DIGIT_MAP: Record<string, string> = {
  '0': '০',
  '1': '১',
  '2': '২',
  '3': '৩',
  '4': '৪',
  '5': '৫',
  '6': '৬',
  '7': '৭',
  '8': '৮',
  '9': '৯',
};

export function toBnDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGIT_MAP[d] ?? d);
}

export function formatIsoDate(year: number, monthZeroBased: number, day: number): string {
  const m = String(monthZeroBased + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function parseIsoDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y || 2026, (m || 1) - 1, d || 1, 12, 0, 0);
}

export function isGregorianLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Revised Bangla Academy Bengali Calendar calculation (Official in Bangladesh since 2019):
 * - Pohela Boishakh = April 14
 * - Boishakh to Ashwin (first 6 months) = 31 days each
 * - Kartik to Magh + Chaitra = 30 days each
 * - Falgun = 29 days in common year, 30 days in Gregorian leap year (checking the Gregorian year containing Falgun, i.e., Feb-Mar)
 */
export function getBengaliDateInfo(dateStr: string): {
  day: number;
  monthIndex: number;
  monthName: string;
  year: number;
  formattedShort: string;
  formattedFull: string;
} {
  const [gYear, gMonth, gDay] = dateStr.split('-').map(Number);
  const current = new Date(Date.UTC(gYear, gMonth - 1, gDay));

  // Determine start of current Bengali year (April 14 of gYear or gYear-1)
  const april14ThisYear = new Date(Date.UTC(gYear, 3, 14));
  const isBeforePohelaBoishakh = current < april14ThisYear;

  const startGregorianYear = isBeforePohelaBoishakh ? gYear - 1 : gYear;
  const bnYear = startGregorianYear - 593;
  const bnYearStart = new Date(Date.UTC(startGregorianYear, 3, 14));

  // Falgun & Chaitra fall in (startGregorianYear + 1)
  const falgunGregorianYear = startGregorianYear + 1;
  const falgunDays = isGregorianLeapYear(falgunGregorianYear) ? 30 : 29;

  const monthLengths = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, falgunDays, 30];

  let diffDays = Math.floor((current.getTime() - bnYearStart.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) diffDays = 0;

  let monthIndex = 0;
  while (monthIndex < 11 && diffDays >= monthLengths[monthIndex]) {
    diffDays -= monthLengths[monthIndex];
    monthIndex++;
  }

  const day = diffDays + 1;
  const monthName = BENGALI_MONTHS[monthIndex] || BENGALI_MONTHS[0];

  return {
    day,
    monthIndex,
    monthName,
    year: bnYear,
    formattedShort: `${toBnDigits(day)} ${monthName}`,
    formattedFull: `${toBnDigits(day)} ${monthName} ${toBnDigits(bnYear)} বঙ্গাব্দ`,
  };
}

/**
 * Fallback arithmetic Kuwaiti/Civil Hijri calculation if Intl ICU islamic-umalqura is unavailable.
 */
function fallbackGregorianToHijri(date: Date): { day: number; month: number; year: number } {
  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();

  const mPart = month <= 2 ? month + 12 : month;
  const yPart = month <= 2 ? year - 1 : year;
  const jd =
    Math.floor((1461 * (yPart + 4800)) / 4) +
    Math.floor((367 * (mPart - 2)) / 12) -
    Math.floor((3 * Math.floor((yPart + 4900) / 100)) / 4) +
    day -
    32075;

  let l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
    Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l =
    l -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const hMonth = Math.floor((24 * l) / 709);
  const hDay = l - Math.floor((709 * hMonth) / 24);
  const hYear = 30 * n + j - 30;

  return { day: hDay, month: hMonth, year: hYear };
}

/**
 * Hijri (Arabic) date conversion using Intl islamic-umalqura + Admin offsetDays (-1 | 0 | +1)
 */
export function getHijriDateInfo(
  dateStr: string,
  offsetDays: number = 0
): {
  day: number;
  monthIndex: number;
  monthName: string;
  year: number;
  formattedCompact: string;
  formattedShort: string;
  formattedFull: string;
} {
  const [y, m, d] = dateStr.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + offsetDays, 12, 0, 0));

  let hDay = 1;
  let hMonth = 1;
  let hYear = 1448;

  try {
    const formatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
    const parts = formatter.formatToParts(shifted);
    const map: Record<string, string> = {};
    parts.forEach((p) => {
      map[p.type] = p.value;
    });
    const parsedDay = parseInt(map.day || '', 10);
    const parsedMonth = parseInt(map.month || '', 10);
    const parsedYear = parseInt((map.year || '').replace(/\D/g, ''), 10);

    if (!isNaN(parsedDay) && !isNaN(parsedMonth) && !isNaN(parsedYear)) {
      hDay = parsedDay;
      hMonth = parsedMonth;
      hYear = parsedYear;
    } else {
      const fb = fallbackGregorianToHijri(shifted);
      hDay = fb.day;
      hMonth = fb.month;
      hYear = fb.year;
    }
  } catch {
    const fb = fallbackGregorianToHijri(shifted);
    hDay = fb.day;
    hMonth = fb.month;
    hYear = fb.year;
  }

  const monthIndex = Math.max(0, Math.min(11, hMonth - 1));
  const monthName = HIJRI_MONTHS_BN[monthIndex] || HIJRI_MONTHS_BN[0];

  const compactMonth = monthName.length > 9 ? `${monthName.slice(0, 8)}..` : monthName;

  return {
    day: hDay,
    monthIndex,
    monthName,
    year: hYear,
    formattedCompact: `${toBnDigits(hDay)} ${compactMonth}`,
    formattedShort: `${toBnDigits(hDay)} ${monthName}`,
    formattedFull: `${toBnDigits(hDay)} ${monthName} ${toBnDigits(hYear)} হিজরি`,
  };
}

export function getGregorianDateFullBn(dateStr: string): string {
  const dt = parseIsoDateLocal(dateStr);
  const weekday = WEEKDAYS_FULL_BN[dt.getDay()];
  const month = GREGORIAN_MONTHS_BN[dt.getMonth()];
  return `${weekday}, ${toBnDigits(dt.getDate())} ${month} ${toBnDigits(dt.getFullYear())}`;
}

export function getWeekdayNameEn(dateStr: string): string {
  const dt = parseIsoDateLocal(dateStr);
  return WEEKDAYS_EN[dt.getDay()];
}

export function getEventsOnDate(dateStr: string, events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((ev) => ev.startDate <= dateStr && dateStr <= ev.endDate);
}

export function getDayOperationalStatus(
  dateStr: string,
  policy: AttendancePolicyConfig,
  calendarEvents: CalendarEvent[]
): {
  isWeeklyHoliday: boolean;
  isDeclaredHoliday: boolean;
  isSpecialWorkingDay: boolean;
  isAnyHoliday: boolean;
  dayEvents: CalendarEvent[];
  holidayTitle?: string;
} {
  const weekdayEn = getWeekdayNameEn(dateStr);
  const isWeeklyHoliday = policy.weeklyHolidays.includes(weekdayEn);
  const dayEvents = getEventsOnDate(dateStr, calendarEvents);

  const calWorkingDay = dayEvents.find((e) => e.category === 'Special_Working_Day');
  const policyWorkingDay = policy.specialDays?.find(
    (sd) => sd.date === dateStr && (sd.type === 'Working_Day' || sd.type === 'Special_Working_Day')
  );
  const isSpecialWorkingDay = Boolean(calWorkingDay || policyWorkingDay);

  const calHoliday = dayEvents.find((e) => e.category === 'Holiday');
  const policyHoliday = policy.specialDays?.find((sd) => sd.date === dateStr && sd.type === 'Holiday');
  const isDeclaredHoliday = Boolean(calHoliday || policyHoliday);

  const isAnyHoliday = !isSpecialWorkingDay && (isWeeklyHoliday || isDeclaredHoliday);
  const holidayTitle =
    calHoliday?.title ||
    policyHoliday?.title ||
    (isWeeklyHoliday && !isSpecialWorkingDay ? 'সাপ্তাহিক ছুটি' : undefined);

  return {
    isWeeklyHoliday,
    isDeclaredHoliday,
    isSpecialWorkingDay,
    isAnyHoliday,
    dayEvents,
    holidayTitle,
  };
}

export function getCategoryLabelBn(category: CalendarEventCategory): string {
  switch (category) {
    case 'Holiday':
      return 'সরকারি / প্রতিষ্ঠান ছুটি';
    case 'Academic':
      return 'একাডেমিক কার্যক্রম';
    case 'Exam':
      return 'পরীক্ষা ও মূল্যায়ন';
    case 'Event':
      return 'ইভেন্ট ও সেমিনার';
    case 'Special_Working_Day':
      return 'বিশেষ কর্মদিবস';
    case 'Meeting':
      return 'মিটিং / সভা';
    default:
      return category;
  }
}

export function getCategoryBadgeStyle(category: CalendarEventCategory): string {
  switch (category) {
    case 'Holiday':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'Exam':
      return 'bg-amber-50 text-amber-900 border-amber-200';
    case 'Academic':
      return 'bg-emerald-50 text-emerald-900 border-emerald-200';
    case 'Event':
      return 'bg-sky-50 text-sky-900 border-sky-200';
    case 'Special_Working_Day':
      return 'bg-indigo-50 text-indigo-900 border-indigo-200';
    case 'Meeting':
      return 'bg-purple-50 text-purple-900 border-purple-200';
    default:
      return 'bg-slate-50 text-slate-800 border-slate-200';
  }
}

export function enumerateDateRange(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  const start = parseIsoDateLocal(startDate);
  const end = parseIsoDateLocal(endDate);
  if (end < start) return [startDate];

  const cursor = new Date(start.getTime());
  let guard = 0;
  while (cursor <= end && guard < 370) {
    result.push(formatIsoDate(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return result;
}
