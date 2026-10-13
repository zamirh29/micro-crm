"use client"

import { useEffect, useRef } from "react"
import type { TextareaHTMLAttributes } from "react"

type AutoResizeTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export default function AutoResizeTextarea({
  className,
  value,
  ...props
}: AutoResizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      className={`resize-none overflow-hidden ${className ?? ""}`}
      {...props}
    />
  )
}
