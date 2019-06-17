import { openDB } from 'idb';


// This module defines an Amplify Auth.storage mechanism that writes to IndexedDB.
// It uses idb as a simple wrapper on IndexedDB.
//
// Unfortunately, as of this writing, Amplify assumes a synchronous interface on
// Auth.storage, but IndexedDB is inherently async. So to fulfill the Auth.storage
// contract, our "get"s on IndexedDB must be synchronous, and that can only be
// achieved by using a back-to-back approach where essentially this module is
// an in-memory datastore, and it merely back-to-back's its writes and deletes
// to IndexedDB. The Auth.storage spec facilitates this approach via its "sync" method.


// constants
const dbName = 'AuthStorageDB';
const tableName = 'authStorageKeyval';


// Standard definitions mostly taken from the idb documentation, providing a very
// simple and lightweight asynchronous interface to IndexedDB.
const dbPromise = openDB(dbName, 1, {
  upgrade(db) {
    db.createObjectStore(tableName);
  },
});
const idbKeyval = {
  async get(key) {
    return (await dbPromise).get(tableName, key);
  },
  async set(key, val) {
    return (await dbPromise).put(tableName, val, key);
  },
  async delete(key) {
    return (await dbPromise).delete(tableName, key);
  },
  async clear() {
    return (await dbPromise).clear(tableName);
  },
  async keys() {
    return (await dbPromise).getAllKeys(tableName);
  },
};


// The source-of-truth datastore for our Cognito Auth tokens.
let kvStore = {};


// Our class implementing the Amplify Auth.storage contract, which wraps
// the very simple interface to IndexedDB defined above, and keeps it in
// sync with kvStore as well.

class AuthStorageIDB {
  // In case consumer wishes to interrogate
  storageType() { return 'AuthStorageIDB'; }

  // In Amplify Auth, if a custom storage object is used
  // but it has no properties, an "Empty storage object" error is thrown.
  // ("AuthClass - The storage in the Auth config can not be empty!"). So we
  // add a dummy property here to avoid this error.
  constructor() {
    this.dummyStorageProp = 'dummyStorageProp';
  }


  // Methods required by Amplify Auth


  // Factory method creates this class and returns it via the callback
  // when the db is opened.
  static async init(errorCallback, callback) {
    const myObj = new AuthStorageIDB();

    const testItemKey = 'testItemKey';
    const testItemValue = 'testItemValue';

    try {
      await myObj.setItem(testItemKey, testItemValue);
    } catch (err) {
      return errorCallback(err);
    }

    // If we made it to here, great, setItem worked. There is no point doing a getItem, because
    // it will only use the in-memory storage anyway. Try a removeItem

    let removeResult = false;
    try {
      removeResult = await myObj.removeItem(testItemKey);
    } catch (err) {
      return errorCallback(err);
    }

    if (!removeResult) {
      const errMsg = 'In AuthStorageIDB.init, after a test removeItem, removeItem reported false. Should be true. Returning errorCallback';
      return errorCallback(errMsg);
    }


    const myNewStorage = await myObj.sync();
    kvStore = myNewStorage;

    return callback(myObj);
  }


  // Set item with the key
  async setItem(key, value) {
    const result = await AuthStorageIDB.setItem(key, value);
    return result;
  }

  static async setItem(key, value) {
    // First, write to the source-of-truth
    kvStore[key] = value;

    // Then, back-to-back write (asynchronously) to IndexedDB
    const storeObject = { myKey: key, myValue: value };

    try {
      await idbKeyval.set(key, value);
    } catch (err) {
      console.log(`IDB Error. In static async setItem, while await idbKeyval.set(key=${key}, value=${value}), caught err:${err}`);
    }

    return value;
  }


  // Get item with the key
  static getItem(key) {
    // Always use the in-memory store
    return kvStore[key];
  }

  getItem(key) {
    return AuthStorageIDB.getItem(key);
  }


  // Remove item with the key
  static removeItem(key) {
    // Determine if such a key exists and delete the in-memory record if so
    let success = false;
    if (AuthStorageIDB.getItem(key)) {
      delete kvStore[key];
      success = true;
    }

    if (success) {
      // True-up the IndexedDB store, asynchronously.
      // Fire-and-forget (no await)
      idbKeyval.delete(key).catch((err) => {
        console.log(`IDB Error. In static removeItem, idbKeyval.delete(key=${key}) threw an err: ${err} Continuing.`);
      });
    }

    return success;
  }

  removeItem(key) {
    return AuthStorageIDB.removeItem(key);
  }


  // Clear out the storage
  static clear() {
    // Clear the in-memory source of truth
    kvStore = {};

    // True-up the IndexedDB store, asynchronously.
    // Fire-and-forget (no await)
    idbKeyval.clear().catch((err) => {
      console.log(`IDB Error. In static clear, idbKeyval.clear() threw an err: ${err} Continuing.`);
    });

    return {};
  }

  clear() {
    return AuthStorageIDB.clear();
  }


  // NOTE: The Amplify docs are essentially as below, but it seems
  // misleading. This method seems to work fine so long as it returns
  // a Promise resolved with an object that suffices for our kvStore.
  // It is idempotent so long as the IndexedDB is not changing. Seems
  // like Amplify Auth does not run sync() enough to interfere with
  // setItem calls and vice versa, so we should be good with this
  // simplistic async version of sync(). We also want to manually
  // invoke it ourselves, so the easier it is to reason about, the
  // better.
  //
  // Per AWS: If the storage operations are async(i.e AsyncStorage)
  // Then you need to sync those items into the memory in this method
  async sync() {
    // MS Edge does not yet support .getAll() so we use map()

    const keysArry = await idbKeyval.keys();

    const resultArry = {};
    await keysArry.map(async (key) => {
      const value = await idbKeyval.get(key);
      resultArry[key] = value;
    });

    // Return a Promise-wrapped object suitable for our permanent storage
    return Promise.resolve(resultArry);
  }
}


export default AuthStorageIDB;
