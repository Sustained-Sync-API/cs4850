import { useEffect, useState } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import { CssBaseline, Drawer, Box, List, ListItem, ListItemButton, ListItemText, Typography } from '@mui/material'
import { theme } from './theme'
import brandLogo from './assets/brand-logo.svg'
import Dashboard from './pages/Dashboard.jsx'
import Tables from './pages/Tables.jsx'
import Sustainability from './pages/Sustainability.jsx'

const DEFAULT_ROUTE = 'dashboard'
const DRAWER_WIDTH = 240

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

function App() {
  const [route, navigate] = useHashRoute(DEFAULT_ROUTE)

  const renderPage = () => {
    switch (route) {
      case 'tables':
        return <Tables />
      case 'sustainability':
        return <Sustainability />
      case 'dashboard':
      default:
        return <Dashboard />
    }
  }

  const menuItems = [
    { label: 'Dashboard', value: 'dashboard' },
    { label: 'Sustainability Goals', value: 'sustainability' },
    { label: 'Tables', value: 'tables' },
  ]

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        {/* Left Sidebar */}
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              bgcolor: '#0e3321',
              borderRight: '1px solid rgba(177, 208, 130, 0.2)',
            },
          }}
        >
          {/* Logo Section */}
          <Box sx={{ p: 3, borderBottom: '1px solid rgba(177, 208, 130, 0.2)' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <img src={brandLogo} alt="SustainSync logo" style={{ width: '100%', height: 'auto', maxWidth: '180px' }} />
            </Box>
          </Box>

          {/* Navigation Menu */}
          <List sx={{ pt: 2 }}>
            {menuItems.map((item) => (
              <ListItem key={item.value} disablePadding>
                <ListItemButton
                  selected={route === item.value}
                  onClick={() => navigate(item.value)}
                  sx={{
                    mx: 1,
                    mb: 0.5,
                    borderRadius: 1,
                    color: 'rgba(255, 255, 255, 0.7)',
                    '&.Mui-selected': {
                      bgcolor: 'rgba(140, 195, 66, 0.24)',
                      color: '#8cc342',
                      '&:hover': {
                        bgcolor: 'rgba(140, 195, 66, 0.35)',
                      },
                    },
                    '&:hover': {
                      bgcolor: 'rgba(177, 208, 130, 0.12)',
                      color: 'white',
                    },
                  }}
                >
                  <ListItemText 
                    primary={item.label} 
                    primaryTypographyProps={{ 
                      fontWeight: route === item.value ? 600 : 400 
                    }} 
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Drawer>

        {/* Main Content Area */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            bgcolor: 'background.default',
            p: 4,
            minHeight: '100vh',
          }}
        >
          {renderPage()}
        </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App
