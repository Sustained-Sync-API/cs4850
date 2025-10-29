import { useEffect, useState } from 'react'
import brandLogo from './assets/brand-logo.svg'
import Dashboard from './pages/Dashboard.jsx'
import DataEntry from './pages/DataEntry.jsx'
import Sustainability from './pages/Sustainability.jsx'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
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
  const normalizedRoute = route === 'sustainability' ? 'sustainability' : (route === 'data-entry' ? 'data-entry' : DEFAULT_ROUTE)
  
  // Shared state across pages
  const [sharedData, setSharedData] = useState({
    forecastData: null,
    recommendations: '',
    recommendationSources: null,
    recommendationWarning: '',
    goals: [],
    loading: {
      forecast: true,
      recommendations: true,
      goals: true
    }
  })

  // Fetch forecast data
  const fetchForecast = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/forecast/?periods=12`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load forecast')
      setSharedData(prev => ({ ...prev, forecastData: data, loading: { ...prev.loading, forecast: false } }))
    } catch (error) {
      setSharedData(prev => ({ ...prev, forecastData: { error: error.message }, loading: { ...prev.loading, forecast: false } }))
    }
  }

  // Fetch recommendations
  const fetchRecommendations = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/recommendations/`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || data.warning || 'Unable to load recommendations')
      setSharedData(prev => ({
        ...prev,
        recommendations: data.recommendations || '',
        recommendationSources: data.sources || null,
        recommendationWarning: data.warning || '',
        loading: { ...prev.loading, recommendations: false }
      }))
    } catch (error) {
      setSharedData(prev => ({
        ...prev,
        recommendations: '',
        recommendationSources: null,
        recommendationWarning: error.message,
        loading: { ...prev.loading, recommendations: false }
      }))
    }
  }

  // Fetch goals
  const fetchGoals = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/goals/`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load goals')
      setSharedData(prev => ({ ...prev, goals: data.goals || [], loading: { ...prev.loading, goals: false } }))
    } catch (error) {
      setSharedData(prev => ({ ...prev, goals: [], loading: { ...prev.loading, goals: false } }))
    }
  }

  // Load shared data once on mount
  useEffect(() => {
    fetchForecast()
    fetchRecommendations()
    fetchGoals()
  }, [])

  // Refresh recommendations when goals change
  const handleGoalsChange = () => {
    fetchGoals()
    fetchRecommendations()
  }

  const handleNavigate = (target) => (event) => {
    event.preventDefault()
    navigate(target)
  }

  return (
    <div className="app-shell">
      <nav className="side-nav">
        <div className="brand">
          <img src={brandLogo} alt="SustainSync logo" />
        </div>
        <div className="nav-links">
          <a
            href="#dashboard"
            onClick={handleNavigate('dashboard')}
            className={`nav-link${normalizedRoute === 'dashboard' ? ' nav-link--active' : ''}`}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-label">Dashboard</span>
          </a>
          <a
            href="#sustainability"
            onClick={handleNavigate('sustainability')}
            className={`nav-link${normalizedRoute === 'sustainability' ? ' nav-link--active' : ''}`}
          >
            <span className="nav-icon">🌱</span>
            <span className="nav-label">Sustainability</span>
          </a>
        </div>
      </nav>

      <main className="app-content">
        {normalizedRoute === 'sustainability' ? (
          <Sustainability 
            goals={sharedData.goals}
            recommendations={sharedData.recommendations}
            recommendationSources={sharedData.recommendationSources}
            recommendationWarning={sharedData.recommendationWarning}
            loading={sharedData.loading}
            onGoalsChange={handleGoalsChange}
          />
        ) : normalizedRoute === 'data-entry' ? (
          <DataEntry />
        ) : (
          <Dashboard 
            forecastData={sharedData.forecastData}
            recommendations={sharedData.recommendations}
            recommendationSources={sharedData.recommendationSources}
            recommendationWarning={sharedData.recommendationWarning}
            loading={sharedData.loading}
            onDataRefresh={() => {
              fetchForecast()
              fetchRecommendations()
            }}
          />
        )}
      </main>
    </div>
  )
}

export default App
