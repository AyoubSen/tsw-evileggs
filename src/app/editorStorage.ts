const DATABASE_NAME = 'mossfire-map-editor'
const STORE_NAME = 'drafts'
const DRAFT_KEY = 'current'

function openEditorDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open editor storage.'))
  })
}

export async function saveEditorDraft(value: unknown): Promise<void> {
  const database = await openEditorDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(value, DRAFT_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save draft.'))
  })
  database.close()
}

export async function loadEditorDraft<T>(): Promise<T | null> {
  const database = await openEditorDatabase()
  const value = await new Promise<T | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(DRAFT_KEY)
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('Unable to load draft.'))
  })
  database.close()
  return value
}
