import type { ExportData, ProcessedSample } from '../types/sensors'

/** Trigger a file download in the browser. */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Export full session as JSON (includes raw data optionally). */
export function exportJson(data: ExportData, filename?: string) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  download(blob, filename ?? `measure-motion-${data.session.id.slice(0, 8)}.json`)
}

/** Export processed samples as CSV. */
export function exportCsv(samples: ProcessedSample[], sessionId: string, filename?: string) {
  const header = 't_s,gLateral,gLongitudinal,gVertical,gTotal,posEast_m,posNorth_m,posUp_m,aEast,aNorth,aUp'
  const rows = samples.map(s =>
    [
      s.t.toFixed(3),
      s.gLateral.toFixed(4),
      s.gLongitudinal.toFixed(4),
      s.gVertical.toFixed(4),
      s.gTotal.toFixed(4),
      s.posEast.toFixed(3),
      s.posNorth.toFixed(3),
      s.posUp.toFixed(3),
      s.aEast.toFixed(4),
      s.aNorth.toFixed(4),
      s.aUp.toFixed(4),
    ].join(',')
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  download(blob, filename ?? `measure-motion-${sessionId.slice(0, 8)}.csv`)
}

/** Parse an imported JSON or CSV file and return ExportData. */
export async function importFile(file: File): Promise<ExportData> {
  const text = await file.text()

  if (file.name.endsWith('.json') || file.type === 'application/json') {
    const data = JSON.parse(text) as ExportData
    if (data.version !== 1 || !data.session || !data.processed) {
      throw new Error('Invalid JSON format')
    }
    return data
  }

  if (file.name.endsWith('.csv') || file.type === 'text/csv') {
    const lines = text.trim().split('\n')
    const header = lines[0].split(',')
    const idx = (col: string) => header.indexOf(col)

    const samples: ProcessedSample[] = lines.slice(1).map(line => {
      const cols = line.split(',')
      const f = (col: string) => parseFloat(cols[idx(col)] ?? '0')
      return {
        t:              f('t_s'),
        gLateral:       f('gLateral'),
        gLongitudinal:  f('gLongitudinal'),
        gVertical:      f('gVertical'),
        gTotal:         f('gTotal'),
        posEast:        f('posEast_m'),
        posNorth:       f('posNorth_m'),
        posUp:          f('posUp_m'),
        aEast:          f('aEast'),
        aNorth:         f('aNorth'),
        aUp:            f('aUp'),
      }
    })

    const now = Date.now()
    const id  = `import-${now}`
    const gValues = samples.map(s => s.gTotal)

    return {
      version: 1,
      session: {
        id,
        name: file.name,
        startTime: now,
        endTime:   now,
        status:   'done',
        sampleCount:    samples.length,
        gpsSampleCount: 0,
      },
      processed: {
        sessionId:  id,
        samples,
        originLat:  null,
        originLng:  null,
        peakG:      Math.max(...gValues),
        avgG:       gValues.reduce((a, b) => a + b, 0) / gValues.length,
        duration:   samples.at(-1)?.t ?? 0,
      },
    }
  }

  throw new Error('Unsupported file type. Use .json or .csv')
}
