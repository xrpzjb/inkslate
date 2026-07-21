import React, { useMemo } from 'react'
import * as ionicons from 'ionicons/icons'

interface IonIconProps {
  name: string
  size?: number
  className?: string
  color?: string
  style?: React.CSSProperties
}

function toCamelCase(name: string): string {
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

export function IonIcon({ name, size = 24, className, color, style }: IonIconProps) {
  const svgHtml = useMemo(() => {
    const key = toCamelCase(name)
    const svgDataUri = (ionicons as Record<string, string>)[key]
    if (!svgDataUri || typeof svgDataUri !== 'string') return null
    const match = svgDataUri.match(/<svg[^>]*>([\s\S]*)<\/svg>/)
    return match ? match[1] : null
  }, [name])

  if (!svgHtml) return null

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      style={{ display: 'inline-flex', verticalAlign: 'middle', color: color || 'currentColor', ...style }}
      fill="currentColor"
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  )
}
