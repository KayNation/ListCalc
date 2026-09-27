const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseUrl = process.env.LISTCALC_TEST_URL || "http://127.0.0.1:8765/";
const chromePath = process.env.LISTCALC_CHROME_PATH;

async function clickCalculatorKey(page, type, value) {
  const selector = value
    ? `[data-calc-type="${type}"][data-calc-value="${value}"]`
    : `[data-calc-type="${type}"]`;
  await page.locator(selector).click();
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(chromePath ? { executablePath: chromePath } : {}),
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    locale: "en-NG",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#screenTitle").waitFor({ state: "visible" });

  assert.equal(await page.locator("#screenTitle").textContent(), "Calculator");
  assert.equal(await page.locator("#calculatorOutput").textContent(), "₦0");
  assert.equal(await page.locator("#libraryCount").textContent(), "0");
  assert.equal(await page.locator("#libraryNavList .library-nav-row").count(), 0);
  assert.equal(
    await page.evaluate(() => window.localStorage.getItem("listcalc.device-library.v1")),
    null,
    "a fresh launch must not contain saved libraries",
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
    "phone view should not have horizontal overflow",
  );
  assert.equal(
    await page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay").count(),
    0,
  );
  await page.locator("#openDrawerButton").click();
  await page.locator("#drawer.is-open").waitFor();
  await page.locator("#calculatorNavButton").click();
  assert.equal(await page.locator("#screenTitle").textContent(), "Calculator");

  await clickCalculatorKey(page, "clear");
  for (const digit of "5000") await clickCalculatorKey(page, "digit", digit);
  await clickCalculatorKey(page, "operator", "+");
  for (const digit of "6000") await clickCalculatorKey(page, "digit", digit);
  await clickCalculatorKey(page, "operator", "+");
  for (const digit of "10000") await clickCalculatorKey(page, "digit", digit);
  await clickCalculatorKey(page, "equals");
  assert.equal(await page.locator("#calculatorOutput").textContent(), "₦21,000");

  await page.locator("#openDrawerButton").click();
  await page.locator("#newLibraryButton").click();
  await page.locator("#newLibraryName").fill("Debt to be paid");
  await page.locator("#newLibraryForm button[type=submit]").click();
  assert.equal(await page.locator("#screenTitle").textContent(), "Debt to be paid");
  assert.equal(await page.locator("#libraryTotal").textContent(), "₦0");
  assert.equal(await page.locator("#libraryPlannedTotal").textContent(), "₦0");
  assert.equal(await page.locator("#libraryPaidTotal").textContent(), "₦0");
  assert.equal(await page.locator("#libraryProgress").textContent(), "0 of 0 paid");

  await page.locator("#itemDescription").fill("House rent");
  await page.locator("#itemAmount").fill("2000000");
  await page.locator("#addItemButton").click();
  assert.equal(await page.locator("#libraryTotal").textContent(), "₦2,000,000");
  assert.equal(await page.locator("#libraryPlannedTotal").textContent(), "₦2,000,000");
  assert.equal(await page.locator("#libraryPaidTotal").textContent(), "₦0");
  assert.equal(await page.locator("#libraryProgress").textContent(), "0 of 1 paid");
  assert.equal(await page.locator("#itemList .item-row").count(), 1);
  assert.equal(
    await page.locator("#itemList .item-progress").textContent(),
    "₦2,000,000 total · No payment yet",
  );
  assert.equal(await page.locator("#itemList .item-amount").textContent(), "₦2,000,000");
  assert.equal(await page.locator("#itemList .item-checkbox").isChecked(), false);

  await page.locator("#itemList .row-action", { hasText: "Edit" }).click();
  assert.equal(await page.locator("#editOriginalAmount").textContent(), "₦2,000,000");
  assert.equal(await page.locator("#editPaidAmount").textContent(), "₦0");
  assert.equal(await page.locator("#editRemainingAmount").textContent(), "₦2,000,000");
  await page.locator("#editPaymentAmount").fill("1000000");
  assert.equal(await page.locator("#editProjectedBalance").textContent(), "₦1,000,000");
  await page.locator("#editItemForm button[type=submit]").click();
  assert.equal(await page.locator("#libraryTotal").textContent(), "₦1,000,000");
  assert.equal(await page.locator("#libraryPlannedTotal").textContent(), "₦2,000,000");
  assert.equal(await page.locator("#libraryPaidTotal").textContent(), "₦1,000,000");
  assert.equal(await page.locator("#libraryProgress").textContent(), "0 of 1 paid");
  assert.equal(
    await page.locator("#itemList .item-progress").textContent(),
    "Paid ₦1,000,000 of ₦2,000,000",
  );
  assert.equal(await page.locator("#itemList .item-amount").textContent(), "₦1,000,000");

  await page.locator("#itemList .item-balance-button").click();
  assert.equal(await page.locator("#itemHistoryDescription").textContent(), "House rent");
  assert.equal(await page.locator("#historyOriginalAmount").textContent(), "₦2,000,000");
  assert.equal(await page.locator("#historyPaidAmount").textContent(), "₦1,000,000");
  assert.equal(await page.locator("#historyRemainingAmount").textContent(), "₦1,000,000");
  assert.deepEqual(await page.locator("#itemHistoryList .history-entry-title").allTextContents(), [
    "Payment recorded: ₦1,000,000",
    "Item created",
  ]);
  await page.locator("#closeItemHistoryButton").click();

  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("#screenTitle").textContent(), "Debt to be paid");
  assert.equal(await page.locator("#libraryTotal").textContent(), "₦1,000,000");
  assert.equal(await page.locator("#libraryPlannedTotal").textContent(), "₦2,000,000");
  assert.equal(await page.locator("#libraryPaidTotal").textContent(), "₦1,000,000");

  await page.locator("#itemList .row-action", { hasText: "Edit" }).click();
  await page.locator("#editPaymentAmount").fill("1000001");
  await page.locator("#editItemForm button[type=submit]").click();
  assert.equal(await page.locator("#editItemDialog").getAttribute("open"), "");
  assert.equal(
    await page.locator("#editPaymentError").textContent(),
    "Payment cannot exceed the ₦1,000,000 remaining balance.",
  );
  assert.equal(
    await page.evaluate(() => {
      const saved = JSON.parse(window.localStorage.getItem("listcalc.device-library.v1"));
      return saved.libraries[0].items[0].history.length;
    }),
    2,
    "a rejected overpayment must not add history",
  );
  await page.locator('[data-close-dialog="editItemDialog"]').click();

  await page.locator("#itemList .item-checkbox").check();
  assert.equal(await page.locator("#libraryTotal").textContent(), "₦0");
  assert.equal(await page.locator("#libraryPlannedTotal").textContent(), "₦2,000,000");
  assert.equal(await page.locator("#libraryPaidTotal").textContent(), "₦2,000,000");
  assert.equal(await page.locator("#libraryProgress").textContent(), "1 of 1 paid");
  assert.equal(await page.locator("#itemList .item-checkbox").isChecked(), true);
  assert.equal(await page.locator("#itemList .item-progress").textContent(), "Paid in full · ₦2,000,000 total");

  await page.locator("#itemList .item-balance-button").click();
  assert.deepEqual((await page.locator("#itemHistoryList .history-entry-title").allTextContents()).slice(0, 2), [
    "Marked paid: ₦1,000,000",
    "Payment recorded: ₦1,000,000",
  ]);
  await page.locator("#closeItemHistoryButton").click();

  await page.locator("#itemList .item-checkbox").uncheck();
  assert.equal(await page.locator("#libraryTotal").textContent(), "₦1,000,000");
  assert.equal(await page.locator("#libraryPaidTotal").textContent(), "₦1,000,000");
  assert.equal(await page.locator("#libraryProgress").textContent(), "0 of 1 paid");
  assert.equal(await page.locator("#itemList .item-checkbox").isChecked(), false);

  await page.locator("#itemList .item-balance-button").click();
  assert.deepEqual((await page.locator("#itemHistoryList .history-entry-title").allTextContents()).slice(0, 3), [
    "Paid check undone: ₦1,000,000 restored",
    "Marked paid: ₦1,000,000",
    "Payment recorded: ₦1,000,000",
  ]);
  await page.locator("#closeItemHistoryButton").click();

  assert.deepEqual(
    await page.evaluate(() => {
      const saved = JSON.parse(window.localStorage.getItem("listcalc.device-library.v1"));
      const item = saved.libraries[0].items[0];
      return {
        version: saved.version,
        libraryName: saved.libraries[0].name,
        description: item.description,
        originalAmountKobo: item.originalAmountKobo,
        amountKobo: item.amountKobo,
        historyTypes: item.history.map((entry) => entry.type),
      };
    }),
    {
      version: 3,
      libraryName: "Debt to be paid",
      description: "House rent",
      originalAmountKobo: 200000000,
      amountKobo: 200000000,
      historyTypes: ["created", "payment", "settlement", "settlement_reversed"],
    },
  );

  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("#screenTitle").textContent(), "Debt to be paid");
  assert.equal(await page.locator("#libraryTotal").textContent(), "₦1,000,000");
  assert.equal(await page.locator("#libraryPlannedTotal").textContent(), "₦2,000,000");
  assert.equal(await page.locator("#libraryPaidTotal").textContent(), "₦1,000,000");
  assert.equal(await page.locator("#itemList .item-checkbox").isChecked(), false);

  await page.locator("#itemList .row-action", { hasText: "Delete" }).click();
  assert.equal(await page.locator("#itemsEmptyState").isVisible(), true);
  await page.locator("#toastAction").click();
  assert.equal(await page.locator("#libraryTotal").textContent(), "₦1,000,000");
  assert.equal(await page.locator("#libraryPaidTotal").textContent(), "₦1,000,000");

  await page.evaluate(() => {
    window.SpeechRecognition = class MockSpeechRecognition {
      constructor() {
        this.continuous = false;
        this.interimResults = true;
      }
      start() {
        this.onstart?.();
        setTimeout(() => {
          const result = [{ transcript: "Internet subscription" }];
          result.isFinal = true;
          this.onresult?.({ resultIndex: 0, results: [result] });
          this.onend?.();
        }, 20);
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onerror?.({ error: "aborted" });
        this.onend?.();
      }
    };
  });
  await page.locator("#speakButton").click();
  await page.waitForFunction(() => document.querySelector("#itemDescription").value.includes("Internet subscription"));
  assert.equal(await page.locator("#itemAmount").inputValue(), "");
  await page.waitForFunction(() => document.activeElement === document.querySelector("#itemAmount"));
  assert.equal(await page.locator("#itemAmount").evaluate((element) => document.activeElement === element), true);

  const manifestResponse = await page.request.get(new URL("manifest.webmanifest", baseUrl).href);
  const iconResponse = await page.request.get(new URL("icons/icon-512.png", baseUrl).href);
  assert.equal(manifestResponse.ok(), true);
  assert.equal(iconResponse.ok(), true);

  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) await navigator.serviceWorker.ready;
  });
  assert.equal(await page.evaluate(() => "serviceWorker" in navigator), true);

  const desktop = await context.newPage();
  await desktop.setViewportSize({ width: 1280, height: 900 });
  await desktop.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(
    await desktop.locator("#drawer").evaluate((element) => Math.round(element.getBoundingClientRect().left) === 0),
    true,
  );
  assert.equal(
    await desktop.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
  );

  const legacyContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "en-NG",
  });
  const legacyPage = await legacyContext.newPage();
  await legacyPage.goto(baseUrl, { waitUntil: "networkidle" });
  await legacyPage.evaluate(() => {
    const now = new Date().toISOString();
    window.localStorage.setItem(
      "listcalc.device-library.v1",
      JSON.stringify({
        version: 1,
        view: "library",
        activeLibraryId: "library-example-debts",
        libraries: [
          {
            id: "library-example-debts",
            name: "Debts Calculation",
            isSample: true,
            createdAt: now,
            updatedAt: now,
            items: [
              {
                id: "item-example-netflix",
                description: "Netflix",
                amountKobo: 500000,
                createdAt: now,
                updatedAt: now,
              },
              {
                id: "item-example-prime",
                description: "Prime Video",
                amountKobo: 600000,
                createdAt: now,
                updatedAt: now,
              },
              {
                id: "item-example-nepa",
                description: "NEPA bill",
                amountKobo: 1000000,
                createdAt: now,
                updatedAt: now,
              },
            ],
          },
        ],
      }),
    );
  });
  await legacyPage.reload({ waitUntil: "networkidle" });
  assert.equal(await legacyPage.locator("#screenTitle").textContent(), "Calculator");
  assert.equal(await legacyPage.locator("#calculatorOutput").textContent(), "₦0");
  assert.equal(await legacyPage.locator("#libraryCount").textContent(), "0");
  assert.deepEqual(
    await legacyPage.evaluate(() => {
      const saved = JSON.parse(window.localStorage.getItem("listcalc.device-library.v1"));
      return { version: saved.version, libraryCount: saved.libraries.length };
    }),
    { version: 3, libraryCount: 0 },
  );

  await legacyPage.evaluate(() => {
    const now = new Date().toISOString();
    const sampleItems = [
      ["item-example-netflix", "Netflix", 500000],
      ["item-example-prime", "Prime Video", 600000],
      ["item-example-nepa", "NEPA bill", 1000000],
    ].map(([id, description, amountKobo]) => ({
      id,
      description,
      amountKobo,
      createdAt: now,
      updatedAt: now,
    }));
    window.localStorage.setItem(
      "listcalc.device-library.v1",
      JSON.stringify({
        version: 1,
        view: "library",
        activeLibraryId: "library-example-debts",
        libraries: [
          {
            id: "library-example-debts",
            name: "Debts Calculation",
            isSample: true,
            createdAt: now,
            updatedAt: now,
            items: sampleItems,
          },
          {
            id: "library-user-bills",
            name: "Personal Bills",
            isSample: false,
            createdAt: now,
            updatedAt: new Date(Date.now() + 1000).toISOString(),
            items: [],
          },
        ],
      }),
    );
  });
  await legacyPage.reload({ waitUntil: "networkidle" });
  assert.equal(await legacyPage.locator("#screenTitle").textContent(), "Personal Bills");
  assert.equal(await legacyPage.locator("#libraryCount").textContent(), "1");
  assert.deepEqual(
    await legacyPage.evaluate(() => {
      const saved = JSON.parse(window.localStorage.getItem("listcalc.device-library.v1"));
      return {
        version: saved.version,
        libraryNames: saved.libraries.map((library) => library.name),
      };
    }),
    { version: 3, libraryNames: ["Personal Bills"] },
  );
  await legacyContext.close();

  const v2Context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "en-NG",
  });
  const v2Page = await v2Context.newPage();
  await v2Page.goto(baseUrl, { waitUntil: "networkidle" });
  const v2LibraryCreatedAt = "2026-01-02T08:30:00.000Z";
  const v2LibraryUpdatedAt = "2026-02-03T09:45:00.000Z";
  const v2ItemCreatedAt = "2026-01-04T10:15:00.000Z";
  const v2ItemUpdatedAt = "2026-02-05T11:20:00.000Z";
  await v2Page.evaluate(
    ({ libraryCreatedAt, libraryUpdatedAt, itemCreatedAt, itemUpdatedAt }) => {
      window.localStorage.setItem(
        "listcalc.device-library.v1",
        JSON.stringify({
          version: 2,
          view: "library",
          activeLibraryId: "library-v2-debts",
          libraries: [
            {
              id: "library-v2-debts",
              name: "Debt archive",
              isSample: false,
              createdAt: libraryCreatedAt,
              updatedAt: libraryUpdatedAt,
              items: [
                {
                  id: "item-v2-house-rent",
                  description: "House rent",
                  amountKobo: 200000000,
                  createdAt: itemCreatedAt,
                  updatedAt: itemUpdatedAt,
                },
              ],
            },
          ],
        }),
      );
    },
    {
      libraryCreatedAt: v2LibraryCreatedAt,
      libraryUpdatedAt: v2LibraryUpdatedAt,
      itemCreatedAt: v2ItemCreatedAt,
      itemUpdatedAt: v2ItemUpdatedAt,
    },
  );
  await v2Page.reload({ waitUntil: "networkidle" });
  assert.equal(await v2Page.locator("#screenTitle").textContent(), "Debt archive");
  assert.equal(await v2Page.locator("#libraryTotal").textContent(), "₦2,000,000");
  assert.equal(await v2Page.locator("#libraryPlannedTotal").textContent(), "₦2,000,000");
  assert.equal(await v2Page.locator("#libraryPaidTotal").textContent(), "₦0");
  assert.deepEqual(
    await v2Page.evaluate(() => {
      const saved = JSON.parse(window.localStorage.getItem("listcalc.device-library.v1"));
      const library = saved.libraries[0];
      const item = library.items[0];
      return {
        version: saved.version,
        view: saved.view,
        activeLibraryId: saved.activeLibraryId,
        library: {
          id: library.id,
          createdAt: library.createdAt,
          updatedAt: library.updatedAt,
        },
        item: {
          id: item.id,
          description: item.description,
          originalAmountKobo: item.originalAmountKobo,
          amountKobo: item.amountKobo,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          history: item.history,
        },
      };
    }),
    {
      version: 3,
      view: "library",
      activeLibraryId: "library-v2-debts",
      library: {
        id: "library-v2-debts",
        createdAt: v2LibraryCreatedAt,
        updatedAt: v2LibraryUpdatedAt,
      },
      item: {
        id: "item-v2-house-rent",
        description: "House rent",
        originalAmountKobo: 200000000,
        amountKobo: 200000000,
        createdAt: v2ItemCreatedAt,
        updatedAt: v2ItemUpdatedAt,
        history: [
          {
            id: "history-imported-item-v2-house-rent",
            type: "imported",
            at: v2ItemUpdatedAt,
            amountKobo: 200000000,
            balanceKobo: 200000000,
          },
        ],
      },
    },
  );
  await v2Page.locator("#itemList .item-balance-button").click();
  assert.deepEqual(await v2Page.locator("#itemHistoryList .history-entry-title").allTextContents(), [
    "Starting balance imported",
  ]);
  assert.equal(
    await v2Page.locator("#itemHistoryList .history-entry-detail").textContent(),
    "₦2,000,000 carried forward from the earlier app version",
  );
  await v2Context.close();

  const futureContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const futurePage = await futureContext.newPage();
  await futurePage.goto(baseUrl, { waitUntil: "networkidle" });
  const futureState = {
    version: 99,
    view: "library",
    activeLibraryId: "future-library",
    futureOnlyField: "must survive",
    libraries: [
      {
        id: "future-library",
        name: "Future data",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        items: [],
      },
    ],
  };
  await futurePage.evaluate((saved) => {
    window.localStorage.setItem("listcalc.device-library.v1", JSON.stringify(saved));
  }, futureState);
  await futurePage.reload({ waitUntil: "networkidle" });
  assert.equal(await futurePage.locator("#screenTitle").textContent(), "Calculator");
  await futurePage.locator("#openDrawerButton").click();
  await futurePage.locator("#newLibraryButton").click();
  await futurePage.locator("#newLibraryName").fill("Must not overwrite");
  await futurePage.locator('#newLibraryForm button[type="submit"]').click();
  assert.equal(await futurePage.locator("#newLibraryDialog").getAttribute("open"), "");
  assert.match(await futurePage.locator("#toastMessage").textContent(), /newer ListCalc version/i);
  assert.deepEqual(
    await futurePage.evaluate(() =>
      JSON.parse(window.localStorage.getItem("listcalc.device-library.v1")),
    ),
    futureState,
    "a future-version state must never be downgraded or overwritten",
  );
  await futureContext.close();

  const storageFailureContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const storageFailurePage = await storageFailureContext.newPage();
  await storageFailurePage.goto(baseUrl, { waitUntil: "networkidle" });
  await storageFailurePage.evaluate(() => {
    window.localStorage.clear();
    Storage.prototype.setItem = function rejectStorageWrite() {
      throw new DOMException("Storage unavailable", "QuotaExceededError");
    };
  });
  await storageFailurePage.locator("#openDrawerButton").click();
  await storageFailurePage.locator("#newLibraryButton").click();
  await storageFailurePage.locator("#newLibraryName").fill("Unsaved library");
  await storageFailurePage.locator('#newLibraryForm button[type="submit"]').click();
  assert.equal(await storageFailurePage.locator("#newLibraryDialog").getAttribute("open"), "");
  assert.equal(await storageFailurePage.locator("#libraryCount").textContent(), "0");
  assert.match(await storageFailurePage.locator("#toastMessage").textContent(), /Couldn.t save/i);
  await storageFailureContext.close();

  const repairContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const repairPage = await repairContext.newPage();
  await repairPage.goto(baseUrl, { waitUntil: "networkidle" });
  await repairPage.evaluate(() => {
    window.localStorage.setItem(
      "listcalc.device-library.v1",
      JSON.stringify({
        version: 3,
        view: "library",
        activeLibraryId: "repair-library",
        libraries: [
          {
            id: "repair-library",
            name: "Repair test",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            items: [
              {
                id: "repair-item",
                description: "Invalid overpayment",
                originalAmountKobo: 100000,
                amountKobo: 100000,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
                history: [
                  {
                    id: "repair-baseline",
                    type: "imported",
                    at: "2026-01-01T00:00:00.000Z",
                    amountKobo: 100000,
                    balanceKobo: 100000,
                  },
                  {
                    id: "invalid-payment",
                    type: "payment",
                    at: "2026-01-02T00:00:00.000Z",
                    deltaPaidKobo: 150000,
                    balanceKobo: 0,
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
  });
  await repairPage.reload({ waitUntil: "networkidle" });
  assert.equal(await repairPage.locator("#libraryTotal").textContent(), "₦1,000");
  assert.equal(await repairPage.locator("#libraryPaidTotal").textContent(), "₦0");
  assert.equal(
    await repairPage.evaluate(() => {
      const saved = JSON.parse(window.localStorage.getItem("listcalc.device-library.v1"));
      return saved.libraries[0].items[0].history.length;
    }),
    1,
    "an impossible overpayment must be removed and the repaired state written back",
  );
  await repairContext.close();

  assert.deepEqual(consoleErrors, [], `browser console errors: ${consoleErrors.join(" | ")}`);
  console.log("Browser smoke test passed: empty launch, debt payments, totals, history, checklist reversal, overpayment rejection, atomic save failure, v1/v2 migration, future-version protection, calculator, voice, responsive layouts, manifest, icons, and service worker.");
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
