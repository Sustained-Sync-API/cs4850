import { useEffect, useState } from 'react'
import brandLogo from './assets/brand-logo.png'
import Dashboard from './pages/Dashboard.jsx'
import DataEntry from './pages/DataEntry.jsx'
import './App.css'

const DEFAULT_ROUTE = 'dashboard'

const getRouteFromHash = (fallback) => {
  if (typeof window === 'undefined') return fallback
  const hash = window.location.hash.replace('#', '').trim()
  return hash || fallback
}

const useHashRoute = (defaultRoute) => {
  const [route, setRoute] = useState(() => getRouteFromHash(defaultRoute))

  useEffect(() => {
    const syncRoute = () => setRoute(getRouteFromHash(defaultRoute))
    syncRoute()
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [defaultRoute])

  const navigate = (nextRoute) => {
    if (typeof window !== 'undefined') {
      window.location.hash = nextRoute
    }
  }

  return [route, navigate]
}

// Layout shell with persistent brand navigation and routed pages.
function App() {
  const [route, navigate] = useHashRoute(DEFAULT_ROUTE)
  const normalizedRoute = route === 'data-entry' ? 'data-entry' : DEFAULT_ROUTE
  const handleNavigate = (target) => (event) => {
    event.preventDefault()
    navigate(target)
  }

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <div className="brand">
          <img src={brandLogo} alt="SustainSync logo" />
          <div className="brand-copy">
            <span className="brand-name">SustainSync</span>
            <span className="brand-tagline">Smarter resource stewardship</span>
          </div>
        </div>
        <div className="nav-links">
          <a
            href="#dashboard"
            onClick={handleNavigate('dashboard')}
            className={`nav-link${normalizedRoute === 'dashboard' ? ' nav-link--active' : ''}`}
          >
            Dashboard
          </a>
          <a
            href="#data-entry"
            onClick={handleNavigate('data-entry')}
            className={`nav-link${normalizedRoute === 'data-entry' ? ' nav-link--active' : ''}`}
          >
            Data Entry
          </a>
        </div>
      </nav>

      <main className="app-content">
        {normalizedRoute === 'data-entry' ? <DataEntry /> : <Dashboard />}
      </main>
    </div>
  )
}

export default App
