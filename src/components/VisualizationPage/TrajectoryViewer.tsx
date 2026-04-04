import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Line, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { ProcessedSample } from '../../types/sensors'

interface Props {
  samples: ProcessedSample[]
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

/** Map G-force to colour: green → yellow → red */
function gColor(g: number): THREE.Color {
  const t = Math.min(g / 4, 1)
  if (t < 0.5) {
    return new THREE.Color().lerpColors(
      new THREE.Color(0x22c55e),
      new THREE.Color(0xfacc15),
      t * 2,
    )
  }
  return new THREE.Color().lerpColors(
    new THREE.Color(0xfacc15),
    new THREE.Color(0xef4444),
    (t - 0.5) * 2,
  )
}

// ─── Trajectory line ──────────────────────────────────────────────────────────

function TrajectoryLine({ samples }: { samples: ProcessedSample[] }) {
  const points = useMemo(
    () => samples.map(s => new THREE.Vector3(s.posEast, s.posUp, -s.posNorth)),
    [samples],
  )
  const colors = useMemo(
    () => samples.map(s => gColor(s.gTotal)),
    [samples],
  )
  if (points.length < 2) return null
  return <Line points={points} vertexColors={colors} lineWidth={2.5} />
}

// ─── Direction arrows (every ~5 seconds of data) ──────────────────────────────

function DirectionArrows({ samples }: { samples: ProcessedSample[] }) {
  const arrows = useMemo(() => {
    if (samples.length < 2) return []

    // Sample every ~5 s of data
    const interval = Math.max(1, Math.round(5 / ((samples.at(-1)!.t) / samples.length)))
    const result: { pos: THREE.Vector3; dir: THREE.Vector3; g: number }[] = []

    for (let i = interval; i < samples.length - interval; i += interval) {
      const s = samples[i]
      // Direction of travel in ENU → Three.js (X=East, Y=Up, Z=-North)
      const dx =  Math.sin((s.heading * Math.PI) / 180)
      const dz = -Math.cos((s.heading * Math.PI) / 180)
      const dir = new THREE.Vector3(dx, 0, dz).normalize()
      if (dir.lengthSq() < 0.01) continue
      result.push({
        pos: new THREE.Vector3(s.posEast, s.posUp, -s.posNorth),
        dir,
        g: s.gTotal,
      })
    }
    return result
  }, [samples])

  return (
    <>
      {arrows.map((a, i) => (
        <ArrowCone key={i} position={a.pos} direction={a.dir} color={gColor(a.g)} />
      ))}
    </>
  )
}

function ArrowCone({
  position, direction, color,
}: {
  position: THREE.Vector3
  direction: THREE.Vector3
  color: THREE.Color
}) {
  const quaternion = useMemo(() => {
    // Cone default points in +Y; rotate so it points along direction
    const up = new THREE.Vector3(0, 1, 0)
    const q = new THREE.Quaternion().setFromUnitVectors(up, direction)
    return q
  }, [direction])

  return (
    <mesh position={position} quaternion={quaternion}>
      <coneGeometry args={[0.4, 1.2, 6]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

// ─── Start / Goal markers ─────────────────────────────────────────────────────

function StartMarker({ position, span }: { position: THREE.Vector3; span: number }) {
  const poleH = Math.max(span * 0.08, 2)
  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, poleH / 2, 0]}>
        <cylinderGeometry args={[0.12, 0.12, poleH, 8]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      {/* Ball */}
      <mesh position={[0, poleH, 0]}>
        <sphereGeometry args={[0.5, 12, 12]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      {/* HTML label */}
      <Html position={[0, poleH + 1.2, 0]} center distanceFactor={20}>
        <div
          style={{
            background: '#15803d',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          START
        </div>
      </Html>
    </group>
  )
}

function GoalMarker({ position, span }: { position: THREE.Vector3; span: number }) {
  const poleH = Math.max(span * 0.08, 2)
  // Chequered flag colours alternating on a 2×2 grid
  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, poleH / 2, 0]}>
        <cylinderGeometry args={[0.12, 0.12, poleH, 8]} />
        <meshBasicMaterial color="#f87171" />
      </mesh>
      {/* Ball */}
      <mesh position={[0, poleH, 0]}>
        <sphereGeometry args={[0.5, 12, 12]} />
        <meshBasicMaterial color="#f87171" />
      </mesh>
      {/* HTML label */}
      <Html position={[0, poleH + 1.2, 0]} center distanceFactor={20}>
        <div
          style={{
            background: '#b91c1c',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          GOAL
        </div>
      </Html>
    </group>
  )
}

// ─── Auto-rotate when no interaction ─────────────────────────────────────────

function AutoRotate() {
  const ref = useRef({ active: true })
  useFrame((state) => {
    if (ref.current.active) {
      state.camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.002)
      state.camera.lookAt(0, 0, 0)
    }
  })
  return null
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

function SceneGrid({ span, minY }: { span: number; minY: number }) {
  const size = span * 2
  const divisions = Math.min(20, Math.max(10, Math.floor(span / 5)))
  return (
    <gridHelper
      args={[size, divisions, '#1e293b', '#1e293b']}
      position={[0, minY - 0.5, 0]}
    />
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrajectoryViewer({ samples }: Props) {
  if (samples.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center text-slate-500 text-sm">
        軌跡データがありません
      </div>
    )
  }

  const xs = samples.map(s => s.posEast)
  const ys = samples.map(s => s.posUp)
  const zs = samples.map(s => s.posNorth)
  const span = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    Math.max(...zs) - Math.min(...zs),
    1,
  )
  const minY   = Math.min(...ys)
  const camDist = span * 1.5 + 10

  const startSample = samples[0]
  const goalSample  = samples[samples.length - 1]

  const startPos = new THREE.Vector3(startSample.posEast, startSample.posUp, -startSample.posNorth)
  const goalPos  = new THREE.Vector3(goalSample.posEast,  goalSample.posUp,  -goalSample.posNorth)

  // Stats for overlay
  const peakG     = Math.max(...samples.map(s => s.gTotal))
  const maxSpeed  = Math.max(...samples.map(s => s.speed))
  const duration  = goalSample.t
  const startHead = startSample.heading.toFixed(0)
  const goalHead  = goalSample.heading.toFixed(0)

  return (
    <div className="w-full rounded-2xl overflow-hidden bg-slate-900" style={{ height: 340 }}>
      <Canvas
        camera={{ position: [camDist, camDist * 0.5, camDist], fov: 50 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#0f172a']} />
        <ambientLight intensity={0.6} />

        <TrajectoryLine    samples={samples} />
        <DirectionArrows   samples={samples} />
        <StartMarker       position={startPos} span={span} />
        <GoalMarker        position={goalPos}  span={span} />
        <SceneGrid         span={span}         minY={minY} />

        <OrbitControls enablePan enableZoom enableRotate />
        <AutoRotate />
      </Canvas>

      {/* Stats overlay */}
      <div className="grid grid-cols-4 bg-slate-900 border-t border-slate-800 text-center text-xs py-2">
        <StatCell label="最大G"     value={`${peakG.toFixed(2)}G`}   color="text-yellow-400" />
        <StatCell label="最高速度"  value={`${(maxSpeed * 3.6).toFixed(1)}km/h`} color="text-blue-400" />
        <StatCell label="計測時間"  value={`${duration.toFixed(0)}s`} color="text-slate-300" />
        <StatCell label="到達方位"  value={`${goalHead}°`}           color="text-indigo-400" />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-2 bg-slate-900 text-xs text-slate-400">
        <LegendItem color="#22c55e" label="低G / START" />
        <LegendItem color="#facc15" label="中G" />
        <LegendItem color="#ef4444" label="高G / GOAL" />
        <span className="text-slate-600">▲ 方向矢印  |  ドラッグで視点移動</span>
      </div>

      {/* Heading info */}
      <div className="flex justify-around bg-slate-900 pb-2 text-xs text-slate-500">
        <span>出発方位: <span className="text-green-400 font-mono">{startHead}°</span>
          {' '}({bearingLabel(Number(startHead))})</span>
        <span>到達方位: <span className="text-red-400 font-mono">{goalHead}°</span>
          {' '}({bearingLabel(Number(goalHead))})</span>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-semibold ${color}`}>{value}</span>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-3 h-3 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </div>
  )
}

/** Convert bearing in degrees to 8-direction Japanese label */
function bearingLabel(deg: number): string {
  const dirs = ['北', '北東', '東', '南東', '南', '南西', '西', '北西']
  return dirs[Math.round(deg / 45) % 8]
}
