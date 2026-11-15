import { useEffect, useState } from 'react'
import { isNil } from 'es-toolkit'

// True for `ms` after each new non-null `value`. A new value shows at once, and restarts the time.
export const useShownFor = <T,>(value: T | null, ms: number): boolean => {
  const [expired, setExpired] = useState<T | null>(null)

  useEffect(() => {
    if (isNil(value)) return
    const timer = setTimeout(() => setExpired(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])

  return !isNil(value) && value !== expired
}
