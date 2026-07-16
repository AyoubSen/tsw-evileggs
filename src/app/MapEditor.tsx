import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  MAP_FORMAT_VERSION,
  encodeMaterialRows,
  resolveMapDocument,
  spawnSeatForIndex,
  type MapDocument,
  type MapTheme,
  type MatchMode,
  type SpawnDefinition,
} from '../maps/mapDocument'
import { TERRAIN_MATERIAL, type TerrainMaterialId } from '../terrain/materials'
import { loadEditorDraft, saveEditorDraft } from './editorStorage'

type SupportedMode = MatchMode
type EditorTool = 'brush' | 'line' | 'rectangle' | 'fill' | 'spawn'
type EditorDraft = {
  version: 1
  id: string
  revision: number
  mode: SupportedMode
  displayName: string
  description: string
  label: string
  width: number
  height: number
  cellSize: number
  theme: MapTheme
  cells: Uint8Array
  spawns: SpawnDefinition[]
}

type MapEditorProps = {
  onBack: () => void
  onTestPlay: (document: MapDocument) => void
}

const EDITOR_THEME: MapTheme = {
  sky: 0x9edce5,
  sun: 0xffedb1,
  backHill: 0x678f7c,
  terrain: 0x8a5a3b,
  surface: 0x56845a,
  dust: 0xa88d69,
  brick: 0xb5523b,
  stone: 0x7a7770,
  steel: 0x344951,
}

const MATERIALS: Array<{ id: TerrainMaterialId; name: string }> = [
  { id: TERRAIN_MATERIAL.empty, name: 'Eraser' },
  { id: TERRAIN_MATERIAL.soil, name: 'Soil' },
  { id: TERRAIN_MATERIAL.brick, name: 'Brick' },
  { id: TERRAIN_MATERIAL.stone, name: 'Stone' },
  { id: TERRAIN_MATERIAL.steel, name: 'Steel' },
]

const THEME_FIELDS: Array<{ key: keyof MapTheme; label: string }> = [
  { key: 'sky', label: 'Sky' },
  { key: 'sun', label: 'Sun' },
  { key: 'backHill', label: 'Back hill' },
  { key: 'terrain', label: 'Soil' },
  { key: 'surface', label: 'Surface' },
  { key: 'dust', label: 'Dust' },
  { key: 'brick', label: 'Brick' },
  { key: 'stone', label: 'Stone' },
  { key: 'steel', label: 'Steel' },
]

const SIZE_PRESETS = [
  { label: 'Classic 960 × 540', width: 960, height: 540 },
  { label: 'Wide 1280 × 720', width: 1280, height: 720 },
  { label: 'Team 1440 × 810', width: 1440, height: 810 },
  { label: '3v3 1728 × 972', width: 1728, height: 972 },
]

const SPAWN_POSITIONS: Record<SupportedMode, readonly number[]> = {
  '1v1': [0.18, 0.82],
  '2v2': [0.13, 0.87, 0.32, 0.68],
  '3v3': [0.1, 0.9, 0.25, 0.75, 0.4, 0.6],
}

const cloneDraft = (draft: EditorDraft): EditorDraft => ({
  ...draft,
  theme: { ...draft.theme },
  cells: new Uint8Array(draft.cells),
  spawns: draft.spawns.map((spawn) => ({ ...spawn })),
})

const colorToCss = (color: number) => `#${color.toString(16).padStart(6, '0')}`

const colorChannels = (color: number): [number, number, number] => [
  (color >> 16) & 0xff,
  (color >> 8) & 0xff,
  color & 0xff,
]

const materialColor = (theme: MapTheme, material: TerrainMaterialId): string => {
  if (material === TERRAIN_MATERIAL.soil) return colorToCss(theme.terrain)
  if (material === TERRAIN_MATERIAL.brick) return colorToCss(theme.brick)
  if (material === TERRAIN_MATERIAL.stone) return colorToCss(theme.stone)
  if (material === TERRAIN_MATERIAL.steel) return colorToCss(theme.steel)
  return colorToCss(theme.sky)
}

function defaultSpawns(
  width: number,
  mode: SupportedMode,
  surfaceYAt: (worldX: number) => number,
): SpawnDefinition[] {
  return SPAWN_POSITIONS[mode].map((position, index) => {
    const x = Math.round(width * position)
    return { x, y: surfaceYAt(x), ...spawnSeatForIndex(index) }
  })
}

function createDraft(width = 960, height = 540, mode: SupportedMode = '1v1'): EditorDraft {
  const cellSize = 2
  const cellWidth = width / cellSize
  const cellHeight = height / cellSize
  const cells = new Uint8Array(cellWidth * cellHeight)
  const groundCell = Math.floor(cellHeight * 0.7)
  cells.fill(TERRAIN_MATERIAL.soil, groundCell * cellWidth)
  const groundY = groundCell * cellSize
  return {
    version: 1,
    id: 'untitled-map',
    revision: 1,
    mode,
    displayName: 'Untitled Map',
    description: 'A locally authored Mossfire battlefield.',
    label: 'Custom map',
    width,
    height,
    cellSize,
    theme: { ...EDITOR_THEME },
    cells,
    spawns: defaultSpawns(width, mode, () => groundY),
  }
}

function buildDocument(draft: EditorDraft): MapDocument {
  return {
    format: 'mossfire-map',
    formatVersion: MAP_FORMAT_VERSION,
    id: draft.id.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    revision: draft.revision,
    mode: draft.mode,
    displayName: draft.displayName.trim(),
    description: draft.description.trim(),
    label: draft.label.trim(),
    width: draft.width,
    height: draft.height,
    theme: { ...draft.theme },
    spawns: draft.spawns.map((spawn) => ({ ...spawn })),
    terrain: {
      encoding: 'row-rle-v1',
      cellSize: draft.cellSize,
      rows: encodeMaterialRows(
        draft.cells,
        draft.width / draft.cellSize,
        draft.height / draft.cellSize,
      ),
    },
  }
}

function draftFromDocument(document: MapDocument): EditorDraft {
  const resolved = resolveMapDocument(document)
  if (resolved.mode !== '1v1' && resolved.mode !== '2v2' && resolved.mode !== '3v3')
    throw new Error('The editor supports only 1v1, 2v2, and 3v3 maps.')
  return {
    version: 1,
    id: document.id,
    revision: document.revision,
    mode: resolved.mode,
    displayName: document.displayName,
    description: document.description,
    label: document.label,
    width: resolved.width,
    height: resolved.height,
    cellSize: resolved.terrainScale,
    theme: { ...resolved.theme },
    cells: new Uint8Array(resolved.terrainCells),
    spawns: resolved.spawnPoints.map((spawn) => ({ ...spawn })),
  }
}

function isStoredDraft(value: unknown): value is EditorDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<EditorDraft>
  return (
    draft.version === 1 &&
    (draft.mode === '1v1' || draft.mode === '2v2' || draft.mode === '3v3') &&
    Number.isSafeInteger(draft.width) &&
    Number.isSafeInteger(draft.height) &&
    draft.cells instanceof Uint8Array &&
    Array.isArray(draft.spawns)
  )
}

function floodFill(
  cells: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  material: TerrainMaterialId,
): void {
  const target = cells[startY * width + startX]
  if (target === material) return
  const queue = [startY * width + startX]
  cells[startY * width + startX] = material
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor]
    const x = index % width
    const y = Math.floor(index / width)
    for (const neighbor of [
      x > 0 ? index - 1 : -1,
      x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y + 1 < height ? index + width : -1,
    ]) {
      if (neighbor < 0 || cells[neighbor] !== target) continue
      cells[neighbor] = material
      queue.push(neighbor)
    }
  }
}

export function MapEditor({ onBack, onTestPlay }: MapEditorProps) {
  const [draft, setDraft] = useState<EditorDraft>(() => createDraft())
  const [tool, setTool] = useState<EditorTool>('brush')
  const [material, setMaterial] = useState<TerrainMaterialId>(TERRAIN_MATERIAL.soil)
  const [brushRadius, setBrushRadius] = useState(6)
  const [selectedSpawn, setSelectedSpawn] = useState(0)
  const [zoom, setZoom] = useState(0.75)
  const [notice, setNotice] = useState('Drafts stay on this device until exported.')
  const [historyRevision, setHistoryRevision] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draftRef = useRef(draft)
  const undoRef = useRef<EditorDraft[]>([])
  const redoRef = useRef<EditorDraft[]>([])
  const gestureRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    lastX: number
    lastY: number
  } | null>(null)
  const deferredDraft = useDeferredValue(draft)

  draftRef.current = draft

  let validationError: string | null = null
  let validDocument: MapDocument | null = null
  try {
    validDocument = buildDocument(deferredDraft)
    resolveMapDocument(validDocument)
  } catch (caught) {
    validationError = caught instanceof Error ? caught.message : 'Map validation failed.'
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const cellWidth = draft.width / draft.cellSize
    const cellHeight = draft.height / draft.cellSize
    canvas.width = cellWidth
    canvas.height = cellHeight
    const image = context.createImageData(cellWidth, cellHeight)
    const colors: Record<number, [number, number, number]> = {
      [TERRAIN_MATERIAL.empty]: colorChannels(draft.theme.sky),
      [TERRAIN_MATERIAL.soil]: colorChannels(draft.theme.terrain),
      [TERRAIN_MATERIAL.brick]: colorChannels(draft.theme.brick),
      [TERRAIN_MATERIAL.stone]: colorChannels(draft.theme.stone),
      [TERRAIN_MATERIAL.steel]: colorChannels(draft.theme.steel),
    }
    for (let index = 0; index < draft.cells.length; index += 1) {
      const [red, green, blue] = colors[draft.cells[index]] ?? colors[0]
      image.data[index * 4] = red
      image.data[index * 4 + 1] = green
      image.data[index * 4 + 2] = blue
      image.data[index * 4 + 3] = 255
    }
    context.putImageData(image, 0, 0)
    draft.spawns.forEach((spawn, index) => {
      const x = spawn.x / draft.cellSize
      const y = spawn.y / draft.cellSize
      context.fillStyle = spawn.teamId === 0 ? '#62b4ff' : '#ff7896'
      context.strokeStyle = '#fff4d8'
      context.lineWidth = 2
      context.beginPath()
      context.arc(x, y - 7, index === selectedSpawn ? 7 : 5, 0, Math.PI * 2)
      context.fill()
      context.stroke()
      context.fillStyle = '#24313a'
      context.font = 'bold 8px sans-serif'
      context.textAlign = 'center'
      context.fillText(String(spawn.teamSlot + 1), x, y - 4)
    })
  }, [draft, selectedSpawn])

  const setCurrentDraft = (next: EditorDraft) => {
    draftRef.current = next
    setDraft(next)
  }

  const pushHistory = () => {
    undoRef.current.push(cloneDraft(draftRef.current))
    if (undoRef.current.length > 30) undoRef.current.shift()
    redoRef.current = []
    setHistoryRevision((value) => value + 1)
  }

  const mutateDraft = (mutate: (next: EditorDraft) => void) => {
    const next = cloneDraft(draftRef.current)
    mutate(next)
    setCurrentDraft(next)
  }

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const bounds = canvas.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(canvas.width - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * canvas.width))),
      y: Math.max(0, Math.min(canvas.height - 1, Math.floor(((event.clientY - bounds.top) / bounds.height) * canvas.height))),
    }
  }

  const paintCircle = (next: EditorDraft, x: number, y: number) => {
    const width = next.width / next.cellSize
    const height = next.height / next.cellSize
    for (let offsetY = -brushRadius; offsetY <= brushRadius; offsetY += 1)
      for (let offsetX = -brushRadius; offsetX <= brushRadius; offsetX += 1) {
        if (offsetX * offsetX + offsetY * offsetY > brushRadius * brushRadius) continue
        const cellX = x + offsetX
        const cellY = y + offsetY
        if (cellX >= 0 && cellX < width && cellY >= 0 && cellY < height)
          next.cells[cellY * width + cellX] = material
      }
  }

  const paintLine = (next: EditorDraft, fromX: number, fromY: number, toX: number, toY: number) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toY - fromY)))
    for (let step = 0; step <= steps; step += 1)
      paintCircle(
        next,
        Math.round(fromX + ((toX - fromX) * step) / steps),
        Math.round(fromY + ((toY - fromY) * step) / steps),
      )
  }

  const placeSpawn = (cellX: number, cellY: number) => {
    mutateDraft((next) => {
      const width = next.width / next.cellSize
      const height = next.height / next.cellSize
      let supportY = cellY
      while (
        supportY < height &&
        next.cells[supportY * width + cellX] === TERRAIN_MATERIAL.empty
      )
        supportY += 1
      if (supportY >= height) supportY = cellY
      next.spawns[selectedSpawn] = {
        ...next.spawns[selectedSpawn],
        x: cellX * next.cellSize,
        y: supportY * next.cellSize,
      }
    })
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    pushHistory()
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
    }
    if (tool === 'spawn') placeSpawn(point.x, point.y)
    else if (tool === 'fill')
      mutateDraft((next) =>
        floodFill(
          next.cells,
          next.width / next.cellSize,
          next.height / next.cellSize,
          point.x,
          point.y,
          material,
        ),
      )
    else if (tool === 'brush') mutateDraft((next) => paintCircle(next, point.x, point.y))
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId || tool !== 'brush') return
    const point = pointFromEvent(event)
    mutateDraft((next) => paintLine(next, gesture.lastX, gesture.lastY, point.x, point.y))
    gesture.lastX = point.x
    gesture.lastY = point.y
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const point = pointFromEvent(event)
    if (tool === 'rectangle')
      mutateDraft((next) => {
        const width = next.width / next.cellSize
        const left = Math.min(gesture.startX, point.x)
        const right = Math.max(gesture.startX, point.x)
        const top = Math.min(gesture.startY, point.y)
        const bottom = Math.max(gesture.startY, point.y)
        for (let y = top; y <= bottom; y += 1)
          next.cells.fill(material, y * width + left, y * width + right + 1)
      })
    else if (tool === 'line')
      mutateDraft((next) =>
        paintLine(next, gesture.startX, gesture.startY, point.x, point.y),
      )
    gestureRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const undo = () => {
    const previous = undoRef.current.pop()
    if (!previous) return
    redoRef.current.push(cloneDraft(draftRef.current))
    setCurrentDraft(previous)
    setHistoryRevision((value) => value + 1)
  }

  const redo = () => {
    const next = redoRef.current.pop()
    if (!next) return
    undoRef.current.push(cloneDraft(draftRef.current))
    setCurrentDraft(next)
    setHistoryRevision((value) => value + 1)
  }

  const replaceDraft = (next: EditorDraft, message: string) => {
    undoRef.current = []
    redoRef.current = []
    setHistoryRevision((value) => value + 1)
    setSelectedSpawn(0)
    setCurrentDraft(next)
    setNotice(message)
  }

  const changeMode = (mode: SupportedMode) => {
    if (mode === draft.mode) return
    pushHistory()
    mutateDraft((next) => {
      next.mode = mode
      const width = next.width / next.cellSize
      const height = next.height / next.cellSize
      next.spawns = defaultSpawns(next.width, mode, (worldX) => {
        const cellX = Math.floor(worldX / next.cellSize)
        let cellY = 0
        while (
          cellY < height &&
          next.cells[cellY * width + cellX] === TERRAIN_MATERIAL.empty
        )
          cellY += 1
        return cellY * next.cellSize
      })
    })
    setSelectedSpawn(0)
  }

  const changeSize = (value: string) => {
    const preset = SIZE_PRESETS.find((candidate) => `${candidate.width}x${candidate.height}` === value)
    if (preset) replaceDraft(createDraft(preset.width, preset.height, draft.mode), 'New blank map created.')
  }

  const importMap = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const document = JSON.parse(await file.text()) as MapDocument
      replaceDraft(draftFromDocument(document), `Imported ${file.name}.`)
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Unable to import map.')
    }
  }

  const currentDocument = (): MapDocument | null => {
    try {
      const document = buildDocument(draftRef.current)
      resolveMapDocument(document)
      return document
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Map validation failed.')
      return null
    }
  }

  const exportMap = () => {
    const validDocument = currentDocument()
    if (!validDocument) return
    const blob = new Blob([`${JSON.stringify(validDocument)}\n`], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${validDocument.id}.map.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice(`Exported ${anchor.download}.`)
  }

  const saveDraft = async () => {
    try {
      await saveEditorDraft(cloneDraft(draftRef.current))
      setNotice('Draft saved to this browser.')
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Unable to save draft.')
    }
  }

  const loadDraft = async () => {
    try {
      const stored = await loadEditorDraft<unknown>()
      if (!isStoredDraft(stored)) throw new Error('No compatible editor draft was found.')
      replaceDraft(cloneDraft(stored), 'Draft restored from this browser.')
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Unable to load draft.')
    }
  }

  const filledCells = deferredDraft.cells.reduce(
    (total, value) => total + Number(value !== TERRAIN_MATERIAL.empty),
    0,
  )

  return (
    <section className="map-editor-shell">
      <header className="editor-heading">
        <div>
          <p className="eyebrow">MAP WORKSHOP</p>
          <h2>Build the battlefield</h2>
          <p>Paint collision materials, place team spawns, validate, then test the real simulation.</p>
        </div>
        <div className="actions editor-heading-actions">
          <button className="secondary" onClick={onBack}>Back</button>
          <button
            disabled={!validDocument}
            onClick={() => {
              const document = currentDocument()
              if (document) onTestPlay(document)
            }}
          >
            Test Play
          </button>
        </div>
      </header>

      <div className="editor-layout">
        <aside className="editor-sidebar">
          <div className="editor-field-grid">
            <label>
              Map name
              <input
                value={draft.displayName}
                maxLength={48}
                onChange={(event) => mutateDraft((next) => { next.displayName = event.target.value })}
              />
            </label>
            <label>
              File ID
              <input
                value={draft.id}
                maxLength={64}
                onChange={(event) => mutateDraft((next) => { next.id = event.target.value })}
              />
            </label>
            <label>
              Card label
              <input
                value={draft.label}
                maxLength={48}
                onChange={(event) => mutateDraft((next) => { next.label = event.target.value })}
              />
            </label>
            <label className="editor-description-field">
              Description
              <textarea
                value={draft.description}
                maxLength={180}
                rows={3}
                onChange={(event) => mutateDraft((next) => { next.description = event.target.value })}
              />
            </label>
          </div>

          <div className="editor-section">
            <span className="editor-label">Mode</span>
            <div className="editor-segmented">
              {(['1v1', '2v2', '3v3'] as const).map((mode) => (
                <button key={mode} className={draft.mode === mode ? 'selected' : ''} onClick={() => changeMode(mode)}>
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <label className="editor-section">
            <span className="editor-label">World size</span>
            <select value={`${draft.width}x${draft.height}`} onChange={(event) => changeSize(event.target.value)}>
              {SIZE_PRESETS.map((preset) => (
                <option key={preset.label} value={`${preset.width}x${preset.height}`}>{preset.label}</option>
              ))}
            </select>
          </label>

          <details className="editor-section editor-theme">
            <summary>Visual theme</summary>
            <div className="editor-theme-grid">
              {THEME_FIELDS.map((field) => (
                <label key={field.key}>
                  <input
                    type="color"
                    value={colorToCss(draft.theme[field.key])}
                    onChange={(event) =>
                      mutateDraft((next) => {
                        next.theme[field.key] = Number.parseInt(event.target.value.slice(1), 16)
                      })
                    }
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </details>

          <div className="editor-section">
            <span className="editor-label">Tool</span>
            <div className="editor-tool-grid">
              {([
                ['brush', 'Brush'],
                ['line', 'Line'],
                ['rectangle', 'Rectangle'],
                ['fill', 'Fill'],
                ['spawn', 'Spawn'],
              ] as const).map(([id, name]) => (
                <button key={id} className={tool === id ? 'selected' : ''} onClick={() => setTool(id)}>{name}</button>
              ))}
            </div>
          </div>

          {tool !== 'spawn' ? (
            <div className="editor-section">
              <span className="editor-label">Material</span>
              <div className="material-palette">
                {MATERIALS.map((entry) => (
                  <button
                    key={entry.id}
                    className={material === entry.id ? 'selected' : ''}
                    onClick={() => setMaterial(entry.id)}
                    title={entry.name}
                  >
                    <span style={{ background: materialColor(draft.theme, entry.id) }} />
                    {entry.name}
                  </button>
                ))}
              </div>
              {(tool === 'brush' || tool === 'line') && (
                <label className="brush-size">
                  {tool === 'line' ? 'Line width' : 'Brush size'}{' '}
                  <strong>{brushRadius * 2 + 1}</strong>
                  <input type="range" min="1" max="16" value={brushRadius} onChange={(event) => setBrushRadius(Number(event.target.value))} />
                </label>
              )}
            </div>
          ) : (
            <label className="editor-section">
              <span className="editor-label">Spawn to place</span>
              <select value={selectedSpawn} onChange={(event) => setSelectedSpawn(Number(event.target.value))}>
                {draft.spawns.map((spawn, index) => (
                  <option key={index} value={index}>Team {spawn.teamId === 0 ? 'Comet' : 'Ember'} · Player {spawn.teamSlot + 1}</option>
                ))}
              </select>
            </label>
          )}

          <div className="editor-section editor-history">
            <button disabled={undoRef.current.length === 0} onClick={undo}>Undo</button>
            <button disabled={redoRef.current.length === 0} onClick={redo}>Redo</button>
            <span className="history-marker" aria-hidden="true">{historyRevision}</span>
          </div>

          <label className="editor-section">
            <span className="editor-label">Canvas zoom</span>
            <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
              <option value={0.5}>50%</option>
              <option value={0.75}>75%</option>
              <option value={1}>100%</option>
              <option value={1.5}>150%</option>
            </select>
          </label>
        </aside>

        <div className="editor-workbench">
          <div className="editor-status-strip">
            <span>{draft.width} × {draft.height}</span>
            <span>{filledCells.toLocaleString()} solid cells</span>
            <span>{draft.spawns.length} spawns</span>
            <strong className={validationError ? 'invalid' : 'valid'}>{validationError ? 'Needs attention' : 'Ready to test'}</strong>
          </div>
          <div className="editor-canvas-scroll">
            <canvas
              ref={canvasRef}
              className="editor-canvas"
              style={{ width: draft.width * zoom, height: draft.height * zoom }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              aria-label="Map material canvas"
            />
          </div>
          <div className={`editor-validation ${validationError ? 'invalid' : 'valid'}`}>
            <strong>{validationError ? 'Validation' : 'Map ready'}</strong>
            <span>{validationError ?? 'All spawn, dimension, material, and format checks passed.'}</span>
          </div>
          <div className="editor-file-actions">
            <button onClick={() => replaceDraft(createDraft(draft.width, draft.height, draft.mode), 'New blank map created.')}>New</button>
            <button onClick={() => void saveDraft()}>Save Draft</button>
            <button onClick={() => void loadDraft()}>Load Draft</button>
            <label className="file-button">
              Import
              <input type="file" accept=".json,.map.json,application/json" onChange={(event) => void importMap(event)} />
            </label>
            <button disabled={!validDocument} onClick={exportMap}>Export</button>
          </div>
          <p className="editor-notice" role="status">{notice}</p>
        </div>
      </div>
    </section>
  )
}
