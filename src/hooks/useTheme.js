import { useState, useEffect } from 'react'

function getInitialTheme() {
  try {
    const saved = localStorage.getItem('tg_theme')
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('tg_theme', theme)
  }, [theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    function handleChange(e) {
      if (!localStorage.getItem('tg_theme')) setTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [])

  function toggle() {
    document.documentElement.classList.add('theme-transitioning')
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 350)
  }

  return { theme, toggle, isDark: theme === 'dark' }
}
