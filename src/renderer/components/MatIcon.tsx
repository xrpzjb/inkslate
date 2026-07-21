import React from 'react'

interface MatIconProps {
  name: string
  size?: number
  filled?: boolean
  className?: string
  color?: string
  style?: React.CSSProperties
}

export function MatIcon({ name, size = 24, filled = false, className, color, style }: MatIconProps) {
  const cls = filled ? 'material-icons' : 'material-icons-outlined'
  return (
    <span
      className={`${cls}${className ? ' ' + className : ''}`}
      style={{
        fontSize: size,
        width: size,
        height: size,
        lineHeight: 1,
        color: color || 'currentColor',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {name}
    </span>
  )
}
