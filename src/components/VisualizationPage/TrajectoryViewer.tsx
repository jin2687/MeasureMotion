import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Line, Grid } from '@react-three/drei'
import * as THREE from 'three'
import type { ProcessedSample } from '../../types/sensors'

interface Props {
  samples: ProcessedSample[]
}

/** Colour each point by G-force magnitude: green → yellow → red. */
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

function TrajectoryLine({ samples }: { samples: ProcessedSample[] }) {
  const points = useMemo(
    () => samples.map(s => new THREE.Vector3(s.posEast, s.posUp, -s.posNorth)),
    [samples],
  )

  const colors = useMemo(() => {
    const arr: THREE.Color[] = []
    for (const s of samples) arr.push(gColor(s.gTotal))
    return arr
  }, [samples])

  if (points.length < 2) return null

  return (
    <Line
      points={points}
      vertexColors={colors}
      lineWidth={2}
    />
  )
}

/** Auto-rotate camera when idle. */
function AutoRotate() {
  const ref = useRef({ active: true })
  useFrame((state) => {
    if (ref.current.active) {
      state.camera.position.applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        0.002,
      )
      state.camera.lookAt(0, 0, 0)
    }
  })
  return null
}

export default function TrajectoryViewer({ samples }: Props) {
  if (samples.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center text-slate-500 text-sm">
        軌跡データがありません
      </div>
    )
  }

  // Compute bounding box to set camera distance
  const xs = samples.map(s => s.posEast)
  const ys = samples.map(s => s.posUp)
  const zs = samples.map(s => s.posNorth)
  const span = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    Math.max(...zs) - Math.min(...zs),
    1,
  )
  const camDist = span * 1.5 + 10

  return (
    <div className="w-full rounded-2xl overflow-hidden bg-slate-900" style={{ height: 320 }}>
      <Canvas
        camera={{ position: [camDist, camDist * 0.5, camDist], fov: 50 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#0f172a']} />
        <ambientLight intensity={0.5} />

        <TrajectoryLine samples={samples} />

        {/* Origin marker */}
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[span * 0.01 + 0.3, 8, 8]} />
          <meshBasicMaterial color="#60a5fa" />
        </mesh>

        <Grid
          args={[span * 2, span * 2]}
          position={[0, Math.min(...ys) - 0.5, 0]}
          cellColor="#1e293b"
          sectionColor="#334155"
        />

        <OrbitControls enablePan enableZoom enableRotate />
        <AutoRotate />
      </Canvas>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 py-2 bg-slate-900 text-xs text-slate-400">
        <LegendItem color="#22c55e" label="低G" />
        <LegendItem color="#facc15" label="中G" />
        <LegendItem color="#ef4444" label="高G (4G+)" />
        <span className="text-slate-600">ドラッグで視点移動</span>
      </div>
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
