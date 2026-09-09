(function () {
  const OWNER_EMAIL = "leeborg23@gmail.com";
  const USER_ROLES = ["Admin", "Manager", "Band Member", "Venue", "Host", "Member", "Fan"];

  const firebaseConfig = {
    apiKey: "AIzaSyC4gSodXM35E2ZdYaz6mrCvTUYzW75ZCBk",
    authDomain: "livekaraokemt.firebaseapp.com",
    projectId: "livekaraokemt",
    storageBucket: "livekaraokemt.firebasestorage.app",
    messagingSenderId: "425980659562",
    appId: "1:425980659562:web:892ddcd53fb209d1114713"
  };

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  window.LK = window.LK || {};
  LK.OWNER_EMAIL = OWNER_EMAIL;
  LK.USER_ROLES = USER_ROLES;
  LK.db = firebase.firestore();
  LK.auth = firebase.auth();
  LK.state = {
    logHistory: [],
    currentState: null,
    currentSessionId: null,
    currentSessionData: null,
    currentRequests: [],
    currentUserProfile: null,
    allMembers: [],
    sessionUnsubscribe: null,
    requestsUnsubscribe: null,
    membersUnsubscribe: null,
    notesSaveTimer: null,
    confirmResolver: null,
    reasonRequestId: null,
    reasonMode: "delete"
  };

  window.$ = function (id) { return document.getElementById(id); };
  window.serverNow = function () { return firebase.firestore.FieldValue.serverTimestamp(); };
  window.nowTimestamp = function () { return firebase.firestore.Timestamp.now(); };
  window.isOwner = function () {
    return (LK.auth.currentUser?.email || "").toLowerCase() === LK.OWNER_EMAIL.toLowerCase();
  };
})();

/* =========================================================
   LiveSuite local Firestore activity monitor
   ---------------------------------------------------------
   This does NOT write logs to Firestore. It observes calls made
   by this browser to the Firebase Web SDK and stores a bounded
   history in localStorage so DB Logs can inspect activity without
   creating extra database reads/writes.
   ========================================================= */
(function installLiveSuiteDbActivityMonitor() {
  if (window.__liveSuiteDbActivityInstalled) return;
  if (!window.firebase?.firestore) return;

  window.__liveSuiteDbActivityInstalled = true;

  const STORAGE_KEY = "livesuite.dbActivity.v1";
  const SETTINGS_KEY = "livesuite.dbActivity.settings.v1";
  const CHANNEL_NAME = "livesuite-db-activity";
  const MAX_ENTRIES = 1200;
  const FLUSH_DELAY_MS = 250;
  const projectId = String(firebase.app()?.options?.projectId || "");
  const page = () => location.pathname.split("/").pop() || location.pathname || "unknown";
  let pending = [];
  let flushTimer = null;
  let sequence = 0;
  let channel = null;

  try {
    if ("BroadcastChannel" in window) channel = new BroadcastChannel(CHANNEL_NAME);
  } catch (_) {}

  function settings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function captureEnabled() {
    return settings().paused !== true;
  }

  function cleanStack() {
    try {
      const lines = String(new Error().stack || "")
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .filter(line => !/installLiveSuiteDbActivityMonitor|recordDbActivity|cleanStack/.test(line))
        .filter(line => !/firebase-(?:firestore|app|auth)-compat|firestore\.googleapis\.com/.test(line));
      return lines.slice(1, 5).join(" | ");
    } catch (_) {
      return "";
    }
  }

  function refPath(ref) {
    if (!ref) return "";
    if (typeof ref.path === "string" && ref.path) return ref.path;
    try {
      const delegate = ref._delegate || ref;
      const q = delegate._query || delegate._key || delegate;
      if (q?.path?.canonicalString) return q.path.canonicalString();
      if (q?.path?.toString) return String(q.path.toString());
      if (q?.collectionGroup) return `collectionGroup:${q.collectionGroup}`;
    } catch (_) {}
    return ref.id ? String(ref.id) : "query";
  }

  function flush() {
    flushTimer = null;
    if (!pending.length) return;
    const batch = pending.splice(0, pending.length);
    try {
      let existing = [];
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) existing = JSON.parse(raw) || [];
      const merged = existing.concat(batch).slice(-MAX_ENTRIES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (error) {
      // If storage is full/corrupt, retain only the latest small tail.
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(batch.slice(-200)));
      } catch (_) {}
    }
    try { channel?.postMessage({ type: "db-activity", count: batch.length }); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent("livesuite-db-activity", { detail: { count: batch.length } })); } catch (_) {}
  }

  function recordDbActivity(entry) {
    if (!captureEnabled()) return;
    pending.push({
      id: `${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      projectId,
      page: page(),
      source: cleanStack(),
      ...entry
    });
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
  }

  function success(kind, operation, target, count, detail, source) {
    recordDbActivity({
      status: "ok",
      source: source || undefined,
      kind,
      operation,
      target: target || "unknown",
      count: Number.isFinite(Number(count)) ? Number(count) : 1,
      detail: detail || ""
    });
  }

  function failure(kind, operation, target, error, source) {
    recordDbActivity({
      status: "error",
      source: source || undefined,
      kind: "error",
      operation,
      target: target || "unknown",
      count: 0,
      detail: `${kind}: ${error?.code || error?.name || "Error"} — ${error?.message || String(error || "Unknown error")}`
    });
  }

  function wrapPromise(promise, handlers) {
    return Promise.resolve(promise).then(value => {
      handlers?.ok?.(value);
      return value;
    }, error => {
      handlers?.error?.(error);
      throw error;
    });
  }

  // Document reads/writes.
  const DocRef = firebase.firestore.DocumentReference?.prototype;
  if (DocRef && !DocRef.__liveSuiteActivityPatched) {
    Object.defineProperty(DocRef, "__liveSuiteActivityPatched", { value: true });

    const originalGet = DocRef.get;
    if (originalGet) DocRef.get = function (...args) {
      const target = refPath(this);
      const caller = cleanStack();
      return wrapPromise(originalGet.apply(this, args), {
        ok: snap => success("read", "DOC GET", target, 1, snap?.exists ? "document returned" : "document not found (still a read)", caller),
        error: err => failure("read", "DOC GET", target, err, caller)
      });
    };

    for (const method of ["set", "update"]) {
      const original = DocRef[method];
      if (!original) continue;
      DocRef[method] = function (...args) {
        const target = refPath(this);
        const caller = cleanStack();
        return wrapPromise(original.apply(this, args), {
          ok: () => success("write", `DOC ${method.toUpperCase()}`, target, 1, "", caller),
          error: err => failure("write", `DOC ${method.toUpperCase()}`, target, err, caller)
        });
      };
    }

    const originalDelete = DocRef.delete;
    if (originalDelete) DocRef.delete = function (...args) {
      const target = refPath(this);
      const caller = cleanStack();
      return wrapPromise(originalDelete.apply(this, args), {
        ok: () => success("delete", "DOC DELETE", target, 1, "", caller),
        error: err => failure("delete", "DOC DELETE", target, err, caller)
      });
    };

    const originalOnSnapshot = DocRef.onSnapshot;
    if (originalOnSnapshot) DocRef.onSnapshot = function (...args) {
      const target = refPath(this);
      const caller = cleanStack();
      let firstServerSnapshot = true;
      const originalArgs = args.slice();
      const callbacks = extractSnapshotCallbacks(originalArgs);
      if (!callbacks) return originalOnSnapshot.apply(this, args);

      callbacks.replaceNext(snap => {
        if (!snap?.metadata?.fromCache) {
          success("listen", firstServerSnapshot ? "DOC LISTEN INITIAL" : "DOC LISTEN UPDATE", target, 1,
            snap?.exists ? "server snapshot" : "missing document snapshot", caller);
          firstServerSnapshot = false;
        }
        callbacks.next?.(snap);
      });
      callbacks.replaceError(err => {
        failure("listen", "DOC LISTEN", target, err, caller);
        callbacks.error?.(err);
      });
      return originalOnSnapshot.apply(this, originalArgs);
    };
  }

  // Query / collection reads and listeners.
  const Query = firebase.firestore.Query?.prototype;
  if (Query && !Query.__liveSuiteActivityPatched) {
    Object.defineProperty(Query, "__liveSuiteActivityPatched", { value: true });

    const originalGet = Query.get;
    if (originalGet) Query.get = function (...args) {
      const target = refPath(this);
      const caller = cleanStack();
      return wrapPromise(originalGet.apply(this, args), {
        ok: snap => success("read", "QUERY GET", target, Math.max(1, Number(snap?.size || 0)), `${Number(snap?.size || 0)} document(s) returned`, caller),
        error: err => failure("read", "QUERY GET", target, err, caller)
      });
    };

    const originalOnSnapshot = Query.onSnapshot;
    if (originalOnSnapshot) Query.onSnapshot = function (...args) {
      const target = refPath(this);
      const caller = cleanStack();
      let initialServerSnapshot = true;
      const originalArgs = args.slice();
      const callbacks = extractSnapshotCallbacks(originalArgs);
      if (!callbacks) return originalOnSnapshot.apply(this, args);

      callbacks.replaceNext(snap => {
        if (!snap?.metadata?.fromCache) {
          if (initialServerSnapshot) {
            success("listen", "QUERY LISTEN INITIAL", target, Math.max(1, Number(snap?.size || 0)), `${Number(snap?.size || 0)} document(s) in initial result`, caller);
            initialServerSnapshot = false;
          } else {
            let changes = 0;
            try {
              changes = (snap.docChanges?.() || []).filter(change => !change?.doc?.metadata?.hasPendingWrites).length;
            } catch (_) {}
            if (changes > 0) success("listen", "QUERY LISTEN UPDATE", target, changes, `${changes} changed document(s)`, caller);
          }
        }
        callbacks.next?.(snap);
      });
      callbacks.replaceError(err => {
        failure("listen", "QUERY LISTEN", target, err, caller);
        callbacks.error?.(err);
      });
      return originalOnSnapshot.apply(this, originalArgs);
    };
  }

  // Collection.add is a direct write that does not pass through DocumentReference.set.
  const CollectionRef = firebase.firestore.CollectionReference?.prototype;
  if (CollectionRef && !CollectionRef.__liveSuiteActivityPatched) {
    Object.defineProperty(CollectionRef, "__liveSuiteActivityPatched", { value: true });
    const originalAdd = CollectionRef.add;
    if (originalAdd) CollectionRef.add = function (...args) {
      const target = refPath(this);
      const caller = cleanStack();
      return wrapPromise(originalAdd.apply(this, args), {
        ok: doc => success("write", "COLLECTION ADD", doc?.path || target, 1, "", caller),
        error: err => failure("write", "COLLECTION ADD", target, err, caller)
      });
    };
  }

  // Batched writes: count queued document mutations and log only once on commit.
  const Batch = firebase.firestore.WriteBatch?.prototype;
  const batchCounts = new WeakMap();
  if (Batch && !Batch.__liveSuiteActivityPatched) {
    Object.defineProperty(Batch, "__liveSuiteActivityPatched", { value: true });
    for (const method of ["set", "update", "delete"]) {
      const original = Batch[method];
      if (!original) continue;
      Batch[method] = function (ref, ...rest) {
        const state = batchCounts.get(this) || { writes: 0, deletes: 0, targets: [] };
        if (method === "delete") state.deletes += 1;
        else state.writes += 1;
        if (state.targets.length < 8) state.targets.push(refPath(ref));
        batchCounts.set(this, state);
        return original.call(this, ref, ...rest);
      };
    }
    const originalCommit = Batch.commit;
    if (originalCommit) Batch.commit = function (...args) {
      const state = batchCounts.get(this) || { writes: 0, deletes: 0, targets: [] };
      return wrapPromise(originalCommit.apply(this, args), {
        ok: () => {
          if (state.writes) success("write", "BATCH COMMIT", state.targets.join(", ") || "batch", state.writes, `${state.writes} write(s)`);
          if (state.deletes) success("delete", "BATCH COMMIT", state.targets.join(", ") || "batch", state.deletes, `${state.deletes} delete(s)`);
        },
        error: err => failure("write", "BATCH COMMIT", state.targets.join(", ") || "batch", err)
      });
    };
  }

  // Transactions can retry automatically. Log each callback attempt so retry storms are visible.
  const FirestoreProto = firebase.firestore.Firestore?.prototype;
  if (FirestoreProto && !FirestoreProto.__liveSuiteTransactionPatched) {
    Object.defineProperty(FirestoreProto, "__liveSuiteTransactionPatched", { value: true });
    const originalRunTransaction = FirestoreProto.runTransaction;
    if (originalRunTransaction) FirestoreProto.runTransaction = function (updateFunction, ...rest) {
      let attempt = 0;
      let finalAttempt = 0;
      const wrapped = transaction => {
        attempt += 1;
        finalAttempt = attempt;
        const reads = [];
        const writes = [];
        const deletes = [];
        const txProxy = Object.create(transaction);

        if (typeof transaction.get === "function") txProxy.get = ref => {
          const target = refPath(ref);
          return Promise.resolve(transaction.get(ref)).then(snap => {
            reads.push(target);
            success("read", `TX GET #${attempt}`, target, 1, "transaction read; SDK may retry transaction");
            return snap;
          }, err => {
            failure("read", `TX GET #${attempt}`, target, err);
            throw err;
          });
        };
        for (const method of ["set", "update"]) {
          if (typeof transaction[method] !== "function") continue;
          txProxy[method] = (ref, ...args) => {
            writes.push(refPath(ref));
            transaction[method](ref, ...args);
            return txProxy;
          };
        }
        if (typeof transaction.delete === "function") txProxy.delete = ref => {
          deletes.push(refPath(ref));
          transaction.delete(ref);
          return txProxy;
        };

        return Promise.resolve(updateFunction(txProxy)).then(result => {
          recordDbActivity({
            status: "attempt",
            kind: "transaction",
            operation: `TRANSACTION CALLBACK #${attempt}`,
            target: [...new Set(reads.concat(writes, deletes))].slice(0, 10).join(", ") || "transaction",
            count: reads.length + writes.length + deletes.length,
            detail: `${reads.length} read(s), ${writes.length} write(s), ${deletes.length} delete(s) queued`
          });
          return result;
        });
      };

      return Promise.resolve(originalRunTransaction.call(this, wrapped, ...rest)).then(result => {
        recordDbActivity({
          status: "ok",
          kind: "transaction",
          operation: "TRANSACTION COMMIT",
          target: "transaction",
          count: 1,
          detail: `committed after ${finalAttempt || 1} callback attempt(s)`
        });
        return result;
      }, err => {
        failure("transaction", "TRANSACTION FAILED", "transaction", err);
        throw err;
      });
    };
  }

  function extractSnapshotCallbacks(args) {
    if (!args?.length) return null;
    let observerIndex = -1;
    let nextIndex = -1;
    let errorIndex = -1;

    for (let i = 0; i < args.length; i++) {
      const value = args[i];
      if (value && typeof value === "object" && (typeof value.next === "function" || typeof value.error === "function")) {
        observerIndex = i;
        break;
      }
      if (typeof value === "function") {
        if (nextIndex < 0) nextIndex = i;
        else if (errorIndex < 0) errorIndex = i;
      }
    }

    if (observerIndex >= 0) {
      const observer = args[observerIndex];
      const originalNext = observer.next?.bind(observer);
      const originalError = observer.error?.bind(observer);
      return {
        next: originalNext,
        error: originalError,
        replaceNext(fn) { args[observerIndex] = { ...observer, next: fn }; },
        replaceError(fn) { args[observerIndex] = { ...args[observerIndex], error: fn }; }
      };
    }

    if (nextIndex >= 0) {
      const originalNext = args[nextIndex];
      const originalError = errorIndex >= 0 ? args[errorIndex] : null;
      return {
        next: originalNext,
        error: originalError,
        replaceNext(fn) { args[nextIndex] = fn; },
        replaceError(fn) {
          if (errorIndex >= 0) args[errorIndex] = fn;
          else args.splice(nextIndex + 1, 0, fn);
        }
      };
    }
    return null;
  }

  window.LiveSuiteDbActivity = {
    storageKey: STORAGE_KEY,
    settingsKey: SETTINGS_KEY,
    channelName: CHANNEL_NAME,
    maxEntries: MAX_ENTRIES,
    projectId,
    flush,
    getEntries() {
      flush();
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") || []; }
      catch (_) { return []; }
    },
    clear() {
      pending = [];
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      try { channel?.postMessage({ type: "db-activity-clear" }); } catch (_) {}
    },
    isPaused() { return settings().paused === true; },
    setPaused(paused) {
      const next = { ...settings(), paused: !!paused };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      try { channel?.postMessage({ type: "db-activity-settings" }); } catch (_) {}
    }
  };
})();
