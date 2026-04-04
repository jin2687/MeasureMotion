type Tab = 'measure' | 'history'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

export default function Navigation({ active, onChange }: Props) {
  return (
    <nav className="shrink-0 flex border-t border-slate-800 bg-slate-900/95 backdrop-blur safe-bottom">
      <NavButton
        icon={
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
            <path strokeLinecap="round" strokeWidth={1.5} d="M12 8v4l3 3" />
          </svg>
        }
        label="計測"
        active={active === 'measure'}
        onClick={() => onChange('measure')}
      />
      <NavButton
        icon={
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        }
        label="履歴"
        active={active === 'history'}
        onClick={() => onChange('history')}
      />
    </nav>
  )
}

function NavButton({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors ${
        active ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}
