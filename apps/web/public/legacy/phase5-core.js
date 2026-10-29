(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DaraPhase5Core = api;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  "use strict";

  const MAX_CSV_BYTES = 1_000_000;
  const MAX_CSV_ROWS = 5_000;
  const CSV_HEADERS = ["date", "type", "amount", "account", "category", "description", "note", "targetAccount"];
  const TOPICS = ["budgeting", "saving", "debt", "investing", "trading", "privacy"];
  const DEFAULT_PREFERENCES = Object.freeze({
    objectives: [],
    literacy: "beginner",
    explanation: "balanced",
    topics: ["budgeting", "saving"],
    responseLength: "standard",
    reportFrequency: "off",
    guidanceStyle: "analytical",
    notifications: {
      budgetThreshold: true,
      budgetExceeded: true,
      recurringDue: true,
      goalMilestone: true,
    },
    timeZone: "UTC",
    consentToExternalAi: false,
  });

  function normalizeName(value) {
    return String(value ?? "").trim().normalize("NFKC").toLocaleLowerCase();
  }

  function preferences(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const notificationInput = source.notifications && typeof source.notifications === "object"
      ? source.notifications
      : {};
    const objectives = Array.isArray(source.objectives)
      ? source.objectives.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 10)
      : DEFAULT_PREFERENCES.objectives;
    const topics = Array.isArray(source.topics)
      ? [...new Set(source.topics.filter((item) => TOPICS.includes(item)))]
      : [...DEFAULT_PREFERENCES.topics];
    const timeZone = typeof source.timeZone === "string" && source.timeZone.trim()
      ? source.timeZone.trim()
      : Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_PREFERENCES.timeZone;
    try {
      new Intl.DateTimeFormat("en", { timeZone });
    } catch {
      throw new Error("منطقهٔ زمانی واردشده معتبر نیست.");
    }
    return {
      objectives,
      literacy: ["beginner", "intermediate", "advanced"].includes(source.literacy)
        ? source.literacy
        : DEFAULT_PREFERENCES.literacy,
      explanation: ["simple", "balanced", "detailed"].includes(source.explanation)
        ? source.explanation
        : DEFAULT_PREFERENCES.explanation,
      topics,
      responseLength: ["short", "standard", "long"].includes(source.responseLength)
        ? source.responseLength
        : DEFAULT_PREFERENCES.responseLength,
      reportFrequency: ["off", "weekly", "monthly"].includes(source.reportFrequency)
        ? source.reportFrequency
        : DEFAULT_PREFERENCES.reportFrequency,
      guidanceStyle: ["educational", "analytical"].includes(source.guidanceStyle)
        ? source.guidanceStyle
        : DEFAULT_PREFERENCES.guidanceStyle,
      notifications: {
        budgetThreshold: notificationInput.budgetThreshold !== false,
        budgetExceeded: notificationInput.budgetExceeded !== false,
        recurringDue: notificationInput.recurringDue !== false,
        goalMilestone: notificationInput.goalMilestone !== false,
      },
      timeZone,
      consentToExternalAi: source.consentToExternalAi === true,
    };
  }

  function csvCell(value) {
    let text = String(value ?? "");
    if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function csvParse(text) {
    if (typeof text !== "string") throw new Error("محتوای CSV متنی نیست.");
    if (new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES)
      throw new Error("حجم CSV نباید بیشتر از ۱ مگابایت باشد.");
    const input = text.replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];
      if (quoted) {
        if (char === '"' && input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
      } else if (char === '"' && field === "") {
        quoted = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && input[index + 1] === "\n") index += 1;
        row.push(field);
        field = "";
        if (row.some((cell) => cell !== "")) rows.push(row);
        row = [];
      } else {
        field += char;
      }
      if (rows.length > MAX_CSV_ROWS + 1) throw new Error("فایل CSV بیش از ۵۰۰۰ ردیف دارد.");
    }
    if (quoted) throw new Error("ساختار CSV ناقص است؛ کوتیشن بسته نشده.");
    if (field !== "" || row.length) {
      row.push(field);
      if (row.some((cell) => cell !== "")) rows.push(row);
    }
    return rows;
  }

  function transactionKey(transaction) {
    return [
      transaction.type,
      String(transaction.amount),
      transaction.date,
      normalizeName(transaction.acc),
      normalizeName(transaction.to),
      String(transaction.cat ?? ""),
      normalizeName(transaction.desc),
      normalizeName(transaction.note),
    ].join("\u001f");
  }

  function previewCsv(text, state, mapping = {}) {
    const rows = csvParse(text);
    if (!rows.length) throw new Error("فایل CSV خالی است.");
    const headers = rows[0].map((header) => header.trim());
    const missing = CSV_HEADERS.filter((header) => !headers.includes(header));
    if (missing.length) throw new Error(`ستون‌های لازم موجود نیستند: ${missing.join(", ")}`);
    const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
    const accounts = new Map(state.accounts.map((account) => [normalizeName(account.name), account]));
    const categories = new Map(state.cats.map((category) => [normalizeName(category.name), category]));
    const accountMappings = mapping.accounts || {};
    const categoryMappings = mapping.categories || {};
    const existing = new Set(state.tx.map(transactionKey));
    const imported = new Set();
    const items = [];

    for (const [offset, values] of rows.slice(1).entries()) {
      const line = offset + 2;
      if (values.length !== headers.length) {
        items.push({ line, status: "invalid", error: "تعداد ستون‌های ردیف با عنوان‌ها سازگار نیست." });
        continue;
      }
      const get = (key) => values[indexes[key]]?.trim() || "";
      const type = get("type");
      const amountText = get("amount").replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[٬،\s]/g, "");
      const amount = Number(amountText);
      const date = get("date");
      if (!["income", "expense", "transfer"].includes(type)) {
        items.push({ line, status: "invalid", error: "نوع باید income، expense یا transfer باشد." });
        continue;
      }
      if (!/^\d+$/.test(amountText) || !Number.isSafeInteger(amount) || amount <= 0) {
        items.push({ line, status: "invalid", error: "مبلغ باید عدد صحیح مثبت و قابل‌پردازش باشد." });
        continue;
      }
      const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? new Date(`${date}T00:00:00Z`)
        : null;
      if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
        items.push({ line, status: "invalid", error: "تاریخ باید به‌شکل معتبر YYYY-MM-DD باشد." });
        continue;
      }
      const accountLabel = get("account");
      const targetLabel = get("targetAccount");
      const categoryLabel = get("category");
      const account = accounts.get(normalizeName(accountMappings[accountLabel] || accountLabel));
      const target = type === "transfer"
        ? accounts.get(normalizeName(accountMappings[targetLabel] || targetLabel))
        : null;
      const category = type === "transfer"
        ? null
        : categories.get(normalizeName(categoryMappings[categoryLabel] || categoryLabel));
      if (!account || (type === "transfer" && !target)) {
        items.push({
          line,
          status: "mapping_required",
          error: !account ? `حساب «${accountLabel}» را نگاشت کنید.` : `حساب مقصد «${targetLabel}» را نگاشت کنید.`,
          accountLabel,
          targetLabel,
          categoryLabel,
          raw: { type, amount, date, desc: get("description"), note: get("note") },
        });
        continue;
      }
      if (type !== "transfer" && (!category || category.kind !== type)) {
        items.push({
          line,
          status: "mapping_required",
          error: `دسته‌بندی «${categoryLabel}» را به دستهٔ ${type} نگاشت کنید.`,
          accountLabel,
          targetLabel,
          categoryLabel,
          raw: { type, amount, date, desc: get("description"), note: get("note") },
        });
        continue;
      }
      if (type === "transfer" && account.id === target.id) {
        items.push({ line, status: "invalid", error: "حساب مبدأ و مقصد انتقال باید متفاوت باشند." });
        continue;
      }
      const transaction = {
        type,
        amount,
        date,
        acc: account.id,
        to: target?.id || null,
        cat: category?.id || null,
        desc: get("description"),
        note: get("note"),
      };
      const key = transactionKey(transaction);
      if (existing.has(key) || imported.has(key)) {
        items.push({ line, status: "duplicate", transaction });
        continue;
      }
      imported.add(key);
      items.push({ line, status: "ready", transaction });
    }
    return {
      totalRows: rows.length - 1,
      items,
      importable: items.filter((item) => item.status === "ready").length,
      duplicates: items.filter((item) => item.status === "duplicate").length,
      invalid: items.filter((item) => item.status === "invalid").length,
      mappingRequired: items.filter((item) => item.status === "mapping_required").length,
    };
  }

  function exportTransactions(transactions, accounts, categories) {
    const accountName = new Map(accounts.map((account) => [account.id, account.name]));
    const categoryName = new Map(categories.map((category) => [category.id, category.name]));
    const lines = [CSV_HEADERS.join(",")];
    for (const transaction of transactions) {
      lines.push([
        transaction.date,
        transaction.type,
        transaction.amount,
        accountName.get(transaction.acc) || "",
        categoryName.get(transaction.cat) || "",
        transaction.desc || "",
        transaction.note || "",
        accountName.get(transaction.to) || "",
      ].map(csvCell).join(","));
    }
    return `\uFEFF${lines.join("\r\n")}\r\n`;
  }

  function notifications(state, period, preferencesInput, now = new Date()) {
    const prefs = preferences(preferencesInput);
    const events = [];
    const expenseTotals = {};
    state.tx.filter((transaction) =>
      transaction.type === "expense" && transaction.date >= period.start && transaction.date <= period.end,
    ).forEach((transaction) => {
      expenseTotals[transaction.cat] = (expenseTotals[transaction.cat] || 0) + transaction.amount;
    });
    for (const [categoryId, limit] of Object.entries(state.budgets)) {
      const spent = expenseTotals[categoryId] || 0;
      if (limit <= 0) continue;
      const ratio = spent / limit;
      if (ratio >= 1 && prefs.notifications.budgetExceeded) {
        events.push({
          id: `budget-exceeded:${period.start}:${categoryId}`,
          type: "budget_exceeded",
          title: "بودجه از سقف گذشته",
          detail: "هزینهٔ ثبت‌شده برای این دسته از سقف بودجه بیشتر شده است.",
          amount: spent - limit,
          categoryId,
          createdAt: now.toISOString(),
        });
      } else if (ratio >= 0.8 && prefs.notifications.budgetThreshold) {
        events.push({
          id: `budget-threshold:${period.start}:${categoryId}`,
          type: "budget_threshold",
          title: "بودجه به آستانه نزدیک است",
          detail: "هزینهٔ ثبت‌شده به ۸۰٪ یا بیشتر از سقف رسیده است.",
          categoryId,
          amount: spent,
          createdAt: now.toISOString(),
        });
      }
    }
    const cutoff = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
    if (prefs.notifications.recurringDue) {
      for (const recurring of state.rec) {
        if (recurring.next > cutoff) continue;
        events.push({
          id: `recurring-due:${recurring.id}:${recurring.next}`,
          type: "recurring_due",
          title: "سررسید پرداخت تکرارشونده",
          detail: "یک قانون تکرارشونده تا ۳۰ روز آینده سررسید می‌شود یا از موعد آن گذشته است.",
          recurringId: recurring.id,
          dueDate: recurring.next,
          amount: recurring.amount,
          createdAt: now.toISOString(),
        });
      }
    }
    if (prefs.notifications.goalMilestone) {
      for (const goal of state.goals) {
        if (goal.target <= 0) continue;
        const percent = Math.min(100, (goal.saved / goal.target) * 100);
        const milestone = [25, 50, 75, 100].filter((value) => percent >= value).pop();
        if (milestone) {
          events.push({
            id: `goal-milestone:${goal.id}:${milestone}`,
            type: "goal_milestone",
            title: `هدف پس‌انداز به ${milestone}٪ رسید`,
            detail: "این یادآور بر اساس مبلغ ذخیره‌شدهٔ واردشده محاسبه شده است.",
            goalId: goal.id,
            milestone,
            amount: goal.saved,
            createdAt: now.toISOString(),
          });
        }
      }
    }
    return [...new Map(events.map((event) => [event.id, event])).values()];
  }

  return {
    MAX_CSV_BYTES,
    MAX_CSV_ROWS,
    CSV_HEADERS,
    TOPICS,
    DEFAULT_PREFERENCES,
    preferences,
    csvParse,
    previewCsv,
    exportTransactions,
    notifications,
  };
});
