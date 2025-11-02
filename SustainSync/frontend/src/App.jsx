import { useEffect, useState } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import {
  CssBaseline,
  Drawer,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Stack,
} from '@mui/material'
import { theme } from './theme'
import brandLogo from './assets/brand-logo.svg'
import Dashboard from './pages/Dashboard.jsx'
import Tables from './pages/Tables.jsx'
import Sustainability from './pages/Sustainability.jsx'
import { DashboardOutlined, EmojiEventsOutlined, TableChartOutlined } from '@mui/icons-material'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
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
    { label: 'Dashboard', value: 'dashboard', icon: <DashboardOutlined /> },
    { label: 'Sustainability Goals', value: 'sustainability', icon: <EmojiEventsOutlined /> },
    { label: 'Tables', value: 'tables', icon: <TableChartOutlined /> },
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
              borderRight: 'none',
              backgroundImage: 'linear-gradient(180deg, #0b2720 0%, #041510 100%)',
              color: 'rgba(241, 245, 249, 0.95)',
              display: 'flex',
              flexDirection: 'column',
              pt: 4,
            },
          }}
        >
          {/* Logo Section */}
          <Box sx={{ px: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <img src={brandLogo} alt="SustainSync logo" style={{ width: '100%', height: 'auto', maxWidth: '180px' }} />
            </Box>
          </Box>
          <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.2)' }} />

          {/* Navigation Menu */}
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', py: 2 }}>
            <List sx={{ px: 2 }}>
              {menuItems.map((item) => (
                <ListItem key={item.value} disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    selected={route === item.value}
                    onClick={() => navigate(item.value)}
                    sx={{
                      borderRadius: 2,
                      px: 2,
                      py: 1.5,
                      color: 'rgba(226, 232, 240, 0.8)',
                      '& .MuiListItemIcon-root': {
                        color: 'inherit',
                        minWidth: 32,
                      },
                      '&.Mui-selected': {
                        bgcolor: 'rgba(140, 195, 66, 0.25)',
                        color: '#d9f99d',
                        '& .MuiListItemIcon-root': {
                          color: '#d9f99d',
                        },
                        '&:hover': {
                          bgcolor: 'rgba(140, 195, 66, 0.35)',
                        },
                      },
                      '&:hover': {
                        bgcolor: 'rgba(15, 118, 110, 0.25)',
                        color: 'rgba(224, 242, 254, 0.95)',
                      },
                    }}
                  >
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{ fontWeight: route === item.value ? 600 : 400 }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>

          <Divider sx={{ borderColor: 'rgba(148, 163, 184, 0.2)', my: 2 }} />

          <Box sx={{ px: 3, pb: 4 }}>
            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center', fontStyle: 'italic' }}>
              Smarter sustainability decisions at a glance.
            </Typography>
          </Box>
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
