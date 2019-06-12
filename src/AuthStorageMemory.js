// This simple class is designed to store our Auth data in memory. No sync actions required.


// The source-of-truth datastore for our Cognito Auth tokens.
let kvStore = {};


class AuthStorageMemory {
  // In case consumer wishes to interrogate
  storageType() { return 'AuthStorageMemory'; }

  // In Amplify Auth, if a custom storage object is used
  // but it has no properties, an "Empty storage object" error is thrown.
  // ("AuthClass - The storage in the Auth config can not be empty!"). So we
  // add a dummy property here to avoid this error.
  constructor() {
    this.dummyStorageProp = 'dummyStorageProp';
  }


  // Methods required by Amplify Auth


  setItem(key, value) {
    kvStore[key] = value;
    return kvStore[key];
  }

  getItem(key) {
    return kvStore[key];
  }

  removeItem(key) {
    if (Object.prototype.hasOwnProperty.call(kvStore, key)) {
      const success = delete kvStore[key];
      return success;
    }
    return false;
  }

  clear() {
    kvStore = {};
    return kvStore;
  }
}


export default AuthStorageMemory;
