(function startListCalc() {
  "use strict";

  const {
    parseAmountToKobo,
    formatKobo,
    formatKoboForSpeech,
    calculateTotalKobo,
    calculateItemPaidKobo,
    calculateItemRemainingKobo,
    calculatePaidTotalKobo,
    calculateRemainingTotalKobo,
    countCompletedItems,
    findLatestActiveSettlement,
    normalizeName,
    isDuplicateLibraryName,
    createCalculatorState,
    calculatorReduce,
    formatCalculatorDisplay,
  } = window.ListCalcCore;

  const STORAGE_KEY = "listcalc.device-library.v1";
  const STATE_VERSION = 3;
  const LEGACY_SAMPLE_LIBRARY_ID = "library-example-debts";
  const LEGACY_SAMPLE_ITEMS = [
    ["item-example-netflix", "Netflix", 500000],
    ["item-example-prime", "Prime Video", 600000],
    ["item-example-nepa", "NEPA bill", 1000000],
  ];
  const MAX_DESCRIPTION_LENGTH = 120;
  const MAX_LIBRARY_NAME_LENGTH = 50;
  const HISTORY_TYPES = new Set([
    "created",
    "imported",
    "payment",
    "settlement",
    "settlement_reversed",
    "amount_changed",
    "description_changed",
  ]);

  const elements = {
    drawer: document.getElementById("drawer"),
    drawerOverlay: document.getElementById("drawerOverlay"),
    openDrawerButton: document.getElementById("openDrawerButton"),
    closeDrawerButton: document.getElementById("closeDrawerButton"),
    calculatorNavButton: document.getElementById("calculatorNavButton"),
    libraryNavList: document.getElementById("libraryNavList"),
    libraryCount: document.getElementById("libraryCount"),
    newLibraryButton: document.getElementById("newLibraryButton"),
    installButton: document.getElementById("installButton"),
    screenEyebrow: document.getElementById("screenEyebrow"),
    screenTitle: document.getElementById("screenTitle"),
    libraryActionsWrap: document.getElementById("libraryActionsWrap"),
    topbarSpacer: document.getElementById("topbarSpacer"),
    libraryMoreButton: document.getElementById("libraryMoreButton"),
    libraryActionMenu: document.getElementById("libraryActionMenu"),
    renameLibraryButton: document.getElementById("renameLibraryButton"),
    deleteLibraryButton: document.getElementById("deleteLibraryButton"),
    calculatorView: document.getElementById("calculatorView"),
    libraryView: document.getElementById("libraryView"),
    calculatorKeypad: document.getElementById("calculatorKeypad"),
    calculatorExpression: document.getElementById("calculatorExpression"),
    calculatorOutput: document.getElementById("calculatorOutput"),
    libraryTotal: document.getElementById("libraryTotal"),
    libraryPlannedTotal: document.getElementById("libraryPlannedTotal"),
    libraryPaidTotal: document.getElementById("libraryPaidTotal"),
    libraryProgress: document.getElementById("libraryProgress"),
    librarySummary: document.getElementById("librarySummary"),
    addItemForm: document.getElementById("addItemForm"),
    itemDescription: document.getElementById("itemDescription"),
    itemAmount: document.getElementById("itemAmount"),
    addItemButton: document.getElementById("addItemButton"),
    speakButton: document.getElementById("speakButton"),
    speakButtonText: document.getElementById("speakButtonText"),
    voiceStatus: document.getElementById("voiceStatus"),
    descriptionError: document.getElementById("descriptionError"),
    amountError: document.getElementById("amountError"),
    itemList: document.getElementById("itemList"),
    itemsEmptyState: document.getElementById("itemsEmptyState"),
    itemCountLabel: document.getElementById("itemCountLabel"),
    newLibraryDialog: document.getElementById("newLibraryDialog"),
    newLibraryForm: document.getElementById("newLibraryForm"),
    newLibraryName: document.getElementById("newLibraryName"),
    newLibraryError: document.getElementById("newLibraryError"),
    renameLibraryDialog: document.getElementById("renameLibraryDialog"),
    renameLibraryForm: document.getElementById("renameLibraryForm"),
    renameLibraryName: document.getElementById("renameLibraryName"),
    renameLibraryError: document.getElementById("renameLibraryError"),
    editItemDialog: document.getElementById("editItemDialog"),
    editItemForm: document.getElementById("editItemForm"),
    editItemDescription: document.getElementById("editItemDescription"),
    editItemAmount: document.getElementById("editItemAmount"),
    editPaymentAmount: document.getElementById("editPaymentAmount"),
    editOriginalAmount: document.getElementById("editOriginalAmount"),
    editPaidAmount: document.getElementById("editPaidAmount"),
    editRemainingAmount: document.getElementById("editRemainingAmount"),
    editProjectedBalance: document.getElementById("editProjectedBalance"),
    editDescriptionError: document.getElementById("editDescriptionError"),
    editAmountError: document.getElementById("editAmountError"),
    editPaymentError: document.getElementById("editPaymentError"),
    itemHistoryDialog: document.getElementById("itemHistoryDialog"),
    itemHistoryHeading: document.getElementById("itemHistoryHeading"),
    itemHistoryDescription: document.getElementById("itemHistoryDescription"),
    historyOriginalAmount: document.getElementById("historyOriginalAmount"),
    historyPaidAmount: document.getElementById("historyPaidAmount"),
    historyRemainingAmount: document.getElementById("historyRemainingAmount"),
    itemHistoryList: document.getElementById("itemHistoryList"),
    closeItemHistoryButton: document.getElementById("closeItemHistoryButton"),
    deleteLibraryDialog: document.getElementById("deleteLibraryDialog"),
    deleteLibraryForm: document.getElementById("deleteLibraryForm"),
    deleteLibraryMessage: document.getElementById("deleteLibraryMessage"),
    toast: document.getElementById("toast"),
    toastMessage: document.getElementById("toastMessage"),
    toastAction: document.getElementById("toastAction"),
  };

  let storageReadOnly = false;
  let state = loadState();
  if (new URLSearchParams(window.location.search).get("view") === "calculator") {
    state.view = "calculator";
  }
  let calculatorState = createCalculatorState();
  let editingItemId = null;
  let historyItemId = null;
  let historyReturnFocus = null;
  let addInProgress = false;
  let editSaveInProgress = false;
  let toastTimer = null;
  let toastUndo = null;
  let deferredInstallPrompt = null;
  let activeRecognition = null;
  let recognitionIsListening = false;
  let nativeVoiceSession = null;
  const nativeAndroidMode = new URLSearchParams(window.location.search).get("native") === "android";
  const nativeBridgeState = {
    present: Boolean(window.ListCalcAndroid && typeof window.ListCalcAndroid.postMessage === "function"),
    ready: false,
    speechAvailable: false,
    pendingStart: false,
  };
  let storageWarningShown = false;

  function createId(prefix) {
    const randomPart =
      window.crypto && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${randomPart}`;
  }

  function createInitialState() {
    return {
      version: STATE_VERSION,
      view: "calculator",
      activeLibraryId: null,
      libraries: [],
    };
  }

  function isExactLegacyDevelopmentSample(library) {
    if (
      !library ||
      library.id !== LEGACY_SAMPLE_LIBRARY_ID ||
      library.name !== "Debts Calculation" ||
      library.isSample !== true ||
      !Array.isArray(library.items) ||
      library.items.length !== LEGACY_SAMPLE_ITEMS.length ||
      typeof library.createdAt !== "string" ||
      library.updatedAt !== library.createdAt
    ) {
      return false;
    }

    return library.items.every((item, index) => {
      const [id, description, amountKobo] = LEGACY_SAMPLE_ITEMS[index];
      return (
        item?.id === id &&
        item.description === description &&
        item.amountKobo === amountKobo &&
        item.createdAt === library.createdAt &&
        item.updatedAt === library.createdAt
      );
    });
  }

  function migrateState(candidate) {
    if (!candidate || !Array.isArray(candidate.libraries)) {
      return { state: candidate, changed: false };
    }

    if (Number.isInteger(candidate.version) && candidate.version > STATE_VERSION) {
      return { state: candidate, changed: false, futureVersion: true };
    }

    let changed = candidate.version !== STATE_VERSION;
    const libraries = [];
    candidate.libraries.forEach((library) => {
      if (isExactLegacyDevelopmentSample(library)) {
        changed = true;
        return;
      }

      if (library?.id === LEGACY_SAMPLE_LIBRARY_ID && library.isSample === true) {
        changed = true;
        libraries.push({ ...library, isSample: false });
        return;
      }

      libraries.push(library);
    });

    return {
      changed,
      state: {
        ...candidate,
        version: STATE_VERSION,
        libraries,
      },
    };
  }

  function isSafeKobo(value, allowZero = true) {
    return Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0);
  }

  function sanitizeHistoryEntry(entry, itemId, index, fallbackAt, currentAmountKobo) {
    if (!entry || !HISTORY_TYPES.has(entry.type)) return null;
    const event = {
      id:
        typeof entry.id === "string" && entry.id
          ? entry.id
          : `history-recovered-${itemId}-${index}`,
      type: entry.type,
      at: typeof entry.at === "string" ? entry.at : fallbackAt,
    };

    if (entry.type === "payment" || entry.type === "settlement") {
      if (!isSafeKobo(entry.deltaPaidKobo, false)) return null;
      event.deltaPaidKobo = entry.deltaPaidKobo;
    } else if (entry.type === "settlement_reversed") {
      if (typeof entry.reversesEventId !== "string" || !entry.reversesEventId) return null;
      event.reversesEventId = entry.reversesEventId;
    } else if (entry.type === "amount_changed") {
      if (!isSafeKobo(entry.fromAmountKobo, false) || !isSafeKobo(entry.toAmountKobo, false)) {
        return null;
      }
      event.fromAmountKobo = entry.fromAmountKobo;
      event.toAmountKobo = entry.toAmountKobo;
    } else if (entry.type === "description_changed") {
      event.fromDescription = normalizeName(entry.fromDescription).slice(0, MAX_DESCRIPTION_LENGTH);
      event.toDescription = normalizeName(entry.toDescription).slice(0, MAX_DESCRIPTION_LENGTH);
      if (!event.fromDescription || !event.toDescription) return null;
    } else {
      event.amountKobo = isSafeKobo(entry.amountKobo, false)
        ? entry.amountKobo
        : currentAmountKobo;
    }

    if (isSafeKobo(entry.balanceKobo)) event.balanceKobo = entry.balanceKobo;
    return event;
  }

  function sanitizeItem(item) {
    const createdAt = typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString();
    const updatedAt = typeof item.updatedAt === "string" ? item.updatedAt : createdAt;
    const description =
      normalizeName(item.description).slice(0, MAX_DESCRIPTION_LENGTH) || "Untitled item";
    const amountKobo = item.amountKobo;
    const seenEventIds = new Set();
    const sanitizedEntries = (Array.isArray(item.history) ? item.history : [])
      .map((entry, index) =>
        sanitizeHistoryEntry(entry, item.id, index, updatedAt, amountKobo),
      )
      .filter((entry) => {
        if (!entry || seenEventIds.has(entry.id)) return false;
        seenEventIds.add(entry.id);
        return true;
      });

    const storedBaseline = sanitizedEntries.find(
      (entry) => entry.type === "created" || entry.type === "imported",
    );
    const originalAmountKobo = isSafeKobo(item.originalAmountKobo, false)
      ? item.originalAmountKobo
      : storedBaseline?.amountKobo || amountKobo;
    const baseline = storedBaseline
      ? {
          ...storedBaseline,
          amountKobo: originalAmountKobo,
          balanceKobo: originalAmountKobo,
        }
      : {
        id: `history-imported-${item.id}`,
        type: "imported",
        at: updatedAt,
        amountKobo: originalAmountKobo,
        balanceKobo: originalAmountKobo,
      };

    let runningAmountKobo = originalAmountKobo;
    let paidKobo = 0;
    const activeSettlements = new Map();
    const history = [baseline];
    sanitizedEntries.forEach((entry) => {
      if (entry === storedBaseline || entry.type === "created" || entry.type === "imported") return;

      if (entry.type === "payment" || entry.type === "settlement") {
        if (paidKobo + entry.deltaPaidKobo > runningAmountKobo) return;
        paidKobo += entry.deltaPaidKobo;
        if (entry.type === "settlement") activeSettlements.set(entry.id, entry.deltaPaidKobo);
        history.push({ ...entry, balanceKobo: runningAmountKobo - paidKobo });
        return;
      }

      if (entry.type === "settlement_reversed") {
        const reversedAmount = activeSettlements.get(entry.reversesEventId);
        if (!reversedAmount) return;
        activeSettlements.delete(entry.reversesEventId);
        paidKobo -= reversedAmount;
        history.push({ ...entry, balanceKobo: runningAmountKobo - paidKobo });
        return;
      }

      if (entry.type === "amount_changed") {
        if (entry.fromAmountKobo !== runningAmountKobo || entry.toAmountKobo < paidKobo) return;
        runningAmountKobo = entry.toAmountKobo;
        history.push({ ...entry, balanceKobo: runningAmountKobo - paidKobo });
        return;
      }

      history.push(entry);
    });

    return {
      id: item.id,
      description,
      originalAmountKobo,
      amountKobo: runningAmountKobo,
      createdAt,
      updatedAt,
      history,
    };
  }

  function sanitizeState(candidate) {
    if (!candidate || !Array.isArray(candidate.libraries)) return null;
    const reserveId = (requestedId, usedIds, kind, index) => {
      if (!usedIds.has(requestedId)) {
        usedIds.add(requestedId);
        return requestedId;
      }
      let attempt = 1;
      let recoveredId = `${requestedId}-recovered-${kind}-${index}-${attempt}`;
      while (usedIds.has(recoveredId)) {
        attempt += 1;
        recoveredId = `${requestedId}-recovered-${kind}-${index}-${attempt}`;
      }
      usedIds.add(recoveredId);
      return recoveredId;
    };

    const libraryIds = new Set();
    const libraries = candidate.libraries
      .filter((library) => library && typeof library.id === "string" && library.id)
      .map((library, libraryIndex) => {
        const itemIds = new Set();
        const items = (Array.isArray(library.items) ? library.items : [])
          .filter(
            (item) =>
              item &&
              typeof item.id === "string" &&
              item.id &&
              Number.isSafeInteger(item.amountKobo) &&
              item.amountKobo > 0,
          )
          .map((item, itemIndex) => ({
            ...sanitizeItem(item),
            id: reserveId(item.id, itemIds, "item", itemIndex),
          }));
        return {
          id: reserveId(library.id, libraryIds, "library", libraryIndex),
          name: normalizeName(library.name).slice(0, MAX_LIBRARY_NAME_LENGTH) || "Untitled library",
          createdAt:
            typeof library.createdAt === "string" ? library.createdAt : new Date().toISOString(),
          updatedAt:
            typeof library.updatedAt === "string" ? library.updatedAt : new Date().toISOString(),
          items,
        };
      });

    const activeExists = libraries.some((library) => library.id === candidate.activeLibraryId);
    const fallbackLibraryId = [...libraries].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0]?.id || null;
    const activeLibraryId = activeExists ? candidate.activeLibraryId : fallbackLibraryId;
    return {
      version: STATE_VERSION,
      view: candidate.view === "library" && activeLibraryId ? "library" : "calculator",
      activeLibraryId,
      libraries,
    };
  }

  function loadState() {
    let saved;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch (_error) {
      return createInitialState();
    }
    if (!saved) return createInitialState();

    let migration;
    let sanitized;
    try {
      migration = migrateState(JSON.parse(saved));
      if (migration.futureVersion) {
        storageReadOnly = true;
        return createInitialState();
      }
      sanitized = sanitizeState(migration.state);
    } catch (_error) {
      return createInitialState();
    }
    if (!sanitized) return createInitialState();

    const sanitationChanged = JSON.stringify(migration.state) !== JSON.stringify(sanitized);
    if (migration.changed || sanitationChanged) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
      } catch (_error) {
        // The corrected in-memory state is still safe to use for this session.
      }
    }
    return sanitized;
  }

  function persistState(candidate = state) {
    if (storageReadOnly) {
      if (!storageWarningShown) {
        storageWarningShown = true;
        showToast("Saved data was created by a newer ListCalc version. Update the app before making changes.");
      }
      return false;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate));
      return true;
    } catch (_error) {
      if (!storageWarningShown) {
        storageWarningShown = true;
        showToast("Couldn’t save on this device. Please check browser storage settings.");
      }
      return false;
    }
  }

  function commitState(mutator) {
    const nextState = JSON.parse(JSON.stringify(state));
    mutator(nextState);
    if (!persistState(nextState)) return false;
    state = nextState;
    return true;
  }

  function getActiveLibrary() {
    return state.libraries.find((library) => library.id === state.activeLibraryId) || null;
  }

  function getSortedLibraries() {
    return [...state.libraries].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  function itemWord(count) {
    return `${count} ${count === 1 ? "item" : "items"}`;
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return "Added today";
    return `Added ${new Intl.DateTimeFormat("en-NG", {
      day: "numeric",
      month: "short",
    }).format(date)}`;
  }

  function openDrawer() {
    elements.drawer.inert = false;
    elements.drawer.classList.add("is-open");
    elements.drawerOverlay.classList.add("is-open");
    elements.drawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    window.setTimeout(() => elements.closeDrawerButton.focus(), 50);
  }

  function closeDrawer() {
    elements.drawer.classList.remove("is-open");
    elements.drawerOverlay.classList.remove("is-open");
    elements.drawer.setAttribute("aria-hidden", window.innerWidth >= 900 ? "false" : "true");
    elements.drawer.inert = window.innerWidth < 900;
    document.body.style.overflow = "";
  }

  function closeLibraryMenu() {
    elements.libraryActionMenu.hidden = true;
    elements.libraryMoreButton.setAttribute("aria-expanded", "false");
  }

  function showCalculator() {
    state.view = "calculator";
    persistState();
    closeDrawer();
    closeLibraryMenu();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showLibrary(libraryId) {
    if (!state.libraries.some((library) => library.id === libraryId)) return;
    state.view = "library";
    state.activeLibraryId = libraryId;
    persistState();
    closeDrawer();
    closeLibraryMenu();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderDrawer() {
    elements.libraryCount.textContent = String(state.libraries.length);
    elements.calculatorNavButton.classList.toggle("is-active", state.view === "calculator");
    elements.calculatorNavButton.setAttribute(
      "aria-current",
      state.view === "calculator" ? "page" : "false",
    );
    elements.libraryNavList.replaceChildren();

    const sortedLibraries = getSortedLibraries();
    if (!sortedLibraries.length) {
      const empty = document.createElement("p");
      empty.className = "brand-note";
      empty.style.padding = "8px 12px";
      empty.textContent = "No libraries yet.";
      elements.libraryNavList.appendChild(empty);
      return;
    }

    sortedLibraries.forEach((library) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "library-nav-row";
      const isActive = state.view === "library" && state.activeLibraryId === library.id;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-current", isActive ? "page" : "false");
      button.addEventListener("click", () => showLibrary(library.id));

      const symbol = document.createElement("span");
      symbol.className = "nav-symbol";
      symbol.setAttribute("aria-hidden", "true");
      symbol.textContent = "₦";

      const copy = document.createElement("span");
      copy.className = "library-nav-copy";
      const name = document.createElement("span");
      name.className = "library-nav-name";
      name.textContent = library.name;
      const total = document.createElement("span");
      total.className = "library-nav-total";
      total.textContent = `${formatKobo(calculateRemainingTotalKobo(library.items))} remaining`;
      copy.append(name, total);
      button.append(symbol, copy);
      elements.libraryNavList.appendChild(button);
    });
  }

  function renderCalculator() {
    const hasError = Boolean(calculatorState.error);
    elements.calculatorExpression.textContent = calculatorState.expression || "\u00a0";
    elements.calculatorOutput.textContent = hasError
      ? calculatorState.error
      : formatCalculatorDisplay(calculatorState.display);
    elements.calculatorOutput.classList.toggle("is-error", hasError);
    elements.calculatorOutput.setAttribute(
      "aria-label",
      hasError ? calculatorState.error : `Result ${calculatorState.display} naira`,
    );
  }

  function createItemRow(item) {
    const row = document.createElement("li");
    row.className = "item-row";
    row.dataset.itemId = item.id;
    const paidKobo = calculateItemPaidKobo(item);
    const remainingKobo = calculateItemRemainingKobo(item);
    const isComplete = remainingKobo === 0;
    row.classList.toggle("is-complete", isComplete);

    const checkboxId = `item-check-${item.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
    const checkLabel = document.createElement("label");
    checkLabel.className = "item-check-label";
    checkLabel.htmlFor = checkboxId;
    const checkbox = document.createElement("input");
    checkbox.id = checkboxId;
    checkbox.className = "item-checkbox";
    checkbox.type = "checkbox";
    checkbox.checked = isComplete;
    checkbox.setAttribute(
      "aria-label",
      isComplete
        ? `Mark ${item.description} as not fully paid`
        : `Mark ${item.description} as fully paid`,
    );
    checkbox.addEventListener("change", () => toggleItemPaid(item.id, checkbox.checked));
    checkLabel.appendChild(checkbox);

    const copy = document.createElement("div");
    copy.className = "item-copy";
    const description = document.createElement("span");
    description.className = "item-description";
    description.textContent = item.description;
    const progress = document.createElement("span");
    progress.className = "item-progress";
    progress.textContent = isComplete
      ? `Paid in full · ${formatKobo(item.amountKobo)} total`
      : paidKobo > 0
        ? `Paid ${formatKobo(paidKobo)} of ${formatKobo(item.amountKobo)}`
        : `${formatKobo(item.amountKobo)} total · No payment yet`;
    copy.append(description, progress);

    const balanceButton = document.createElement("button");
    balanceButton.type = "button";
    balanceButton.className = "item-balance-button";
    balanceButton.setAttribute(
      "aria-label",
      `History for ${item.description}, ${formatKobo(remainingKobo)} ${isComplete ? "paid" : "remaining"}`,
    );
    balanceButton.addEventListener("click", (event) => openItemHistory(item.id, event.currentTarget));
    const amount = document.createElement("span");
    amount.className = "item-amount";
    amount.textContent = formatKobo(remainingKobo);
    const balanceCaption = document.createElement("span");
    balanceCaption.className = "item-balance-caption";
    balanceCaption.textContent = `${isComplete ? "paid" : "remaining"} · History`;
    balanceButton.append(amount, balanceCaption);

    const actions = document.createElement("div");
    actions.className = "item-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "row-action";
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit ${item.description}`);
    editButton.addEventListener("click", () => openEditItemDialog(item.id));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "row-action delete";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete ${item.description}`);
    deleteButton.addEventListener("click", () => deleteItem(item.id));
    actions.append(editButton, deleteButton);

    row.append(checkLabel, copy, balanceButton, actions);
    return row;
  }

  function renderLibrary() {
    const library = getActiveLibrary();
    if (!library) {
      showCalculator();
      return;
    }

    const plannedTotal = calculateTotalKobo(library.items);
    const paidTotal = calculatePaidTotalKobo(library.items);
    const remainingTotal = calculateRemainingTotalKobo(library.items);
    const completedCount = countCompletedItems(library.items);
    elements.libraryTotal.textContent = formatKobo(remainingTotal);
    elements.libraryTotal.setAttribute(
      "aria-label",
      `Remaining, ${formatKoboForSpeech(remainingTotal)}`,
    );
    elements.libraryPlannedTotal.textContent = formatKobo(plannedTotal);
    elements.libraryPaidTotal.textContent = formatKobo(paidTotal);
    elements.libraryProgress.textContent = `${completedCount} of ${library.items.length} paid`;
    elements.librarySummary.textContent = `${itemWord(library.items.length)} · Saved on this device`;
    elements.itemCountLabel.textContent = `${completedCount} paid · ${library.items.length - completedCount} open`;
    elements.itemList.replaceChildren(...library.items.map(createItemRow));
    elements.itemList.hidden = library.items.length === 0;
    elements.itemsEmptyState.hidden = library.items.length !== 0;
  }

  function render() {
    const library = getActiveLibrary();
    const isLibrary = state.view === "library" && Boolean(library);
    elements.calculatorView.hidden = isLibrary;
    elements.libraryView.hidden = !isLibrary;
    elements.libraryActionsWrap.hidden = !isLibrary;
    elements.topbarSpacer.hidden = isLibrary;
    elements.screenEyebrow.textContent = isLibrary ? "SAVED LIBRARY" : "QUICK CALCULATOR";
    elements.screenTitle.textContent = isLibrary ? library.name : "Calculator";
    document.title = isLibrary ? `${library.name} — ListCalc` : "ListCalc — Voice List Calculator";
    renderDrawer();
    if (isLibrary) renderLibrary();
    else renderCalculator();
  }

  function clearFieldError(input, errorElement) {
    input.removeAttribute("aria-invalid");
    errorElement.textContent = "";
  }

  function setFieldError(input, errorElement, message) {
    input.setAttribute("aria-invalid", "true");
    errorElement.textContent = message;
  }

  function validateLibraryName(input, errorElement, ignoredId) {
    const name = normalizeName(input.value);
    clearFieldError(input, errorElement);
    if (!name) {
      setFieldError(input, errorElement, "Enter a library name.");
      return null;
    }
    if (name.length > MAX_LIBRARY_NAME_LENGTH) {
      setFieldError(input, errorElement, `Use ${MAX_LIBRARY_NAME_LENGTH} characters or fewer.`);
      return null;
    }
    if (isDuplicateLibraryName(state.libraries, name, ignoredId)) {
      setFieldError(input, errorElement, "A library with this name already exists.");
      return null;
    }
    return name;
  }

  function validateItemFields(descriptionInput, amountInput, descriptionError, amountError) {
    clearFieldError(descriptionInput, descriptionError);
    clearFieldError(amountInput, amountError);
    const description = normalizeName(descriptionInput.value);
    const parsedAmount = parseAmountToKobo(amountInput.value);
    let valid = true;

    if (!description) {
      setFieldError(descriptionInput, descriptionError, "Enter what this amount is for.");
      valid = false;
    } else if (description.length > MAX_DESCRIPTION_LENGTH) {
      setFieldError(
        descriptionInput,
        descriptionError,
        `Use ${MAX_DESCRIPTION_LENGTH} characters or fewer.`,
      );
      valid = false;
    }

    if (!parsedAmount.ok) {
      setFieldError(amountInput, amountError, parsedAmount.error);
      valid = false;
    }

    if (!valid) return null;
    return { description, amountKobo: parsedAmount.value };
  }

  function openNewLibraryDialog() {
    closeDrawer();
    elements.newLibraryForm.reset();
    clearFieldError(elements.newLibraryName, elements.newLibraryError);
    elements.newLibraryDialog.showModal();
    window.setTimeout(() => elements.newLibraryName.focus(), 50);
  }

  function openRenameLibraryDialog() {
    const library = getActiveLibrary();
    if (!library) return;
    closeLibraryMenu();
    elements.renameLibraryName.value = library.name;
    clearFieldError(elements.renameLibraryName, elements.renameLibraryError);
    elements.renameLibraryDialog.showModal();
    window.setTimeout(() => elements.renameLibraryName.select(), 50);
  }

  function amountInputValue(amountKobo) {
    const whole = Math.floor(amountKobo / 100);
    const fraction = amountKobo % 100;
    return `${whole}${fraction ? `.${String(fraction).padStart(2, "0")}` : ""}`;
  }

  function createHistoryEvent(type, details = {}, at = new Date().toISOString()) {
    return {
      id: createId("history"),
      type,
      at,
      ...details,
    };
  }

  function updateEditProjectedBalance() {
    const library = getActiveLibrary();
    const item = library?.items.find((candidate) => candidate.id === editingItemId);
    if (!item) return;
    const totalResult = parseAmountToKobo(elements.editItemAmount.value);
    const paymentText = elements.editPaymentAmount.value.trim();
    const paymentResult = paymentText ? parseAmountToKobo(paymentText) : { ok: true, value: 0 };
    const paidKobo = calculateItemPaidKobo(item);
    if (!totalResult.ok || !paymentResult.ok || totalResult.value < paidKobo) {
      elements.editProjectedBalance.textContent = "—";
      return;
    }
    elements.editProjectedBalance.textContent = formatKobo(
      Math.max(totalResult.value - paidKobo - paymentResult.value, 0),
    );
  }

  function openEditItemDialog(itemId) {
    const library = getActiveLibrary();
    const item = library?.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    editingItemId = itemId;
    elements.editItemDescription.value = item.description;
    elements.editItemAmount.value = amountInputValue(item.amountKobo);
    elements.editPaymentAmount.value = "";
    elements.editOriginalAmount.textContent = formatKobo(item.originalAmountKobo);
    elements.editPaidAmount.textContent = formatKobo(calculateItemPaidKobo(item));
    elements.editRemainingAmount.textContent = formatKobo(calculateItemRemainingKobo(item));
    clearFieldError(elements.editItemDescription, elements.editDescriptionError);
    clearFieldError(elements.editItemAmount, elements.editAmountError);
    clearFieldError(elements.editPaymentAmount, elements.editPaymentError);
    updateEditProjectedBalance();
    elements.editItemDialog.showModal();
    window.setTimeout(() => elements.editItemDescription.focus(), 50);
  }

  function historyEventCopy(item, entry) {
    if (entry.type === "created") {
      return { title: "Item created", detail: `Starting amount ${formatKobo(entry.amountKobo)}` };
    }
    if (entry.type === "imported") {
      return {
        title: "Starting balance imported",
        detail: `${formatKobo(entry.amountKobo)} carried forward from the earlier app version`,
      };
    }
    if (entry.type === "payment") {
      return {
        title: `Payment recorded: ${formatKobo(entry.deltaPaidKobo)}`,
        detail: `Balance after payment: ${formatKobo(entry.balanceKobo)}`,
      };
    }
    if (entry.type === "settlement") {
      return {
        title: `Marked paid: ${formatKobo(entry.deltaPaidKobo)}`,
        detail: "The remaining balance was cleared with the checkbox.",
      };
    }
    if (entry.type === "settlement_reversed") {
      const settlement = item.history.find((candidate) => candidate.id === entry.reversesEventId);
      return {
        title: `Paid check undone${settlement ? `: ${formatKobo(settlement.deltaPaidKobo)} restored` : ""}`,
        detail: `Balance after reopening: ${formatKobo(entry.balanceKobo)}`,
      };
    }
    if (entry.type === "amount_changed") {
      return {
        title: "Total amount changed",
        detail: `${formatKobo(entry.fromAmountKobo)} → ${formatKobo(entry.toAmountKobo)} · Balance ${formatKobo(entry.balanceKobo)}`,
      };
    }
    if (entry.type === "description_changed") {
      return {
        title: "Description changed",
        detail: `“${entry.fromDescription}” → “${entry.toDescription}”`,
      };
    }
    return { title: "Item updated", detail: "" };
  }

  function openItemHistory(itemId, returnFocusElement) {
    const library = getActiveLibrary();
    const item = library?.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    historyItemId = itemId;
    historyReturnFocus = returnFocusElement || document.activeElement;
    elements.itemHistoryDescription.textContent = item.description;
    elements.historyOriginalAmount.textContent = formatKobo(item.originalAmountKobo);
    elements.historyPaidAmount.textContent = formatKobo(calculateItemPaidKobo(item));
    elements.historyRemainingAmount.textContent = formatKobo(calculateItemRemainingKobo(item));
    const entries = [...item.history].reverse().map((entry) => {
      const row = document.createElement("li");
      row.className = "history-entry";
      const copy = historyEventCopy(item, entry);
      const title = document.createElement("span");
      title.className = "history-entry-title";
      title.textContent = copy.title;
      const detail = document.createElement("span");
      detail.className = "history-entry-detail";
      detail.textContent = copy.detail;
      const time = document.createElement("time");
      time.dateTime = entry.at;
      const date = new Date(entry.at);
      time.textContent = Number.isNaN(date.getTime())
        ? "Date unavailable"
        : new Intl.DateTimeFormat("en-NG", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(date);
      row.append(title);
      if (copy.detail) row.append(detail);
      row.append(time);
      return row;
    });
    elements.itemHistoryList.replaceChildren(...entries);
    elements.itemHistoryDialog.showModal();
    window.setTimeout(() => elements.itemHistoryHeading.focus(), 50);
  }

  function toggleItemPaid(itemId, shouldComplete) {
    const library = getActiveLibrary();
    const item = library?.items.find((candidate) => candidate.id === itemId);
    if (!library || !item) return;
    const remainingKobo = calculateItemRemainingKobo(item);

    if (shouldComplete) {
      if (remainingKobo === 0) return;
      const now = new Date().toISOString();
      const event = createHistoryEvent(
        "settlement",
        { deltaPaidKobo: remainingKobo, balanceKobo: 0 },
        now,
      );
      const committed = commitState((nextState) => {
        const nextLibrary = nextState.libraries.find((candidate) => candidate.id === library.id);
        const nextItem = nextLibrary?.items.find((candidate) => candidate.id === itemId);
        if (!nextLibrary || !nextItem) return;
        nextItem.history.push(event);
        nextItem.updatedAt = now;
        markLibraryChanged(nextLibrary, now);
      });
      if (!committed) {
        render();
        return;
      }
      render();
      showToast(`${item.description} marked paid.`);
      return;
    }

    const activeSettlement = findLatestActiveSettlement(item);
    if (!activeSettlement) {
      render();
      showToast("This item was fully paid through recorded payments. Its payment history was kept.");
      return;
    }
    const now = new Date().toISOString();
    const balanceKobo = Math.min(
      item.amountKobo,
      remainingKobo + activeSettlement.deltaPaidKobo,
    );
    const event = createHistoryEvent(
      "settlement_reversed",
      { reversesEventId: activeSettlement.id, balanceKobo },
      now,
    );
    const committed = commitState((nextState) => {
      const nextLibrary = nextState.libraries.find((candidate) => candidate.id === library.id);
      const nextItem = nextLibrary?.items.find((candidate) => candidate.id === itemId);
      if (!nextLibrary || !nextItem) return;
      nextItem.history.push(event);
      nextItem.updatedAt = now;
      markLibraryChanged(nextLibrary, now);
    });
    if (!committed) {
      render();
      return;
    }
    render();
    showToast(`${item.description} reopened.`);
  }

  function openDeleteLibraryDialog() {
    const library = getActiveLibrary();
    if (!library) return;
    closeLibraryMenu();
    elements.deleteLibraryMessage.textContent = `Delete “${library.name}” and its ${itemWord(library.items.length)}? You can undo this for 10 seconds.`;
    elements.deleteLibraryDialog.showModal();
  }

  function closeDialogById(dialogId) {
    const dialog = document.getElementById(dialogId);
    if (dialog && dialog.open) dialog.close();
  }

  function markLibraryChanged(library, at = new Date().toISOString()) {
    library.updatedAt = at;
    delete library.isSample;
  }

  function showToast(message, undoFunction) {
    window.clearTimeout(toastTimer);
    toastUndo = typeof undoFunction === "function" ? undoFunction : null;
    elements.toastMessage.textContent = message;
    elements.toastAction.hidden = !toastUndo;
    elements.toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
      toastUndo = null;
    }, toastUndo ? 10000 : 3500);
  }

  function hideToast() {
    window.clearTimeout(toastTimer);
    elements.toast.hidden = true;
    toastUndo = null;
  }

  function deleteItem(itemId) {
    const library = getActiveLibrary();
    if (!library) return;
    const itemIndex = library.items.findIndex((item) => item.id === itemId);
    if (itemIndex < 0) return;
    const removedItem = library.items[itemIndex];
    const removedAt = new Date().toISOString();
    const committed = commitState((nextState) => {
      const nextLibrary = nextState.libraries.find((candidate) => candidate.id === library.id);
      if (!nextLibrary) return;
      nextLibrary.items.splice(itemIndex, 1);
      markLibraryChanged(nextLibrary, removedAt);
    });
    if (!committed) return;
    render();
    showToast(`${removedItem.description} removed.`, () => {
      const restoredAt = new Date().toISOString();
      const restored = commitState((nextState) => {
        const nextLibrary = nextState.libraries.find((candidate) => candidate.id === library.id);
        if (!nextLibrary) return;
        nextLibrary.items.splice(Math.min(itemIndex, nextLibrary.items.length), 0, removedItem);
        markLibraryChanged(nextLibrary, restoredAt);
      });
      if (!restored) return;
      render();
      showToast(`${removedItem.description} restored.`);
    });
  }

  function applyCalculatorAction(action) {
    calculatorState = calculatorReduce(calculatorState, action);
    renderCalculator();
  }

  elements.openDrawerButton.addEventListener("click", openDrawer);
  elements.closeDrawerButton.addEventListener("click", closeDrawer);
  elements.drawerOverlay.addEventListener("click", closeDrawer);
  elements.calculatorNavButton.addEventListener("click", showCalculator);
  elements.newLibraryButton.addEventListener("click", openNewLibraryDialog);

  elements.libraryMoreButton.addEventListener("click", () => {
    const shouldOpen = elements.libraryActionMenu.hidden;
    elements.libraryActionMenu.hidden = !shouldOpen;
    elements.libraryMoreButton.setAttribute("aria-expanded", String(shouldOpen));
  });
  elements.renameLibraryButton.addEventListener("click", openRenameLibraryDialog);
  elements.deleteLibraryButton.addEventListener("click", openDeleteLibraryDialog);

  document.addEventListener("click", (event) => {
    if (!elements.libraryActionsWrap.contains(event.target)) closeLibraryMenu();
  });

  elements.calculatorKeypad.addEventListener("click", (event) => {
    const button = event.target.closest("[data-calc-type]");
    if (!button) return;
    applyCalculatorAction({
      type: button.dataset.calcType,
      value: button.dataset.calcValue,
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea") || document.querySelector("dialog[open]")) return;
    let action = null;
    if (/^\d$/.test(event.key)) action = { type: "digit", value: event.key };
    else if (event.key === ".") action = { type: "decimal" };
    else if (event.key === "+") action = { type: "operator", value: "+" };
    else if (event.key === "-") action = { type: "operator", value: "−" };
    else if (event.key === "*") action = { type: "operator", value: "×" };
    else if (event.key === "/") action = { type: "operator", value: "÷" };
    else if (event.key === "%") action = { type: "percent" };
    else if (event.key === "Backspace") action = { type: "backspace" };
    else if (event.key === "Escape") action = { type: "clear" };
    else if (event.key === "Enter" || event.key === "=") action = { type: "equals" };
    if (!action) return;
    event.preventDefault();
    if (state.view !== "calculator") showCalculator();
    applyCalculatorAction(action);
  });

  elements.newLibraryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = validateLibraryName(elements.newLibraryName, elements.newLibraryError);
    if (!name) return;
    const now = new Date().toISOString();
    const library = {
      id: createId("library"),
      name,
      createdAt: now,
      updatedAt: now,
      items: [],
    };
    const committed = commitState((nextState) => {
      nextState.libraries.push(library);
      nextState.activeLibraryId = library.id;
      nextState.view = "library";
    });
    if (!committed) return;
    elements.newLibraryDialog.close();
    render();
    showToast(`${name} created.`);
    window.setTimeout(() => elements.itemDescription.focus(), 80);
  });

  elements.renameLibraryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const library = getActiveLibrary();
    if (!library) return;
    const name = validateLibraryName(
      elements.renameLibraryName,
      elements.renameLibraryError,
      library.id,
    );
    if (!name) return;
    const renamedAt = new Date().toISOString();
    const committed = commitState((nextState) => {
      const nextLibrary = nextState.libraries.find((candidate) => candidate.id === library.id);
      if (!nextLibrary) return;
      nextLibrary.name = name;
      markLibraryChanged(nextLibrary, renamedAt);
    });
    if (!committed) return;
    elements.renameLibraryDialog.close();
    render();
    showToast("Library name updated.");
  });

  elements.addItemForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (addInProgress) return;
    const library = getActiveLibrary();
    if (!library) return;
    const validItem = validateItemFields(
      elements.itemDescription,
      elements.itemAmount,
      elements.descriptionError,
      elements.amountError,
    );
    if (!validItem) return;

    addInProgress = true;
    elements.addItemButton.disabled = true;
    const now = new Date().toISOString();
    const itemId = createId("item");
    const item = {
      id: itemId,
      description: validItem.description,
      originalAmountKobo: validItem.amountKobo,
      amountKobo: validItem.amountKobo,
      createdAt: now,
      updatedAt: now,
      history: [
        createHistoryEvent(
          "created",
          { amountKobo: validItem.amountKobo, balanceKobo: validItem.amountKobo },
          now,
        ),
      ],
    };
    const committed = commitState((nextState) => {
      const nextLibrary = nextState.libraries.find((candidate) => candidate.id === library.id);
      if (!nextLibrary) return;
      nextLibrary.items.push(item);
      markLibraryChanged(nextLibrary, now);
    });
    if (!committed) {
      addInProgress = false;
      elements.addItemButton.disabled = false;
      return;
    }
    elements.addItemForm.reset();
    clearFieldError(elements.itemDescription, elements.descriptionError);
    clearFieldError(elements.itemAmount, elements.amountError);
    elements.voiceStatus.textContent = "Say the item name, then type the amount.";
    render();
    showToast(`${validItem.description} added.`);
    window.setTimeout(() => {
      addInProgress = false;
      elements.addItemButton.disabled = false;
      elements.itemDescription.focus();
    }, 120);
  });

  elements.editItemForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (editSaveInProgress) return;
    const library = getActiveLibrary();
    const item = library?.items.find((candidate) => candidate.id === editingItemId);
    if (!library || !item) return;
    const validItem = validateItemFields(
      elements.editItemDescription,
      elements.editItemAmount,
      elements.editDescriptionError,
      elements.editAmountError,
    );
    if (!validItem) return;

    clearFieldError(elements.editPaymentAmount, elements.editPaymentError);
    const paymentText = elements.editPaymentAmount.value.trim();
    const paymentResult = paymentText ? parseAmountToKobo(paymentText) : { ok: true, value: 0 };
    if (!paymentResult.ok) {
      setFieldError(elements.editPaymentAmount, elements.editPaymentError, paymentResult.error);
      return;
    }

    const alreadyPaidKobo = calculateItemPaidKobo(item);
    if (validItem.amountKobo < alreadyPaidKobo) {
      setFieldError(
        elements.editItemAmount,
        elements.editAmountError,
        `Total cannot be less than ${formatKobo(alreadyPaidKobo)} already paid.`,
      );
      return;
    }
    const availableBalanceKobo = validItem.amountKobo - alreadyPaidKobo;
    if (paymentResult.value > availableBalanceKobo) {
      setFieldError(
        elements.editPaymentAmount,
        elements.editPaymentError,
        `Payment cannot exceed the ${formatKobo(availableBalanceKobo)} remaining balance.`,
      );
      return;
    }

    const now = new Date().toISOString();
    const historyEvents = [];
    if (validItem.description !== item.description) {
      historyEvents.push(
        createHistoryEvent(
          "description_changed",
          {
            fromDescription: item.description,
            toDescription: validItem.description,
          },
          now,
        ),
      );
    }
    if (validItem.amountKobo !== item.amountKobo) {
      historyEvents.push(
        createHistoryEvent(
          "amount_changed",
          {
            fromAmountKobo: item.amountKobo,
            toAmountKobo: validItem.amountKobo,
            balanceKobo: availableBalanceKobo,
          },
          now,
        ),
      );
    }
    if (paymentResult.value > 0) {
      historyEvents.push(
        createHistoryEvent(
          "payment",
          {
            deltaPaidKobo: paymentResult.value,
            balanceKobo: availableBalanceKobo - paymentResult.value,
          },
          now,
        ),
      );
    }

    if (!historyEvents.length) {
      elements.editItemDialog.close();
      editingItemId = null;
      showToast("No changes to save.");
      return;
    }

    editSaveInProgress = true;
    const submitButton = elements.editItemForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    const committed = commitState((nextState) => {
      const nextLibrary = nextState.libraries.find((candidate) => candidate.id === library.id);
      const nextItem = nextLibrary?.items.find((candidate) => candidate.id === item.id);
      if (!nextLibrary || !nextItem) return;
      nextItem.description = validItem.description;
      nextItem.amountKobo = validItem.amountKobo;
      nextItem.history.push(...historyEvents);
      nextItem.updatedAt = now;
      markLibraryChanged(nextLibrary, now);
    });
    editSaveInProgress = false;
    submitButton.disabled = false;
    if (!committed) return;
    elements.editItemDialog.close();
    editingItemId = null;
    render();
    showToast(
      paymentResult.value > 0
        ? `Payment saved. ${formatKobo(availableBalanceKobo - paymentResult.value)} remaining.`
        : "Item updated.",
    );
  });

  elements.deleteLibraryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const library = getActiveLibrary();
    if (!library) return;
    const index = state.libraries.findIndex((candidate) => candidate.id === library.id);
    if (index < 0) return;
    const removedLibrary = library;
    const committed = commitState((nextState) => {
      nextState.libraries.splice(index, 1);
      const nextLibrary = [...nextState.libraries].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0] || null;
      nextState.activeLibraryId = nextLibrary?.id || null;
      nextState.view = nextLibrary ? "library" : "calculator";
    });
    if (!committed) return;
    elements.deleteLibraryDialog.close();
    render();
    showToast(`${removedLibrary.name} deleted.`, () => {
      const restored = commitState((nextState) => {
        nextState.libraries.splice(Math.min(index, nextState.libraries.length), 0, removedLibrary);
        nextState.activeLibraryId = removedLibrary.id;
        nextState.view = "library";
      });
      if (!restored) return;
      render();
      showToast(`${removedLibrary.name} restored.`);
    });
  });

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialogById(button.dataset.closeDialog));
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  elements.closeItemHistoryButton.addEventListener("click", () => {
    elements.itemHistoryDialog.close();
  });
  elements.itemHistoryDialog.addEventListener("close", () => {
    historyItemId = null;
    const returnTarget = historyReturnFocus;
    historyReturnFocus = null;
    if (returnTarget?.isConnected) window.setTimeout(() => returnTarget.focus(), 0);
  });

  elements.itemDescription.addEventListener("input", () =>
    clearFieldError(elements.itemDescription, elements.descriptionError),
  );
  elements.itemAmount.addEventListener("input", () =>
    clearFieldError(elements.itemAmount, elements.amountError),
  );
  elements.editItemDescription.addEventListener("input", () =>
    clearFieldError(elements.editItemDescription, elements.editDescriptionError),
  );
  elements.editItemAmount.addEventListener("input", () => {
    clearFieldError(elements.editItemAmount, elements.editAmountError);
    updateEditProjectedBalance();
  });
  elements.editPaymentAmount.addEventListener("input", () => {
    clearFieldError(elements.editPaymentAmount, elements.editPaymentError);
    updateEditProjectedBalance();
  });

  elements.itemAmount.addEventListener("blur", () => {
    const parsed = parseAmountToKobo(elements.itemAmount.value);
    if (parsed.ok) elements.itemAmount.value = formatKobo(parsed.value).replace(/^₦/, "");
  });
  elements.editItemAmount.addEventListener("blur", () => {
    const parsed = parseAmountToKobo(elements.editItemAmount.value);
    if (parsed.ok) elements.editItemAmount.value = formatKobo(parsed.value).replace(/^₦/, "");
    updateEditProjectedBalance();
  });
  elements.editPaymentAmount.addEventListener("blur", () => {
    if (!elements.editPaymentAmount.value.trim()) return;
    const parsed = parseAmountToKobo(elements.editPaymentAmount.value);
    if (parsed.ok) elements.editPaymentAmount.value = formatKobo(parsed.value).replace(/^₦/, "");
    updateEditProjectedBalance();
  });

  elements.toastAction.addEventListener("click", () => {
    const undo = toastUndo;
    hideToast();
    if (undo) undo();
  });

  function setListeningState(isListening) {
    recognitionIsListening = isListening;
    elements.speakButton.classList.toggle("is-listening", isListening);
    elements.speakButtonText.textContent = isListening ? "Stop" : "Speak";
    elements.speakButton.setAttribute(
      "aria-label",
      isListening ? "Listening, tap to stop" : "Start voice description",
    );
  }

  function insertTranscript(input, originalValue, selectionStart, selectionEnd, transcript) {
    const before = originalValue.slice(0, selectionStart);
    const after = originalValue.slice(selectionEnd);
    const needsLeadingSpace = before && !/\s$/.test(before);
    const needsTrailingSpace = after && !/^\s/.test(after);
    input.value = `${before}${needsLeadingSpace ? " " : ""}${transcript}${needsTrailingSpace ? " " : ""}${after}`.slice(
      0,
      MAX_DESCRIPTION_LENGTH,
    );
  }

  function postNativeBridgeMessage(payload) {
    if (!nativeBridgeState.present) return false;
    try {
      window.ListCalcAndroid.postMessage(JSON.stringify({ v: 1, ...payload }));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function voiceErrorMessage(errorCode) {
    if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
      return "Microphone access is off. You can type the item or enable microphone access in Android settings.";
    }
    if (errorCode === "no-speech") {
      return "I didn’t hear anything. Try again or type the item.";
    }
    if (errorCode === "language-unavailable") {
      return "This speech language isn’t available on your phone. You can still type the item.";
    }
    if (errorCode === "busy") {
      return "The phone’s voice service is busy. Wait a moment, then try again.";
    }
    return "Voice input isn’t available right now. You can still type.";
  }

  function finishNativeVoiceSession() {
    const session = nativeVoiceSession;
    setListeningState(false);
    nativeVoiceSession = null;
    if (!session) return;
    if (session.finalTranscript) {
      clearFieldError(elements.itemDescription, elements.descriptionError);
      elements.voiceStatus.textContent = `Added “${session.finalTranscript}”. Now type the amount.`;
      window.setTimeout(() => elements.itemAmount.focus(), 80);
    } else if (!session.hadError && !session.cancelledForVisibility) {
      elements.voiceStatus.textContent = "I didn’t hear anything. Try again or type the item.";
    }
  }

  function handleNativeBridgeMessage(event) {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch (_error) {
      return;
    }
    if (!message || message.v !== 1 || typeof message.type !== "string") return;

    if (message.type === "bridge.ready") {
      nativeBridgeState.ready = true;
      nativeBridgeState.speechAvailable = message.speechAvailable === true;
      if (nativeBridgeState.pendingStart) {
        nativeBridgeState.pendingStart = false;
        startVoiceEntry();
      }
      return;
    }

    const session = nativeVoiceSession;
    if (!session || message.requestId !== session.requestId) return;

    if (message.type === "speech.state") {
      if (message.state === "requesting-permission") {
        elements.voiceStatus.textContent = "Waiting for microphone permission…";
      } else if (message.state === "listening") {
        setListeningState(true);
        elements.voiceStatus.textContent = "Listening… Say the item name.";
      } else if (message.state === "processing") {
        elements.voiceStatus.textContent = "Finishing your voice entry…";
      }
      return;
    }

    if (message.type === "speech.partial" && typeof message.text === "string") {
      const heard = message.text.trim();
      if (heard) elements.voiceStatus.textContent = `Hearing: “${heard}”`;
      return;
    }

    if (message.type === "speech.result" && typeof message.text === "string") {
      const transcript = message.text.trim();
      if (!transcript || session.resultInserted) return;
      session.resultInserted = true;
      session.finalTranscript = transcript;
      insertTranscript(
        elements.itemDescription,
        session.originalValue,
        session.selectionStart,
        session.selectionEnd,
        transcript,
      );
      return;
    }

    if (message.type === "speech.error") {
      session.hadError = true;
      if (!(message.code === "aborted" && session.cancelledForVisibility)) {
        elements.voiceStatus.textContent = voiceErrorMessage(message.code);
      }
      return;
    }

    if (message.type === "speech.end") finishNativeVoiceSession();
  }

  function initializeNativeBridge() {
    if (!nativeBridgeState.present) return;
    window.ListCalcAndroid.onmessage = handleNativeBridgeMessage;
    postNativeBridgeMessage({ type: "bridge.ready" });
  }

  function startNativeVoiceEntry() {
    const originalValue = elements.itemDescription.value;
    const selectionStart = elements.itemDescription.selectionStart ?? originalValue.length;
    const selectionEnd = elements.itemDescription.selectionEnd ?? selectionStart;
    const requestId = createId("voice");
    nativeVoiceSession = {
      requestId,
      originalValue,
      selectionStart,
      selectionEnd,
      finalTranscript: "",
      resultInserted: false,
      hadError: false,
      cancelledForVisibility: false,
    };
    elements.voiceStatus.textContent = "Starting Android voice input…";
    if (!postNativeBridgeMessage({
      type: "speech.start",
      requestId,
      language: "en-NG",
    })) {
      nativeVoiceSession = null;
      elements.voiceStatus.textContent = "Voice input isn’t available right now. You can still type.";
    }
  }

  function startVoiceEntry() {
    if (nativeVoiceSession) {
      elements.voiceStatus.textContent = "Finishing your voice entry…";
      postNativeBridgeMessage({
        type: recognitionIsListening ? "speech.stop" : "speech.cancel",
        requestId: nativeVoiceSession.requestId,
      });
      return;
    }

    if (nativeBridgeState.present) {
      if (!nativeBridgeState.ready) {
        nativeBridgeState.pendingStart = true;
        elements.voiceStatus.textContent = "Android voice input is getting ready…";
        initializeNativeBridge();
        return;
      }
      if (!nativeBridgeState.speechAvailable) {
        elements.voiceStatus.textContent =
          "Android voice input isn’t available on this phone. You can still type the item.";
        return;
      }
      startNativeVoiceEntry();
      return;
    }

    if (nativeAndroidMode) {
      elements.voiceStatus.textContent =
        "Android voice input needs a current Android System WebView. You can still type the item.";
      return;
    }

    if (recognitionIsListening && activeRecognition) {
      elements.voiceStatus.textContent = "Finishing your voice entry…";
      activeRecognition.stop();
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      elements.voiceStatus.textContent =
        "Voice input isn’t available in this browser. You can still type the item.";
      return;
    }

    const recognition = new Recognition();
    activeRecognition = recognition;
    recognition.lang = "en-NG";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    const originalValue = elements.itemDescription.value;
    const selectionStart = elements.itemDescription.selectionStart ?? originalValue.length;
    const selectionEnd = elements.itemDescription.selectionEnd ?? selectionStart;
    let finalTranscript = "";
    let hadError = false;
    let cancelledForVisibility = false;

    recognition.onstart = () => {
      setListeningState(true);
      elements.voiceStatus.textContent = "Listening… Say the item name.";
    };

    recognition.onresult = (event) => {
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript.trim();
        if (event.results[index].isFinal) finalTranscript += `${finalTranscript ? " " : ""}${transcript}`;
        else interimTranscript += `${interimTranscript ? " " : ""}${transcript}`;
      }
      const heard = finalTranscript || interimTranscript;
      if (heard) elements.voiceStatus.textContent = `Hearing: “${heard}”`;
    };

    recognition.onerror = (event) => {
      hadError = true;
      if (event.error === "aborted" && cancelledForVisibility) return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        elements.voiceStatus.textContent =
          "Microphone access is off. You can type the item or enable access in your browser settings.";
      } else if (event.error === "no-speech") {
        elements.voiceStatus.textContent = "I didn’t hear anything. Try again or type the item.";
      } else {
        elements.voiceStatus.textContent =
          "Voice input isn’t available right now. You can still type.";
      }
    };

    recognition.onend = () => {
      setListeningState(false);
      activeRecognition = null;
      if (finalTranscript) {
        insertTranscript(
          elements.itemDescription,
          originalValue,
          selectionStart,
          selectionEnd,
          finalTranscript,
        );
        clearFieldError(elements.itemDescription, elements.descriptionError);
        elements.voiceStatus.textContent = `Added “${finalTranscript}”. Now type the amount.`;
        window.setTimeout(() => elements.itemAmount.focus(), 80);
      } else if (!hadError && !cancelledForVisibility) {
        elements.voiceStatus.textContent = "I didn’t hear anything. Try again or type the item.";
      }
    };

    recognition.cancelForVisibility = () => {
      cancelledForVisibility = true;
      recognition.abort();
      elements.voiceStatus.textContent = "Voice entry stopped. Your typed text is still here.";
    };

    try {
      recognition.start();
    } catch (_error) {
      activeRecognition = null;
      setListeningState(false);
      elements.voiceStatus.textContent =
        "Voice input isn’t available right now. You can still type.";
    }
  }

  elements.speakButton.addEventListener("click", startVoiceEntry);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    if (nativeVoiceSession) {
      nativeVoiceSession.cancelledForVisibility = true;
      postNativeBridgeMessage({
        type: "speech.cancel",
        requestId: nativeVoiceSession.requestId,
      });
      elements.voiceStatus.textContent = "Voice entry stopped. Your typed text is still here.";
    } else if (activeRecognition?.cancelForVisibility) {
      activeRecognition.cancelForVisibility();
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    if (nativeAndroidMode) return;
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.hidden = false;
  });

  elements.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
    showToast("ListCalc installed.");
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 900) closeDrawer();
  });

  if (
    !nativeAndroidMode &&
    !nativeBridgeState.present &&
    "serviceWorker" in navigator &&
    /^https?:$/.test(window.location.protocol)
  ) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // The app remains usable online if service-worker registration is blocked.
      });
    });
  }

  initializeNativeBridge();
  render();
  renderCalculator();
  if (storageReadOnly) {
    window.setTimeout(
      () => showToast("This saved data needs a newer ListCalc version. Update the app to continue."),
      80,
    );
  }
  if (window.innerWidth >= 900) {
    elements.drawer.setAttribute("aria-hidden", "false");
    elements.drawer.inert = false;
  }
})();
