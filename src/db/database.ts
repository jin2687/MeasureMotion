import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type {
  Session,
  RawMotionSample,
  RawOrientationSample,
  RawGpsSample,
  ProcessedSession,
} from '../types/sensors'

interface MeasureMotionDB extends DBSchema {
  sessions: {
    key: string
    value: Session
    indexes: { 'by-startTime': number }
  }
  motion: {
    key: number
    value: RawMotionSample & { sessionId: string }
    indexes: { 'by-session': string }
  }
  orientation: {
    key: number
    value: RawOrientationSample & { sessionId: string }
    indexes: { 'by-session': string }
  }
  gps: {
    key: number
    value: RawGpsSample & { sessionId: string }
    indexes: { 'by-session': string }
  }
  processed: {
    key: string   // sessionId
    value: ProcessedSession
  }
}

const DB_NAME = 'measure-motion'
const DB_VERSION = 1

let _db: IDBPDatabase<MeasureMotionDB> | null = null

export async function getDb(): Promise<IDBPDatabase<MeasureMotionDB>> {
  if (_db) return _db
  _db = await openDB<MeasureMotionDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // sessions store
      const sessions = db.createObjectStore('sessions', { keyPath: 'id' })
      sessions.createIndex('by-startTime', 'startTime')

      // motion store – auto-increment key
      const motion = db.createObjectStore('motion', { autoIncrement: true })
      motion.createIndex('by-session', 'sessionId')

      // orientation store
      const orientation = db.createObjectStore('orientation', { autoIncrement: true })
      orientation.createIndex('by-session', 'sessionId')

      // gps store
      const gps = db.createObjectStore('gps', { autoIncrement: true })
      gps.createIndex('by-session', 'sessionId')

      // processed results
      db.createObjectStore('processed', { keyPath: 'sessionId' })
    },
  })
  return _db
}

// ─── Session helpers ─────────────────────────────────────────────────────────

export async function saveSession(session: Session): Promise<void> {
  const db = await getDb()
  await db.put('sessions', session)
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDb()
  return db.get('sessions', id)
}

export async function getAllSessions(): Promise<Session[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('sessions', 'by-startTime')
  return all.reverse() // newest first
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['sessions', 'motion', 'orientation', 'gps', 'processed'], 'readwrite')
  tx.objectStore('sessions').delete(id)
  tx.objectStore('processed').delete(id)

  // delete by index using cursor
  for (const storeName of ['motion', 'orientation', 'gps'] as const) {
    const index = tx.objectStore(storeName).index('by-session')
    let cursor = await index.openCursor(id)
    while (cursor) {
      cursor.delete()
      cursor = await cursor.continue()
    }
  }
  await tx.done
}

// ─── Raw sample writers (fire-and-forget friendly) ───────────────────────────

export async function appendMotion(
  sessionId: string,
  sample: RawMotionSample,
): Promise<void> {
  const db = await getDb()
  await db.add('motion', { ...sample, sessionId })
}

export async function appendOrientation(
  sessionId: string,
  sample: RawOrientationSample,
): Promise<void> {
  const db = await getDb()
  await db.add('orientation', { ...sample, sessionId })
}

export async function appendGps(
  sessionId: string,
  sample: RawGpsSample,
): Promise<void> {
  const db = await getDb()
  await db.add('gps', { ...sample, sessionId })
}

// ─── Raw sample readers ───────────────────────────────────────────────────────

export async function getMotionSamples(sessionId: string): Promise<RawMotionSample[]> {
  const db = await getDb()
  const rows = await db.getAllFromIndex('motion', 'by-session', sessionId)
  return rows.sort((a, b) => a.t - b.t)
}

export async function getOrientationSamples(sessionId: string): Promise<RawOrientationSample[]> {
  const db = await getDb()
  const rows = await db.getAllFromIndex('orientation', 'by-session', sessionId)
  return rows.sort((a, b) => a.t - b.t)
}

export async function getGpsSamples(sessionId: string): Promise<RawGpsSample[]> {
  const db = await getDb()
  const rows = await db.getAllFromIndex('gps', 'by-session', sessionId)
  return rows.sort((a, b) => a.t - b.t)
}

// ─── Processed data ───────────────────────────────────────────────────────────

export async function saveProcessed(data: ProcessedSession): Promise<void> {
  const db = await getDb()
  await db.put('processed', data)
}

export async function getProcessed(sessionId: string): Promise<ProcessedSession | undefined> {
  const db = await getDb()
  return db.get('processed', sessionId)
}
