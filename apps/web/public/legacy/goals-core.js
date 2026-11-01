(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DaraGoals = api;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  "use strict";

  // ─── تاریخ شمسی (الگوریتم Borkowski؛ بدون وابستگی بیرونی) ───────────────────
  const JALALI_MONTHS = [
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
  ];
  const GOAL_TEMPLATES = ["صندوق اضطراری", "سفر", "خرید لپ‌تاپ", "خرید خودرو"];
  const INITIAL_CONTRIBUTION_NOTE = "موجودی اولیه";
  // اولویت ۱..۴؛ ۲ (متوسط) پیش‌فرض سازگار با اهداف قدیمی است.
  const PRIORITIES = [1, 2, 3, 4];
  const DEFAULT_PRIORITY = 2;

  function normalizePriority(value) {
    const number = Number(value);
    return Number.isInteger(number) && PRIORITIES.includes(number) ? number : DEFAULT_PRIORITY;
  }

  const div = (a, b) => ~~(a / b);
  const mod = (a, b) => a - ~~(a / b) * b;

  // سال‌های کبیسه و طول ماه‌ها را طبق تقویم هجری شمسی تعیین می‌کند.
  function jalCal(jy) {
    const breaks = [
      -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324,
      2394, 2456, 3178,
    ];
    const bl = breaks.length;
    const gy = jy + 621;
    let leapJ = -14;
    let jp = breaks[0];
    let jump = 0;
    let jm = 0;
    if (jy < jp || jy >= breaks[bl - 1]) throw new Error("سال شمسی خارج از محدودهٔ پشتیبانی است.");
    for (let i = 1; i < bl; i += 1) {
      jm = breaks[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    let n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    let leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }

  // روز جولیَن از تاریخ میلادی/شمسی و برعکس؛ مبنای تبدیل بدون خطای تقویمی است.
  function g2d(gy, gm, gd) {
    let d =
      div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
      div(153 * mod(gm + 9, 12) + 2, 5) +
      gd -
      34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
  }

  function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }

  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    const jdn1f = g2d(gy, 3, r.march);
    let k = jdn - jdn1f;
    let jm;
    let jd;
    if (k >= 0) {
      if (k <= 185) {
        jm = 1 + div(k, 31);
        jd = mod(k, 31) + 1;
        return { jy, jm, jd };
      }
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    jm = 7 + div(k, 30);
    jd = mod(k, 30) + 1;
    return { jy, jm, jd };
  }

  function isJalaliLeap(jy) {
    try {
      return jalCal(jy).leap === 0;
    } catch {
      return false;
    }
  }

  // طول هر ماه شمسی؛ اسفند در سال کبیسه ۳۰ روز است.
  function jalaliMonthLength(jy, jm) {
    if (!Number.isInteger(jy) || !Number.isInteger(jm) || jm < 1 || jm > 12) return 0;
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isJalaliLeap(jy) ? 30 : 29;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function parseIsoDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    )
      return null;
    return { y: year, m: month, d: day };
  }

  function isValidJalali(jy, jm, jd) {
    if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd)) return false;
    if (jm < 1 || jm > 12 || jd < 1) return false;
    if (jd > jalaliMonthLength(jy, jm)) return false;
    try {
      jalCal(jy);
      return true;
    } catch {
      return false;
    }
  }

  // تاریخ شمسی (سال/ماه/روز) را به ISO میلادی YYYY-MM-DD تبدیل می‌کند؛ نامعتبر → null.
  function jalaliToIso(jy, jm, jd) {
    if (!isValidJalali(jy, jm, jd)) return null;
    const g = d2g(j2d(jy, jm, jd));
    return `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
  }

  // ISO میلادی را به اجزای تاریخ شمسی تبدیل می‌کند؛ نامعتبر → null.
  function isoToJalali(iso) {
    const parsed = parseIsoDate(iso);
    if (!parsed) return null;
    try {
      return d2j(g2d(parsed.y, parsed.m, parsed.d));
    } catch {
      return null;
    }
  }

  // ─── پول ───────────────────────────────────────────────────────────────────
  const DIGIT_MAP = {
    "۰": "0",
    "۱": "1",
    "۲": "2",
    "۳": "3",
    "۴": "4",
    "۵": "5",
    "۶": "6",
    "۷": "7",
    "۸": "8",
    "۹": "9",
    "٠": "0",
    "١": "1",
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "٥": "5",
    "٦": "6",
    "٧": "7",
    "٨": "8",
    "٩": "9",
  };

  function normalizeDigits(value) {
    return String(value ?? "").replace(/[۰-۹٠-٩]/g, (digit) => DIGIT_MAP[digit] ?? digit);
  }

  // ورودی پول کاربر را به عدد صحیح مثبت و ایمن تبدیل می‌کند؛ هر چیز دیگر → null.
  function parseMoney(value) {
    const text = normalizeDigits(value).replace(/[,\u066C\u060C\s\u00A0]/g, "");
    if (!/^\d{1,16}$/.test(text)) return null;
    const amount = Number(text);
    if (!Number.isSafeInteger(amount) || amount <= 0) return null;
    return amount;
  }

  function formatMoney(amount) {
    if (!Number.isSafeInteger(amount)) return "";
    return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
  }

  const ONES = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
  const TEENS = [
    "ده",
    "یازده",
    "دوازده",
    "سیزده",
    "چهارده",
    "پانزده",
    "شانزده",
    "هفده",
    "هجده",
    "نوزده",
  ];
  const TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
  const HUNDREDS = [
    "",
    "صد",
    "دویست",
    "سیصد",
    "چهارصد",
    "پانصد",
    "ششصد",
    "هفتصد",
    "هشتصد",
    "نهصد",
  ];
  const SCALES = ["", "هزار", "میلیون", "میلیارد", "هزار میلیارد", "میلیون میلیارد"];

  function threeDigitsToWords(value) {
    const parts = [];
    const hundreds = div(value, 100);
    const rest = mod(value, 100);
    if (hundreds) parts.push(HUNDREDS[hundreds]);
    if (rest >= 10 && rest < 20) parts.push(TEENS[rest - 10]);
    else {
      const tens = div(rest, 10);
      const ones = mod(rest, 10);
      if (tens) parts.push(TENS[tens]);
      if (ones) parts.push(ONES[ones]);
    }
    return parts.join(" و ");
  }

  // مبلغ صحیح را به متن فارسی می‌نویسد؛ برای پیش‌نمایش ورودی پول استفاده می‌شود.
  function moneyToWords(amount) {
    if (!Number.isSafeInteger(amount) || amount < 0) return "";
    if (amount === 0) return "صفر";
    const groups = [];
    let remaining = amount;
    while (remaining > 0 && groups.length < SCALES.length) {
      groups.push(mod(remaining, 1000));
      remaining = div(remaining, 1000);
    }
    const words = [];
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      const group = groups[index];
      if (!group) continue;
      const text = threeDigitsToWords(group);
      words.push(SCALES[index] ? `${text} ${SCALES[index]}` : text);
    }
    return words.join(" و ");
  }

  function moneyPreview(amount, unit) {
    const words = moneyToWords(amount);
    if (!words) return "";
    return unit ? `${words} ${unit}` : words;
  }

  // ─── مدل هدف و مشارکت‌ها ───────────────────────────────────────────────────
  function normalizeName(value) {
    return String(value ?? "").trim();
  }

  function isPositiveAmount(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  // موجودی هر هدف فقط از جمع مشارکت‌های معتبر به‌دست می‌آید (منبع حقیقت واحد).
  function savedOf(goal) {
    if (!goal || !Array.isArray(goal.contributions)) return 0;
    return goal.contributions.reduce(
      (total, contribution) =>
        contribution &&
        !contribution.invalid &&
        isPositiveAmount(contribution.amount)
          ? total + contribution.amount
          : total,
      0,
    );
  }

  function validContributions(goal) {
    if (!goal || !Array.isArray(goal.contributions)) return [];
    return goal.contributions.filter(
      (contribution) =>
        contribution &&
        !contribution.invalid &&
        isPositiveAmount(contribution.amount) &&
        parseIsoDate(contribution.date),
    );
  }

  // جدیدترین مشارکت‌ها اول؛ برای تاریخ‌های برابر، مشارکت تازه‌تر بالاتر می‌آید.
  function sortContributions(contributions) {
    if (!Array.isArray(contributions)) return [];
    return contributions
      .map((contribution, index) => ({ contribution, index }))
      .sort((left, right) => {
        const byDate = String(right.contribution.date ?? "").localeCompare(
          String(left.contribution.date ?? ""),
        );
        return byDate !== 0 ? byDate : right.index - left.index;
      })
      .map((entry) => entry.contribution);
  }

  function validateGoal(input, todayIso, saved = 0) {
    if (!normalizeName(input && input.name)) return "نام هدف را وارد کنید.";
    if (!isPositiveAmount(input && input.target))
      return "مبلغ هدف باید عدد صحیح و بزرگ‌تر از صفر باشد.";
    if (isPositiveAmount(input.target) && input.target < saved)
      return "مبلغ هدف نمی‌تواند کمتر از مبلغ پس‌اندازشده باشد.";
    if (input.date) {
      if (!parseIsoDate(input.date)) return "تاریخ هدف معتبر نیست.";
      if (input.date <= todayIso) return "تاریخ هدف باید در آینده باشد.";
    }
    return null;
  }

  function validateContribution(input, todayIso) {
    if (!isPositiveAmount(input && input.amount))
      return "مبلغ پس‌انداز باید عدد صحیح و بزرگ‌تر از صفر باشد.";
    if (!parseIsoDate(input.date)) return "تاریخ پس‌انداز معتبر نیست.";
    if (input.date > todayIso) return "تاریخ پس‌انداز نمی‌تواند در آینده باشد.";
    return null;
  }

  function createGoal(input, options) {
    const todayIso = options.todayIso;
    return {
      id: options.id,
      name: normalizeName(input.name),
      description: normalizeDescription(input.description),
      emoji: normalizeEmoji(input.emoji),
      target: input.target,
      date: input.date || "",
      start_date: parseIsoDate(input.start_date) ? input.start_date : todayIso,
      priority: normalizePriority(input.priority),
      created_at: todayIso,
      contributions: [],
      plan: null,
      installments: [],
    };
  }

  // ویرایش نام/مبلغ/تاریخ/اولویت/توضیحات/ایموجی/تاریخ شروع؛ برنامه جداگانه ویرایش می‌شود.
  function updateGoal(goal, patch) {
    const startDate =
      patch.start_date === undefined
        ? parseIsoDate(goal.start_date)
          ? goal.start_date
          : parseIsoDate(goal.created_at)
            ? goal.created_at
            : ""
        : parseIsoDate(patch.start_date)
          ? patch.start_date
          : goal.start_date;
    return {
      ...goal,
      name: patch.name === undefined ? goal.name : normalizeName(patch.name),
      description:
        patch.description === undefined ? goal.description : normalizeDescription(patch.description),
      emoji: patch.emoji === undefined ? goal.emoji : normalizeEmoji(patch.emoji),
      target: patch.target === undefined ? goal.target : patch.target,
      date: patch.date === undefined ? goal.date : patch.date || "",
      start_date: startDate,
      priority:
        patch.priority === undefined
          ? normalizePriority(goal.priority)
          : normalizePriority(patch.priority),
      contributions: Array.isArray(goal.contributions) ? goal.contributions : [],
      installments: Array.isArray(goal.installments) ? goal.installments : [],
    };
  }

  function addContribution(goal, contribution) {
    return {
      ...goal,
      contributions: [
        ...(Array.isArray(goal.contributions) ? goal.contributions : []),
        contribution,
      ],
    };
  }

  function updateContribution(goal, contributionId, patch) {
    const contributions = Array.isArray(goal.contributions) ? goal.contributions : [];
    const nextAmount = isPositiveAmount(patch.amount) ? patch.amount : null;
    return {
      ...goal,
      contributions: contributions.map((contribution) =>
        contribution.id === contributionId ? { ...contribution, ...patch } : contribution,
      ),
      // اگر این مشارکت به یک دورهٔ برنامه وصل است، مبلغ واقعیِ دوره هم به‌روز می‌شود.
      installments: (Array.isArray(goal.installments) ? goal.installments : []).map((installment) =>
        installment.contributionId === contributionId && nextAmount
          ? { ...installment, paidAmount: nextAmount }
          : installment,
      ),
    };
  }

  function deleteContribution(goal, contributionId) {
    const contributions = Array.isArray(goal.contributions) ? goal.contributions : [];
    return {
      ...goal,
      contributions: contributions.filter((contribution) => contribution.id !== contributionId),
      // حذف مشارکت، دورهٔ متصل را به «در انتظار» برمی‌گرداند تا دوباره قابل ثبت باشد.
      installments: (Array.isArray(goal.installments) ? goal.installments : []).map((installment) =>
        installment.contributionId === contributionId
          ? {
              ...installment,
              status: "pending",
              contributionId: undefined,
              paidAmount: undefined,
              paid_date: undefined,
            }
          : installment,
      ),
    };
  }

  // درصد پیشرفت (۰ تا ۱۰۰) و مانده؛ هدف بدون مبلغ معتبر → null.
  function progressOf(goal) {
    if (!goal || !isPositiveAmount(goal.target)) return null;
    const saved = savedOf(goal);
    return {
      saved,
      remaining: Math.max(0, goal.target - saved),
      percent: Math.min(100, Math.floor((saved * 100) / goal.target)),
      completed: saved >= goal.target,
    };
  }

  // ─── وضعیت پیشرفت و تخمین تکمیل ────────────────────────────────────────────
  const STATUS_TOLERANCE = 10; // واحد درصد اختلاف مجاز بین پیشرفت واقعی و انتظار زمانی
  const MAX_ESTIMATE_MONTHS = 600; // سقف تخمین (۵۰ سال) تا تاریخ بی‌معنی ساخته نشود

  const dayNumber = (iso) => {
    const parsed = parseIsoDate(iso);
    return parsed ? Math.floor(Date.UTC(parsed.y, parsed.m - 1, parsed.d) / 86_400_000) : null;
  };

  // پیشرفت واقعی را با پیشرفت مورد انتظار خطی (زمان سپری‌شده ÷ مدت هدف) مقایسه می‌کند.
  // دادهٔ ناقص/نامعتبر → unknown؛ هرگز حدس زده نمی‌شود و تقسیم بر صفر رخ نمی‌دهد.
  function goalStatus(goal, todayIso) {
    const progress = progressOf(goal);
    if (!progress)
      return {
        status: "unknown",
        saved: 0,
        target: null,
        actualPercent: null,
        expectedPercent: null,
      };
    const base = {
      saved: progress.saved,
      target: goal.target,
      actualPercent: progress.percent,
      expectedPercent: null,
    };
    if (progress.completed) return { ...base, status: "completed", actualPercent: 100 };
    // مبنای انتظار زمانی، تاریخ شروع هدف است (اهداف قدیمی: تاریخ ساخت).
    const startIso = parseIsoDate(goal.start_date) ? goal.start_date : goal.created_at;
    const start = dayNumber(startIso);
    const end = dayNumber(goal.date);
    const now = dayNumber(todayIso);
    if (start === null || end === null || now === null || end <= start)
      return { ...base, status: "unknown" };
    // شروع در آینده یعنی هدف هنوز آغاز نشده است.
    if (start > now) return { ...base, status: "not_started", expectedPercent: 0 };
    const totalDays = end - start;
    const elapsedDays = Math.min(Math.max(now - start, 0), totalDays);
    const expected = Math.floor((elapsedDays * 100) / totalDays);
    const delta = progress.percent - expected;
    const status =
      delta > STATUS_TOLERANCE ? "ahead" : delta < -STATUS_TOLERANCE ? "behind" : "on_track";
    return { ...base, status, expectedPercent: expected, late: now > end };
  }

  function previousJalaliMonth(jy, jm, back) {
    let month = jm - back;
    let year = jy;
    while (month < 1) {
      month += 12;
      year -= 1;
    }
    return { jy: year, jm: month };
  }

  // افزودن ماه شمسی با محدودکردن روز به طول ماه مقصد (مثلاً ۳۱ اسفند → ۲۹/۳۰).
  function addJalaliMonths(parts, count) {
    const total = parts.jy * 12 + (parts.jm - 1) + count;
    const jy = Math.floor(total / 12);
    const jm = (total % 12) + 1;
    return { jy, jm, jd: Math.min(parts.jd, jalaliMonthLength(jy, jm)) };
  }

  // تخمین تاریخ تکمیل بر پایهٔ میانگین سه ماه کامل شمسی اخیر (شامل ماه‌های صفر).
  // اگر تاریخچه کافی نباشد یا میانگین صفر باشد، تاریخ ساختگی برنمی‌گرداند.
  function estimateCompletion(goal, todayIso) {
    const progress = progressOf(goal);
    if (!progress) return { date: null, reason: "invalid_target", months: null, monthlyAverage: null };
    if (progress.completed)
      return {
        date: null,
        reason: "completed",
        months: 0,
        monthlyAverage: null,
        completed: true,
      };
    const today = isoToJalali(todayIso);
    if (!today || !parseIsoDate(goal.created_at))
      return { date: null, reason: "insufficient_history", months: null, monthlyAverage: null };
    const months = [1, 2, 3].map((back) => previousJalaliMonth(today.jy, today.jm, back));
    const oldest = months[months.length - 1];
    const newest = months[0];
    const windowStart = jalaliToIso(oldest.jy, oldest.jm, 1);
    const windowEnd = jalaliToIso(newest.jy, newest.jm, jalaliMonthLength(newest.jy, newest.jm));
    // برای میانگین سه‌ماهه، هدف باید از ابتدای پنجره وجود داشته باشد.
    if (!windowStart || !windowEnd || goal.created_at > windowStart)
      return { date: null, reason: "insufficient_history", months: null, monthlyAverage: null };
    const total = validContributions(goal)
      .filter((contribution) => contribution.date >= windowStart && contribution.date <= windowEnd)
      .reduce((sum, contribution) => sum + contribution.amount, 0);
    const monthlyAverage = Math.floor(total / 3);
    if (monthlyAverage <= 0)
      return { date: null, reason: "no_contributions", months: null, monthlyAverage: 0 };
    const monthsToFinish = Math.ceil(progress.remaining / monthlyAverage);
    if (monthsToFinish > MAX_ESTIMATE_MONTHS)
      return { date: null, reason: "too_far", months: monthsToFinish, monthlyAverage };
    const target = addJalaliMonths(today, monthsToFinish);
    const date = jalaliToIso(target.jy, target.jm, target.jd);
    if (!date) return { date: null, reason: "too_far", months: monthsToFinish, monthlyAverage };
    return {
      date,
      reason: "ok",
      months: monthsToFinish,
      monthlyAverage,
      windowStart,
      windowEnd,
    };
  }

  // ─── برنامهٔ پس‌انداز دوره‌ای ───────────────────────────────────────────────
  const DESCRIPTION_MAX = 300;
  const PLAN_PERIODS = ["daily", "weekly", "monthly"];
  const PLAN_STATUSES = ["active", "paused", "completed"];
  const MAX_INSTALLMENTS = 2000;

  function normalizeDescription(value) {
    return String(value ?? "")
      .replace(/\r\n/g, "\n")
      .trim()
      .slice(0, DESCRIPTION_MAX);
  }

  function normalizeEmoji(value) {
    const text = String(value ?? "").trim();
    return text && text.length <= 8 ? text : "";
  }

  function shiftIso(iso, days) {
    const parsed = parseIsoDate(iso);
    if (!parsed) return null;
    const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  // n-امین سررسید از تاریخ شروع؛ برای ماهانه روز اصلی حفظ می‌شود (بدون انحراف).
  function dueDateAt(plan, index) {
    const start = parseIsoDate(plan.start_date);
    if (!start || index < 0) return null;
    if (plan.period === "daily") return shiftIso(plan.start_date, index);
    if (plan.period === "weekly") return shiftIso(plan.start_date, index * 7);
    const jalali = isoToJalali(plan.start_date);
    if (!jalali) return null;
    const parts = addJalaliMonths({ jy: jalali.jy, jm: jalali.jm, jd: jalali.jd }, index);
    return jalaliToIso(parts.jy, parts.jm, parts.jd);
  }

  // همهٔ سررسیدها از شروع تا «تا تاریخ» (شامل)؛ سقف تعداد برای جلوگیری از تولید بی‌پایان.
  function planDueDates(plan, untilIso) {
    const dates = [];
    if (!plan || !parseIsoDate(plan.start_date) || !parseIsoDate(untilIso)) return dates;
    for (let index = 0; index < MAX_INSTALLMENTS; index += 1) {
      const due = dueDateAt(plan, index);
      if (!due || due > untilIso) break;
      dates.push(due);
    }
    return dates;
  }

  function normalizePlan(raw) {
    if (!raw || typeof raw !== "object") return { plan: null, changed: raw !== undefined };
    const amount = isPositiveAmount(raw.amount) ? raw.amount : null;
    const start = parseIsoDate(raw.start_date) ? raw.start_date : null;
    if (!amount || !start) return { plan: null, changed: true };
    const plan = {
      id: typeof raw.id === "string" && raw.id ? raw.id : `plan:${start}`,
      amount,
      period: PLAN_PERIODS.includes(raw.period) ? raw.period : "monthly",
      start_date: start,
      status: PLAN_STATUSES.includes(raw.status) ? raw.status : "active",
      created_at: parseIsoDate(raw.created_at) ? raw.created_at : start,
    };
    if (parseIsoDate(raw.paused_at)) plan.paused_at = raw.paused_at;
    if (parseIsoDate(raw.resumed_at)) plan.resumed_at = raw.resumed_at;
    const changed =
      raw.id !== plan.id ||
      raw.amount !== plan.amount ||
      raw.period !== plan.period ||
      raw.start_date !== plan.start_date ||
      raw.status !== plan.status ||
      raw.created_at !== plan.created_at;
    return { plan, changed };
  }

  // دوره‌های «در انتظار» که موعدشان هنوز نرسیده، با تغییر برنامه بازتولید می‌شوند؛
  // دوره‌های گذشته و انجام‌شده/لغوشده دست‌نخورده می‌مانند.
  function applyPlan(goal, input, todayIso) {
    if (!input) return removePlan(goal);
    const normalized = normalizePlan({
      ...input,
      id: input.id || (goal.plan && goal.plan.id) || `plan:${todayIso}`,
      created_at: (goal.plan && goal.plan.created_at) || todayIso,
    });
    if (!normalized.plan) return { ...goal, plan: null, installments: [] };
    const kept = (Array.isArray(goal.installments) ? goal.installments : []).filter(
      (installment) =>
        installment.status !== "pending" || installment.due <= todayIso,
    );
    const next = { ...goal, plan: normalized.plan, installments: kept };
    const ensured = ensurePlanInstallments(next, todayIso);
    return ensured.goal;
  }

  function removePlan(goal) {
    return { ...goal, plan: null, installments: [] };
  }

  // دوره‌های تا امروز را یک‌بار می‌سازد؛ اجرای دوباره رکورد تکراری نمی‌سازد.
  function ensurePlanInstallments(goal, todayIso) {
    const plan = goal.plan;
    if (!plan) return { goal, changed: false };
    const existing = Array.isArray(goal.installments) ? goal.installments : [];
    const byDue = new Map(existing.map((installment) => [installment.due, installment]));
    const installments = existing.slice();
    let changed = false;
    planDueDates(plan, todayIso).forEach((due) => {
      if (byDue.has(due)) return;
      installments.push({
        id: `${plan.id}:${due}`,
        due,
        amount: plan.amount,
        status: "pending",
      });
      changed = true;
    });
    installments.sort((a, b) => (a.due < b.due ? -1 : 1));
    return { goal: { ...goal, installments }, changed };
  }

  function inPauseWindow(due, plan) {
    if (!plan.paused_at || due < plan.paused_at) return false;
    if (!plan.resumed_at) return true;
    return due <= plan.resumed_at;
  }

  // وضعیت مؤثر هر دوره: انجام‌شده/لغوشده ذخیره می‌شوند، «تأخیر» همیشه مشتق می‌شود.
  function installmentStatus(installment, plan, todayIso) {
    if (!installment) return "pending";
    if (installment.status === "done") return "done";
    if (installment.status === "cancelled") return "cancelled";
    if (plan && inPauseWindow(installment.due, plan)) return "paused";
    return installment.due < todayIso ? "late" : "pending";
  }

  function nextPlanDue(goal, todayIso) {
    const plan = goal.plan;
    if (!plan) return null;
    const start = parseIsoDate(plan.start_date);
    if (!start) return null;
    for (let index = 0; index < MAX_INSTALLMENTS; index += 1) {
      const due = dueDateAt(plan, index);
      if (!due) return null;
      if (due > todayIso) return due;
    }
    return null;
  }

  function planSummary(goal, todayIso) {
    const plan = goal.plan;
    if (!plan) return null;
    const progress = progressOf(goal);
    const installments = Array.isArray(goal.installments) ? goal.installments : [];
    const counts = { done: 0, late: 0, cancelled: 0, pending: 0, paused: 0 };
    installments.forEach((installment) => {
      counts[installmentStatus(installment, plan, todayIso)] += 1;
    });
    const paid = installments.reduce(
      (sum, installment) =>
        installment.status === "done" ? sum + (installment.paidAmount || installment.amount) : sum,
      0,
    );
    const nextDue = nextPlanDue(goal, todayIso);
    const remaining = progress ? progress.remaining : 0;
    const completed = (progress && progress.completed) || plan.status === "completed";
    let forecast = null;
    if (!completed && nextDue && isPositiveAmount(plan.amount)) {
      const periods = Math.ceil(remaining / plan.amount);
      const last = dueDateAt(
        { ...plan, start_date: nextDue },
        Math.max(0, periods - 1),
      );
      if (last) forecast = { date: last, periods, amount: plan.amount };
    }
    return {
      plan,
      counts,
      paid,
      nextDue,
      completed,
      forecast,
      total: installments.length,
    };
  }

  // ثبت انجام یک دوره: مشارکت واقعی اضافه می‌شود و خود دوره «انجام‌شده» می‌شود.
  function payInstallment(goal, installmentId, payment, todayIso) {
    const installments = Array.isArray(goal.installments) ? goal.installments : [];
    const installment = installments.find((entry) => entry.id === installmentId);
    if (!installment) return { goal, changed: false, reason: "missing" };
    if (installmentStatus(installment, goal.plan, todayIso) === "done")
      return { goal, changed: false, reason: "already_done" };
    if (installmentStatus(installment, goal.plan, todayIso) === "cancelled")
      return { goal, changed: false, reason: "cancelled" };
    const amount = isPositiveAmount(payment.amount) ? payment.amount : null;
    if (!amount) return { goal, changed: false, reason: "invalid_amount" };
    const date = parseIsoDate(payment.date) && payment.date <= todayIso ? payment.date : todayIso;
    const contribution = {
      id: payment.id || `${goal.id}:pay:${installment.due}`,
      amount,
      date,
      note: payment.note || "",
    };
    return {
      goal: {
        ...goal,
        contributions: [...(Array.isArray(goal.contributions) ? goal.contributions : []), contribution],
        installments: installments.map((entry) =>
          entry.id === installmentId
            ? {
                ...entry,
                status: "done",
                contributionId: contribution.id,
                paidAmount: amount,
                paid_date: date,
              }
            : entry,
        ),
      },
      changed: true,
      contribution,
    };
  }

  function cancelInstallment(goal, installmentId) {
    return {
      ...goal,
      installments: (Array.isArray(goal.installments) ? goal.installments : []).map((installment) =>
        installment.id === installmentId ? { ...installment, status: "cancelled" } : installment,
      ),
    };
  }

  function pausePlan(goal, todayIso) {
    if (!goal.plan) return goal;
    return { ...goal, plan: { ...goal.plan, status: "paused", paused_at: todayIso } };
  }

  function resumePlan(goal, todayIso) {
    if (!goal.plan) return goal;
    return { ...goal, plan: { ...goal.plan, status: "active", resumed_at: todayIso } };
  }

  function validateGoalDates(startDate, endDate) {
    if (!startDate) return "تاریخ شروع معتبر نیست.";
    if (endDate && endDate < startDate) return "تاریخ هدف نمی‌تواند قبل از تاریخ شروع باشد.";
    return null;
  }

  // ─── مهاجرت داده‌های قدیمی ─────────────────────────────────────────────────
  function normalizeContribution(raw, goalId, index, usedIds) {
    if (!raw || typeof raw !== "object") return { contribution: null, changed: true };
    const contribution = { ...raw };
    let changed = false;
    let id =
      typeof contribution.id === "string" && contribution.id.trim() ? contribution.id : null;
    if (!id) {
      id = `${goalId}:c${index}`;
      changed = true;
    }
    if (usedIds.has(id)) {
      id = `${goalId}:c${index}`;
      changed = true;
    }
    usedIds.add(id);
    if (contribution.id !== id) {
      contribution.id = id;
      changed = true;
    }
    if (!parseIsoDate(contribution.date)) {
      // تاریخ نامعتبر حذف نمی‌شود، ولی از جمع کنار گذاشته و برای اصلاح علامت می‌خورد.
      contribution.invalid = true;
      changed = true;
    }
    if (!isPositiveAmount(contribution.amount)) {
      contribution.invalid = true;
      changed = true;
    }
    if (typeof contribution.note !== "string") contribution.note = "";
    return { contribution, changed };
  }

  // هدف قدیمی (saved) را به مدل مشارکتی تبدیل می‌کند؛ idempotent است و داده را دور نمی‌ریزد.
  function migrateGoal(raw, todayIso) {
    if (!raw || typeof raw !== "object") return { goal: null, changed: true };
    const goal = { ...raw };
    let changed = false;

    if (!Array.isArray(goal.contributions)) {
      changed = true;
      const contributions = [];
      if (Number.isSafeInteger(goal.saved) && goal.saved > 0) {
        contributions.push({
          id: `${goal.id}:initial`,
          amount: goal.saved,
          date: parseIsoDate(goal.created_at) ? goal.created_at : todayIso,
          note: INITIAL_CONTRIBUTION_NOTE,
        });
      } else if (goal.saved !== undefined && goal.saved !== 0) {
        // مبلغ نامعتبر به صفر تبدیل نمی‌شود؛ مقدار اصلی برای بازیابی نگه داشته می‌شود.
        goal.legacy_saved = goal.saved;
        goal.invalid = true;
      }
      goal.contributions = contributions;
      delete goal.saved;
    }

    if (!parseIsoDate(goal.created_at)) {
      goal.created_at = todayIso;
      changed = true;
    }

    if (goal.date === undefined || goal.date === null) goal.date = "";
    else if (goal.date && !parseIsoDate(goal.date)) {
      goal.legacy_date = goal.date;
      goal.date = "";
      changed = true;
    }

    if (!isPositiveAmount(goal.target)) {
      goal.legacy_target = goal.target;
      goal.target = null;
      goal.invalid = true;
      changed = true;
    }

    // اهداف قدیمی بدون اولویت، «متوسط» می‌گیرند؛ اولویت معتبر موجود حفظ می‌شود.
    const priority = normalizePriority(goal.priority);
    if (goal.priority !== priority) {
      goal.priority = priority;
      changed = true;
    }

    // توضیحات/ایموجی/تاریخ شروع: اهداف قدیمی مقادیر پیش‌فرض سازگار می‌گیرند.
    if (typeof goal.description !== "string") {
      goal.description = "";
      changed = true;
    } else if (normalizeDescription(goal.description) !== goal.description) {
      goal.description = normalizeDescription(goal.description);
      changed = true;
    }
    if (typeof goal.emoji !== "string") {
      goal.emoji = "";
      changed = true;
    } else if (normalizeEmoji(goal.emoji) !== goal.emoji) {
      goal.emoji = normalizeEmoji(goal.emoji);
      changed = true;
    }
    if (!parseIsoDate(goal.start_date)) {
      goal.start_date = parseIsoDate(goal.created_at) ? goal.created_at : todayIso;
      changed = true;
    }

    // برنامهٔ پس‌انداز: نرمال‌سازی و ساخت دوره‌های تا امروز (یک‌بار برای هر سررسید).
    if (goal.plan !== undefined) {
      const normalizedPlan = normalizePlan(goal.plan);
      if (!normalizedPlan.plan) {
        if (goal.plan !== null) {
          goal.plan = null;
          changed = true;
        }
      } else {
        goal.plan = normalizedPlan.plan;
        if (normalizedPlan.changed) changed = true;
      }
    }
    if (goal.plan) {
      const ensured = ensurePlanInstallments(goal, todayIso);
      goal.installments = ensured.goal.installments;
      if (ensured.changed) changed = true;
    } else if (Array.isArray(goal.installments) && goal.installments.length) {
      goal.installments = [];
      changed = true;
    }

    const usedIds = new Set();
    goal.contributions = goal.contributions.map((contribution, index) => {
      const normalized = normalizeContribution(contribution, String(goal.id), index, usedIds);
      if (normalized.changed) changed = true;
      return normalized.contribution;
    });
    goal.contributions = goal.contributions.filter(Boolean);

    return { goal, changed };
  }

  // کل state را می‌پذیرد، فقط اهداف را مهاجرت می‌دهد و نسخه را ۳ می‌کند.
  function migrateState(raw, todayIso) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { state: null, changed: true };
    let changed = false;
    const state = { ...raw };
    if (!Array.isArray(state.goals)) {
      state.goals = [];
      changed = true;
    }
    state.goals = state.goals
      .map((goal) => {
        const migrated = migrateGoal(goal, todayIso);
        if (migrated.changed) changed = true;
        return migrated.goal;
      })
      .filter(Boolean);
    if (state.v !== 3) {
      state.v = 3;
      changed = true;
    }
    return { state, changed };
  }

  return {
    JALALI_MONTHS,
    GOAL_TEMPLATES,
    INITIAL_CONTRIBUTION_NOTE,
    isJalaliLeap,
    jalaliMonthLength,
    isValidJalali,
    jalaliToIso,
    isoToJalali,
    parseIsoDate,
    normalizeDigits,
    parseMoney,
    formatMoney,
    moneyToWords,
    moneyPreview,
    savedOf,
    validContributions,
    sortContributions,
    validateGoal,
    validateContribution,
    createGoal,
    updateGoal,
    addContribution,
    updateContribution,
    deleteContribution,
    progressOf,
    goalStatus,
    estimateCompletion,
    addJalaliMonths,
    PRIORITIES,
    DEFAULT_PRIORITY,
    normalizePriority,
    DESCRIPTION_MAX,
    PLAN_PERIODS,
    PLAN_STATUSES,
    normalizeDescription,
    normalizeEmoji,
    normalizePlan,
    planDueDates,
    ensurePlanInstallments,
    installmentStatus,
    planSummary,
    nextPlanDue,
    applyPlan,
    removePlan,
    pausePlan,
    resumePlan,
    payInstallment,
    cancelInstallment,
    validateGoalDates,
    migrateGoal,
    migrateState,
  };
});
