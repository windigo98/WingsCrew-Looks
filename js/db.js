const DB_NAME = "wingscrew-looks";
const VERSION = 1;

let dbPromise = null;

function openDatabase() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error("This browser can't store photos on the device."));
        return;
      }
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of ["photos", "items", "looks", "wishes", "votes"]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open device storage."));
    });
  }
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Storage request failed."));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Storage failed."));
    tx.onabort = () => reject(tx.error || new Error("Storage was interrupted."));
  });
}

async function put(store, value) {
  const db = await openDatabase();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await transactionDone(tx);
}

async function getAll(store) {
  const db = await openDatabase();
  const tx = db.transaction(store, "readonly");
  const rows = await requestToPromise(tx.objectStore(store).getAll());
  await transactionDone(tx);
  return rows || [];
}

async function remove(store, id) {
  const db = await openDatabase();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(id);
  await transactionDone(tx);
}

export async function getMeta(key) {
  const db = await openDatabase();
  const tx = db.transaction("meta", "readonly");
  const row = await requestToPromise(tx.objectStore("meta").get(key));
  await transactionDone(tx);
  return row ? row.value : null;
}

export async function setMeta(key, value) {
  const db = await openDatabase();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key, value });
  await transactionDone(tx);
}

export async function clearAll() {
  const db = await openDatabase().catch(() => null);
  db?.close();
  dbPromise = null;
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Could not delete device data."));
    request.onblocked = () => resolve();
  });
}

export const db = {
  getMeta,
  setMeta,
  getAllPhotos: () => getAll("photos"),
  putPhoto: (photo) => put("photos", photo),
  deletePhoto: (id) => remove("photos", id),
  getAllItems: () => getAll("items"),
  putItem: (item) => put("items", item),
  deleteItem: (id) => remove("items", id),
  getAllLooks: () => getAll("looks"),
  putLook: (look) => put("looks", look),
  deleteLook: (id) => remove("looks", id),
  getAllWishes: () => getAll("wishes"),
  putWish: (wish) => put("wishes", wish),
  deleteWish: (id) => remove("wishes", id),
  getAllVotes: () => getAll("votes"),
  putVote: (vote) => put("votes", vote),
  deleteVote: (id) => remove("votes", id),
  clearAll,
};
