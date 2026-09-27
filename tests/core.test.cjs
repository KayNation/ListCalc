const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseAmountToKobo,
  formatKobo,
  calculateTotalKobo,
  calculateItemPaidKobo,
  findLatestActiveSettlement,
  calculateItemRemainingKobo,
  calculatePaidTotalKobo,
  calculateRemainingTotalKobo,
  countCompletedItems,
  isDuplicateLibraryName,
  createCalculatorState,
  calculatorReduce,
} = require("../core.js");

test("parses supported naira amount formats exactly into kobo", () => {
  assert.deepEqual(parseAmountToKobo("5000"), { ok: true, value: 500000 });
  assert.deepEqual(parseAmountToKobo("5,000"), { ok: true, value: 500000 });
  assert.deepEqual(parseAmountToKobo("₦ 5,000.50"), { ok: true, value: 500050 });
  assert.deepEqual(parseAmountToKobo("0.50"), { ok: true, value: 50 });
});

test("rejects zero, negative, malformed, alphabetic, and over-precise amounts", () => {
  for (const value of ["0", "-500", "12.345", "five thousand", "12,34"]) {
    assert.equal(parseAmountToKobo(value).ok, false, value);
  }
});

test("formats whole naira without decimals and kobo with two decimals", () => {
  assert.equal(formatKobo(500000), "₦5,000");
  assert.equal(formatKobo(500050), "₦5,000.50");
});

test("totals the requested Netflix, Prime Video, and NEPA example", () => {
  const items = [
    { amountKobo: 500000 },
    { amountKobo: 600000 },
    { amountKobo: 1000000 },
  ];
  assert.equal(calculateTotalKobo(items), 2100000);
  assert.equal(formatKobo(calculateTotalKobo(items)), "₦21,000");
});

test("tracks a partial payment and remaining balance exactly", () => {
  const rent = {
    amountKobo: 200000000,
    history: [{ type: "payment", deltaPaidKobo: 100000000 }],
  };
  assert.equal(calculateItemPaidKobo(rent), 100000000);
  assert.equal(calculateItemRemainingKobo(rent), 100000000);
  assert.equal(formatKobo(calculateItemRemainingKobo(rent)), "₦1,000,000");
});

test("treats an imported v1.0.1 item as fully outstanding until a payment is recorded", () => {
  const rent = {
    amountKobo: 200000000,
    history: [
      {
        id: "history-imported-item-v2-rent",
        type: "imported",
        amountKobo: 200000000,
        balanceKobo: 200000000,
      },
    ],
  };
  assert.equal(calculateItemPaidKobo(rent), 0);
  assert.equal(calculateItemRemainingKobo(rent), 200000000);
  assert.equal(calculatePaidTotalKobo([rent]), 0);
  assert.equal(calculateRemainingTotalKobo([rent]), 200000000);
  assert.equal(countCompletedItems([rent]), 0);
});

test("checking and unchecking an item settles and restores only its outstanding balance", () => {
  const rent = {
    amountKobo: 200000000,
    history: [
      { id: "payment-1", type: "payment", deltaPaidKobo: 100000000 },
      { id: "settlement-1", type: "settlement", deltaPaidKobo: 100000000 },
    ],
  };
  assert.equal(calculateItemRemainingKobo(rent), 0);
  assert.equal(findLatestActiveSettlement(rent)?.id, "settlement-1");
  rent.history.push({
    id: "reversal-1",
    type: "settlement_reversed",
    reversesEventId: "settlement-1",
  });
  assert.equal(calculateItemPaidKobo(rent), 100000000);
  assert.equal(calculateItemRemainingKobo(rent), 100000000);
  assert.equal(findLatestActiveSettlement(rent), null);
  rent.history.push({
    id: "reversal-duplicate",
    type: "settlement_reversed",
    reversesEventId: "settlement-1",
  });
  assert.equal(calculateItemPaidKobo(rent), 100000000);
});

test("reversing a settlement preserves earlier payments after a total correction", () => {
  const rent = {
    amountKobo: 150000000,
    history: [
      { id: "payment-1", type: "payment", deltaPaidKobo: 100000000 },
      { id: "settlement-1", type: "settlement", deltaPaidKobo: 100000000 },
      {
        id: "reversal-1",
        type: "settlement_reversed",
        reversesEventId: "settlement-1",
      },
    ],
  };
  assert.equal(calculateItemPaidKobo(rent), 100000000);
  assert.equal(calculateItemRemainingKobo(rent), 50000000);
});

test("summarizes planned, paid, remaining, and completed amounts", () => {
  const items = [
    {
      amountKobo: 200000000,
      history: [{ type: "payment", deltaPaidKobo: 100000000 }],
    },
    {
      amountKobo: 500000,
      history: [{ id: "settlement-bill", type: "settlement", deltaPaidKobo: 500000 }],
    },
  ];
  assert.equal(calculateTotalKobo(items), 200500000);
  assert.equal(calculatePaidTotalKobo(items), 100500000);
  assert.equal(calculateRemainingTotalKobo(items), 100000000);
  assert.equal(countCompletedItems(items), 1);
});

test("ignores malformed payment history and clamps overpayments", () => {
  const item = {
    amountKobo: 100000,
    history: [
      { type: "description_changed", deltaPaidKobo: 999999 },
      { type: "payment", deltaPaidKobo: 150000 },
      { type: "payment", deltaPaidKobo: "500" },
    ],
  };
  assert.equal(calculateItemPaidKobo(item), 100000);
  assert.equal(calculateItemRemainingKobo(item), 0);
});

test("detects duplicate library names without regard to case or extra spaces", () => {
  const libraries = [{ id: "1", name: "Debts Calculation" }];
  assert.equal(isDuplicateLibraryName(libraries, " debts   calculation "), true);
  assert.equal(isDuplicateLibraryName(libraries, "Monthly Bills"), false);
  assert.equal(isDuplicateLibraryName(libraries, "DEBTS CALCULATION", "1"), false);
});

function enterNumber(state, numberText) {
  return [...numberText].reduce((next, character) => {
    if (character === ".") return calculatorReduce(next, { type: "decimal" });
    return calculatorReduce(next, { type: "digit", value: character });
  }, state);
}

function operate(state, symbol) {
  return calculatorReduce(state, { type: "operator", value: symbol });
}

test("calculator produces ₦21,000 for 5000 + 6000 + 10000", () => {
  let state = enterNumber(createCalculatorState(), "5000");
  state = operate(state, "+");
  state = enterNumber(state, "6000");
  state = operate(state, "+");
  state = enterNumber(state, "10000");
  state = calculatorReduce(state, { type: "equals" });
  assert.equal(state.display, "21000");
  assert.equal(state.error, "");
});

test("calculator preserves decimal precision for 1000.50 + 0.50", () => {
  let state = enterNumber(createCalculatorState(), "1000.50");
  state = operate(state, "+");
  state = enterNumber(state, "0.50");
  state = calculatorReduce(state, { type: "equals" });
  assert.equal(state.display, "1001");
});

test("calculator fails safely on division by zero and recovers after clear", () => {
  let state = enterNumber(createCalculatorState(), "10");
  state = operate(state, "÷");
  state = enterNumber(state, "0");
  state = calculatorReduce(state, { type: "equals" });
  assert.equal(state.error, "Cannot divide by zero");
  state = calculatorReduce(state, { type: "clear" });
  assert.deepEqual(state, createCalculatorState());
});
