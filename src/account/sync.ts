import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { projectAccountPreferences, sanitizeAccountData, type AccountData, type AccountEnvelope, type AccountPreferences } from '../shared/account'
import { sanitizeOutfitPresetRecord, type OutfitPresetRecord } from '../profile/outfitPresets'
import type { Preferences } from '../app/preferences'
import type { OptionalAuth } from './auth'
import { AccountConflictError, deleteAccountData, getAccount, syncAccount } from './client'

export type AccountSyncState = 'local' | 'loading' | 'decision' | 'syncing' | 'synced' | 'offline'
const cachePrefix = 'mossfire:account:'

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

const mergePreferenceValue = (base: unknown, local: unknown, remote: unknown): unknown => {
  if (same(local, base)) return remote
  if (same(remote, base)) return local
  if (base && local && remote && typeof base === 'object' && typeof local === 'object' && typeof remote === 'object') {
    const result: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]))
      result[key] = mergePreferenceValue((base as Record<string, unknown>)[key], (local as Record<string, unknown>)[key], (remote as Record<string, unknown>)[key])
    return result
  }
  return local
}

export const mergeAccountPreferences = (base: AccountPreferences, local: AccountPreferences, remote: AccountPreferences): AccountPreferences =>
  mergePreferenceValue(base, local, remote) as AccountPreferences

const recordsById = (records: readonly OutfitPresetRecord[]) => {
  const result = new Map<string, OutfitPresetRecord>()
  for (const raw of records) {
    const record = sanitizeOutfitPresetRecord(raw)
    if (record) result.set(record.id, record)
  }
  return result
}

// Presets are merged against the revision both clients read. Client wall clocks are never used to pick a winner.
export const mergeOutfitPresetRecords = (base: readonly OutfitPresetRecord[], local: readonly OutfitPresetRecord[], remote: readonly OutfitPresetRecord[]) => {
  const bases = recordsById(base), locals = recordsById(local), remotes = recordsById(remote)
  const records: OutfitPresetRecord[] = []
  for (const id of new Set([...bases.keys(), ...locals.keys(), ...remotes.keys()])) {
    const before = bases.get(id), localRecord = locals.get(id), remoteRecord = remotes.get(id)
    const localChanged = !same(localRecord, before), remoteChanged = !same(remoteRecord, before)
    let winner = localChanged ? localRecord : remoteRecord
    if (localChanged && remoteChanged && remoteRecord?.deleted === true) winner = remoteRecord
    if (winner) records.push(winner)
  }
  return records
}

export const mergeAccountData = (base: AccountData, local: AccountData, remote: AccountData): AccountData =>
  sanitizeAccountData({
    preferences: mergeAccountPreferences(base.preferences, local.preferences, remote.preferences),
    outfitPresets: mergeOutfitPresetRecords(base.outfitPresets, local.outfitPresets, remote.outfitPresets),
  })

export const projectLocalAccountData = (preferences: Preferences, prior: AccountData | null): AccountData => {
  const projected = projectAccountPreferences(preferences)
  const priorRecords = recordsById(prior?.outfitPresets ?? [])
  const withoutRevision = (record: OutfitPresetRecord) => {
    const { syncRevision: _syncRevision, ...value } = record
    return value
  }
  const active = projected.outfitPresets.flatMap((record): OutfitPresetRecord[] => {
    const previous = priorRecords.get(record.id)
    if (previous?.deleted === true && !record.syncRevision) return []
    if (previous?.deleted !== true && previous?.syncRevision && same(withoutRevision(record), withoutRevision(previous)))
      return [{ ...record, syncRevision: previous.syncRevision }]
    return [record]
  })
  const activeIds = new Set(active.map((record) => record.id))
  const tombstones = (prior?.outfitPresets ?? []).flatMap((record): OutfitPresetRecord[] => {
    if (activeIds.has(record.id)) return []
    if (record.deleted === true) return [record]
    return [{ version: 1, id: record.id, name: record.name, updatedAt: record.updatedAt, deleted: true }]
  })
  return sanitizeAccountData({ ...projected, outfitPresets: [...active, ...tombstones] })
}

export const applyCloudAccountData = (current: Preferences, data: AccountData): Preferences => ({
  ...current,
  playerNames: current.playerNames.map((value, index) => index === 0 ? data.preferences.displayName : value),
  playerAppearances: current.playerAppearances.map((value, index) => index === 0 ? data.preferences.preferredAppearance : value),
  outfitPresets: data.outfitPresets.filter((record) => record.deleted !== true),
  reducedMotion: data.preferences.reducedMotion, highContrastHud: data.preferences.highContrastHud,
  cameraShake: data.preferences.cameraShake, cameraMode: data.preferences.cameraMode,
  aimGuide: data.preferences.aimGuide, screenFlash: data.preferences.screenFlash,
  mute: data.preferences.mute, masterVolume: data.preferences.masterVolume,
  soundEffectsVolume: data.preferences.soundEffectsVolume, lastMode: data.preferences.defaultMatch.mode,
  lastMapId: data.preferences.defaultMatch.mapId, turnDurationSeconds: data.preferences.defaultMatch.turnDurationSeconds,
  projectileBoundaryMode: data.preferences.defaultMatch.projectileBoundaryMode,
})

export function useAccountSync(auth: OptionalAuth, preferences: Preferences, setPreferences: Dispatch<SetStateAction<Preferences>>) {
  const [state, setState] = useState<AccountSyncState>('local')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const envelopeRef = useRef<AccountEnvelope | null>(null)
  const userRef = useRef<string | null>(null)
  const readyRef = useRef(false)
  const guestPreferencesRef = useRef<Preferences | null>(null)
  const preferencesRef = useRef(preferences)
  preferencesRef.current = preferences

  const clear = () => {
    envelopeRef.current = null; readyRef.current = false; setPending(false); setLastSyncedAt(null); setError(null); setState('local')
  }

  useEffect(() => {
    const id = auth.user?.id ?? null
    if (!auth.loaded || id === userRef.current && loadAttempt === 0) return
    const previousId = userRef.current
    userRef.current = id
    envelopeRef.current = null; readyRef.current = false; setPending(false); setError(null)
    if (!id) {
      if (previousId && guestPreferencesRef.current) setPreferences(guestPreferencesRef.current)
      setState('local')
      return
    }
    if (!previousId) guestPreferencesRef.current = preferencesRef.current
    const startingPreferences = previousId !== id && guestPreferencesRef.current
      ? guestPreferencesRef.current
      : preferencesRef.current
    if (previousId !== id && guestPreferencesRef.current) setPreferences(guestPreferencesRef.current)
    setState('loading')
    let cached: AccountEnvelope | null = null
    const loadBaseline = projectAccountPreferences(startingPreferences)
    try {
      const parsed = JSON.parse(localStorage.getItem(`${cachePrefix}${id}:envelope`) ?? 'null') as Partial<AccountEnvelope> | null
      if (parsed && Number.isSafeInteger(parsed.revision) && parsed.revision! >= 0)
        cached = { revision: parsed.revision!, data: sanitizeAccountData(parsed.data) }
    } catch { /* A corrupt account-scoped cache is ignored. */ }
    void getAccount(auth.getToken).then((remote) => {
      if (userRef.current !== id) return
      envelopeRef.current = remote
      localStorage.setItem(`${cachePrefix}${id}:envelope`, JSON.stringify(remote))
      if (localStorage.getItem(`${cachePrefix}${id}:decision`) !== 'yes') { setState('decision'); return }
      setPreferences((current) => applyCloudAccountData(
        current,
        mergeAccountData(cached?.data ?? loadBaseline, projectAccountPreferences(current), remote.data),
      ))
      readyRef.current = true; setLastSyncedAt(Date.now()); setState('synced')
    }).catch((caught) => {
      if (userRef.current !== id) return
      if (cached && localStorage.getItem(`${cachePrefix}${id}:decision`) === 'yes') {
        envelopeRef.current = cached; readyRef.current = true
        setPreferences((current) => applyCloudAccountData(current, cached!.data))
      }
      setError(caught instanceof Error ? caught.message : 'Account unavailable.'); setState('offline')
    })
  }, [auth.loaded, auth.user?.id, loadAttempt])

  useEffect(() => {
    if (!auth.signedIn || !auth.user || !readyRef.current || state === 'loading' || state === 'decision' || state === 'syncing' || state === 'offline') return
    const current = envelopeRef.current
    if (!current) return
    const data = projectLocalAccountData(preferences, current.data)
    if (same(data, current.data)) { setPending(false); return }
    setPending(true)
    const id = auth.user.id
    const timer = setTimeout(() => {
      if (userRef.current !== id) return
      setState('syncing'); setError(null)
      const push = (base: AccountEnvelope, merged: AccountData) => syncAccount(auth.getToken, base.revision, merged)
      void push(current, data).catch(async (caught) => {
        if (!(caught instanceof AccountConflictError)) throw caught
        const merged = mergeAccountData(current.data, data, caught.envelope.data)
        return push(caught.envelope, merged)
      }).then((next) => {
        if (userRef.current !== id) return
        envelopeRef.current = next
        localStorage.setItem(`${cachePrefix}${id}:envelope`, JSON.stringify(next))
        setPreferences((currentPreferences) => applyCloudAccountData(currentPreferences, next.data))
        setPending(false); setLastSyncedAt(Date.now()); setState('synced')
      }).catch((caught) => {
        if (userRef.current !== id) return
        setError(caught instanceof Error ? caught.message : 'Account sync failed.'); setState('offline')
      })
    }, 750)
    return () => clearTimeout(timer)
  }, [preferences, auth.signedIn, auth.user?.id, state])

  const retry = () => {
    if (!auth.user || state !== 'offline') return
    setError(null)
    if (readyRef.current) setState('synced')
    else setLoadAttempt((value) => value + 1)
  }
  const retryRef = useRef(retry)
  retryRef.current = retry
  useEffect(() => {
    const online = () => retryRef.current()
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [])
  useEffect(() => {
    if (state !== 'offline' || !navigator.onLine) return
    const timer = window.setTimeout(() => retryRef.current(), 10_000)
    return () => window.clearTimeout(timer)
  }, [state, loadAttempt])

  const chooseInitial = (importLocal: boolean) => {
    if (!auth.user || !envelopeRef.current) return
    localStorage.setItem(`${cachePrefix}${auth.user.id}:decision`, 'yes')
    if (!importLocal) setPreferences((current) => applyCloudAccountData(current, envelopeRef.current!.data))
    else if (guestPreferencesRef.current) setPreferences(guestPreferencesRef.current)
    readyRef.current = true; setState('synced')
  }
  const restoreGuest = () => { if (guestPreferencesRef.current) setPreferences(guestPreferencesRef.current) }
  const remove = async () => {
    if (!auth.user) return
    const id = auth.user.id
    try {
      await deleteAccountData(auth.getToken)
      localStorage.removeItem(`${cachePrefix}${id}:decision`); localStorage.removeItem(`${cachePrefix}${id}:envelope`)
      restoreGuest(); clear(); userRef.current = null; await auth.signOut()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Account data could not be deleted.'); throw caught
    }
  }
  const signOut = async () => {
    await auth.signOut()
    restoreGuest(); clear(); userRef.current = null
  }
  return { state, error, pending, lastSyncedAt, retry, chooseInitial, deleteData: remove, signOut }
}
