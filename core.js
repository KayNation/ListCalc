(function attachListCalcCore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.ListCalcCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createListCalcCore() {
  "use strict";

  const MAX_AMOUNT_KOBO = 99999999999999;

  function parseAmountToKobo(input) {
    const original = String(input ?? "").trim();
    const cleaned = original.replace(/^₦\s*/, "").replace(/\s+/g, "");
    const grouped = /^\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?$/;
    const plain = /^\d+(?:\.\d{1,2})?$/;

    if (!cleaned) {
      return { ok: false, error: "Enter an amount." };
    }

    if (!(plain.test(cleaned) || grouped.test(cleaned))) {
      return {
        ok: false,
        error: "Use numbers only, with no more than 2 decimal places.",
      };
    }

    const normalized = cleaned.replace(/,/g, "");
    const [whole, fraction = ""] = normalized.split(".");
    const kobo = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));

    if (kobo <= 0n) {
      return { ok: false, error: "Amount must be greater than ₦0." };
    }

    if (kobo > BigInt(MAX_AMOUNT_KOBO)) {
      return { ok: false, error: "That amount is too large." };
    }

    return { ok: true, value: Number(kobo) };
  }

  function formatKobo(amountKobo) {
    const safeAmount =
      typeof amountKobo === "bigint"
        ? amountKobo
        : Number.isSafeInteger(amountKobo)
          ? BigInt(amountKobo)
          : 0n;
    const sign = safeAmount < 0n ? "−" : "";
    const absolute = safeAmount < 0n ? -safeAmount : safeAmount;
    const whole = (absolute / 100n).toLocaleString("en-NG");
    const fraction = String(absolute % 100n).padStart(2, "0");
    return `${sign}₦${whole}${fraction === "00" ? "" : `.${fraction}`}`;
  }

  function formatKoboForSpeech(amountKobo) {
    const safeAmount =
      typeof amountKobo === "bigint"
        ? amountKobo
        : Number.isSafeInteger(amountKobo)
          ? BigInt(amountKobo)
          : 0n;
    const absolute = safeAmount < 0n ? -safeAmount : safeAmount;
    const whole = (absolute / 100n).toLocaleString("en-NG");
    const fraction = absolute % 100n;
    const sign = safeAmount < 0n ? "minus " : "";
    return `${sign}${whole} naira${fraction ? ` and ${fraction} kobo` : ""}`;
  }

  function calculateTotalKobo(items) {
    const total = (Array.isArray(items) ? items : []).reduce((sum, item) => {
      const amount = Number(item && item.amountKobo);
      return Number.isSafeInteger(amount) ? sum + BigInt(amount) : sum;
    }, 0n);
    return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : total;
  }

  function calculateItemPaidKobo(item) {
    const amount = Number(item && item.amountKobo);
    if (!Number.isSafeInteger(amount) || amount <= 0) return 0;

    let paid = 0n;
    const activeSettlements = new Map();
    (Array.isArray(item.history) ? item.history : []).forEach((entry) => {
      if (!entry) return;
      if (entry.type === "payment") {
        const delta = Number(entry.deltaPaidKobo);
        if (!Number.isSafeInteger(delta) || delta <= 0) return;
        paid += BigInt(delta);
      } else if (entry.type === "settlement") {
        const delta = Number(entry.deltaPaidKobo);
        if (
          typeof entry.id !== "string" ||
          !Number.isSafeInteger(delta) ||
          delta <= 0 ||
          activeSettlements.has(entry.id)
        ) {
          return;
        }
        paid += BigInt(delta);
        activeSettlements.set(entry.id, delta);
      } else if (entry.type === "settlement_reversed") {
        const settlementAmount = activeSettlements.get(entry.reversesEventId);
        if (!settlementAmount) return;
        paid -= BigInt(settlementAmount);
        activeSettlements.delete(entry.reversesEventId);
      } else {
        return;
      }
    });
    if (paid < 0n) return 0;
    return Number(paid > BigInt(amount) ? BigInt(amount) : paid);
  }

  function findLatestActiveSettlement(item) {
    const active = new Map();
    (Array.isArray(item?.history) ? item.history : []).forEach((entry) => {
      if (
        entry?.type === "settlement" &&
        typeof entry.id === "string" &&
        Number.isSafeInteger(entry.deltaPaidKobo) &&
        entry.deltaPaidKobo > 0
      ) {
        active.set(entry.id, entry);
      } else if (
        entry?.type === "settlement_reversed" &&
        typeof entry.reversesEventId === "string"
      ) {
        active.delete(entry.reversesEventId);
      }
    });
    return [...active.values()].at(-1) || null;
  }

  function calculateItemRemainingKobo(item) {
    const amount = Number(item && item.amountKobo);
    if (!Number.isSafeInteger(amount) || amount <= 0) return 0;
    return amount - calculateItemPaidKobo(item);
  }

  function calculatePaidTotalKobo(items) {
    const total = (Array.isArray(items) ? items : []).reduce(
      (sum, item) => sum + BigInt(calculateItemPaidKobo(item)),
      0n,
    );
    return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : total;
  }

  function calculateRemainingTotalKobo(items) {
    const total = (Array.isArray(items) ? items : []).reduce(
      (sum, item) => sum + BigInt(calculateItemRemainingKobo(item)),
      0n,
    );
    return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : total;
  }

  function countCompletedItems(items) {
    return (Array.isArray(items) ? items : []).filter(
      (item) => Number(item?.amountKobo) > 0 && calculateItemRemainingKobo(item) === 0,
    ).length;
  }

  function normalizeName(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
  }

  function isDuplicateLibraryName(libraries, name, ignoredId) {
    const candidate = normalizeName(name).toLocaleLowerCase("en-NG");
    return (Array.isArray(libraries) ? libraries : []).some(
      (library) =>
        library &&
        library.id !== ignoredId &&
        normalizeName(library.name).toLocaleLowerCase("en-NG") === candidate,
    );
  }

  function createCalculatorState() {
    return {
      display: "0",
      expression: "",
      storedValue: null,
      operator: null,
      waitingForOperand: false,
      error: "",
    };
  }

  function countDigits(value) {
    return String(value).replace(/[^0-9]/g, "").length;
  }

  function toDisplayNumber(value) {
    if (!Number.isFinite(value)) return "0";
    const normalized = Math.round((value + Number.EPSILON) * 1e10) / 1e10;
    if (Math.abs(normalized) >= 1e15) return normalized.toExponential(8);
    return String(normalized);
  }

  function performOperation(left, right, operator) {
    if (operator === "+") return { value: left + right };
    if (operator === "−") return { value: left - right };
    if (operator === "×") return { value: left * right };
    if (operator === "÷") {
      if (right === 0) return { error: "Cannot divide by zero" };
      return { value: left / right };
    }
    return { value: right };
  }

  function calculatorReduce(currentState, action) {
    let state = { ...currentState };
    const type = action && action.type;
    const value = action && action.value;

    if (type === "clear") return createCalculatorState();

    if (state.error) {
      if (type === "digit" || type === "decimal") {
        state = createCalculatorState();
      } else {
        return state;
      }
    }

    if (type === "digit") {
      const digit = String(value);
      if (!/^\d$/.test(digit)) return state;
      if (state.waitingForOperand) {
        return { ...state, display: digit, waitingForOperand: false };
      }
      if (countDigits(state.display) >= 15) return state;
      return {
        ...state,
        display: state.display === "0" ? digit : `${state.display}${digit}`,
      };
    }

    if (type === "decimal") {
      if (state.waitingForOperand) {
        return { ...state, display: "0.", waitingForOperand: false };
      }
      if (state.display.includes(".")) return state;
      return { ...state, display: `${state.display}.` };
    }

    if (type === "backspace") {
      if (state.waitingForOperand) return state;
      const shortened = state.display.slice(0, -1);
      return {
        ...state,
        display: shortened && shortened !== "-" ? shortened : "0",
      };
    }

    if (type === "toggle-sign") {
      if (state.display === "0") return state;
      return {
        ...state,
        display: state.display.startsWith("-")
          ? state.display.slice(1)
          : `-${state.display}`,
      };
    }

    if (type === "percent") {
      const result = Number(state.display) / 100;
      return { ...state, display: toDisplayNumber(result) };
    }

    if (type === "operator") {
      if (!["+", "−", "×", "÷"].includes(value)) return state;
      const inputValue = Number(state.display);

      if (state.operator && state.waitingForOperand) {
        return {
          ...state,
          operator: value,
          expression: `${toDisplayNumber(state.storedValue)} ${value}`,
        };
      }

      let nextValue = inputValue;
      if (state.operator && state.storedValue !== null) {
        const operation = performOperation(state.storedValue, inputValue, state.operator);
        if (operation.error) return { ...state, error: operation.error };
        nextValue = operation.value;
      }

      const nextDisplay = toDisplayNumber(nextValue);
      return {
        ...state,
        display: nextDisplay,
        storedValue: Number(nextDisplay),
        operator: value,
        waitingForOperand: true,
        expression: `${nextDisplay} ${value}`,
      };
    }

    if (type === "equals") {
      if (!state.operator || state.storedValue === null) return state;
      const right = Number(state.display);
      const operation = performOperation(state.storedValue, right, state.operator);
      if (operation.error) {
        return { ...state, error: operation.error, expression: "" };
      }
      const result = toDisplayNumber(operation.value);
      return {
        ...state,
        display: result,
        expression: `${toDisplayNumber(state.storedValue)} ${state.operator} ${toDisplayNumber(right)} =`,
        storedValue: null,
        operator: null,
        waitingForOperand: true,
      };
    }

    return state;
  }

  function formatCalculatorDisplay(display) {
    const value = String(display || "0");
    if (/e/i.test(value)) return `₦${value}`;
    const negative = value.startsWith("-");
    const unsigned = negative ? value.slice(1) : value;
    const [whole, fraction] = unsigned.split(".");
    const grouped = (whole || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${negative ? "−" : ""}₦${grouped}${fraction !== undefined ? `.${fraction}` : ""}`;
  }

  return {
    MAX_AMOUNT_KOBO,
    parseAmountToKobo,
    formatKobo,
    formatKoboForSpeech,
    calculateTotalKobo,
    calculateItemPaidKobo,
    findLatestActiveSettlement,
    calculateItemRemainingKobo,
    calculatePaidTotalKobo,
    calculateRemainingTotalKobo,
    countCompletedItems,
    normalizeName,
    isDuplicateLibraryName,
    createCalculatorState,
    calculatorReduce,
    formatCalculatorDisplay,
  };
});
