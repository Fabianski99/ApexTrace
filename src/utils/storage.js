const DATABASE = 'apextrace-v1';
const STORE = 'laps';

function connect() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB no está disponible.'));
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB.'));
  });
}

async function transact(mode, run) {
  const db = await connect();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    let result;
    if (request) {
      request.onsuccess = () => { result = request.result; };
    }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Error al guardar telemetría.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Operación cancelada.')); };
  });
}

export const getStoredLaps = () => transact('readonly', store => store.getAll());
export const saveStoredLaps = laps => transact('readwrite', store => {
  for (const lap of laps) store.put(lap);
});
export const deleteStoredLap = id => transact('readwrite', store => store.delete(id));
export const clearStoredLaps = () => transact('readwrite', store => store.clear());

/** Reemplaza registros provisionales de una sesión al importarla después con su .ldx. */
export const replaceStoredSession = (sessionKey, laps) => transact('readwrite', store => {
  const request = store.getAll();
  request.onsuccess = () => {
    for (const lap of request.result) {
      if (lap.sessionKey === sessionKey) store.delete(lap.id);
    }
    for (const lap of laps) store.put(lap);
  };
});
