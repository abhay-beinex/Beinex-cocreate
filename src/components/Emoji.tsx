import { useState } from 'react'

// Windows has no flag emoji glyphs (a flag shows up as letters like "OM"), so flags are drawn as images.
// Everything else renders as normal text emoji.
function flagCode(s: string): string | null {
  const cps = Array.from(s).map((c) => c.codePointAt(0)!)
  if (cps.length === 2 && cps.every((c) => c >= 0x1f1e6 && c <= 0x1f1ff)) return cps.map((c) => String.fromCharCode(c - 0x1f1e6 + 97)).join('')
  return null
}

export function Emoji({ children, label, size = 18 }: { children: string; label?: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const code = flagCode(children)
  if (!code || failed) return <span role="img" aria-label={label}>{children}</span>
  return (
    <img
      src={`https://flagcdn.com/w80/${code}.png`}
      alt={label ?? code.toUpperCase()}
      width={size}
      height={Math.round(size * 0.75)}
      loading="lazy"
      onError={() => setFailed(true)}
      className="inline-block rounded-[3px] object-cover align-[-2px]"
      style={{ width: size, height: Math.round(size * 0.75) }}
    />
  )
}
