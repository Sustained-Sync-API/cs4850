import { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Stack,
  Chip,
  Alert,
  Paper,
  CircularProgress
} from '@mui/material'
import FlagIcon from '@mui/icons-material/Flag'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import GoalsManager from '../components/GoalsManager'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

// Simple bullet list recommendations
function BulletList({ text }) {
  if (!text) return (
    <Alert severity="info" icon={<LightbulbIcon />}>
      Insights will appear once data is available.
    </Alert>
  )

  // Split text into lines and clean them
  const lines = text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      // Remove bullet points, numbering, and other prefixes
      return line
        .replace(/^[•\-*►▸▹◦⦿⦾]\s*/, '')
        .replace(/^\d+[\.\)\:]\s*/, '')
        .replace(/^#+\s*/, '')
        .replace(/\*\*/g, '')
        .trim()
    })
    .filter(line => line.length > 10) // Filter out very short lines

  return (
    <Paper 
      elevation={0}
      sx={{ 
        p: 3, 
        backgroundColor: 'rgba(37, 99, 235, 0.04)',
        borderRadius: 2
      }}
    >
      <Stack spacing={2}>
        {lines.map((line, idx) => (
          <Box key={idx} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <Box 
              sx={{ 
                width: 6, 
                height: 6, 
                borderRadius: '50%', 
                backgroundColor: 'primary.main',
                mt: 1,
                flexShrink: 0
              }} 
            />
            <Typography variant="body1" sx={{ lineHeight: 1.7 }}>
              {line}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Paper>
  )
}

function Sustainability({ goals = [], forecastData = null, recommendations = '', recommendationSources = null, recommendationWarning = '', loading = {}, onGoalsChange }) {
  const [showGoalsManager, setShowGoalsManager] = useState(false)

  // Normalize goals array from props
  const normalizedGoals = Array.isArray(goals) ? goals : []
  
  // Extract goal-focused recommendations from forecast data
  const goalRecommendations = forecastData?.summaries?.total || ''

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" sx={{ mb: 1 }}>
          Sustainability Goals & AI Recommendations
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Set custom goals and receive AI-powered sustainability guidance based on your energy data.
        </Typography>
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <FlagIcon color="primary" />
                <Typography variant="h5">
                  Your Sustainability Goals
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {normalizedGoals.length > 0 
                  ? `You have ${normalizedGoals.length} active goal${normalizedGoals.length !== 1 ? 's' : ''} tracking your sustainability progress.`
                  : 'Set up to 5 custom sustainability goals to guide your AI recommendations.'}
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={normalizedGoals.length > 0 ? <EditIcon /> : <AddIcon />}
              onClick={() => setShowGoalsManager(true)}
            >
              {normalizedGoals.length > 0 ? 'Manage Goals' : 'Set Your First Goal'}
            </Button>
          </Box>
          
          {loading.goals ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : normalizedGoals.length > 0 ? (
            <Grid container spacing={2}>
              {normalizedGoals.map((goal) => (
                <Grid item xs={12} md={6} key={goal.id}>
                  <Paper 
                    elevation={0}
                    sx={{ 
                      p: 2.5, 
                      border: '2px solid',
                      borderColor: 'primary.light',
                      borderRadius: 2,
                      height: '100%',
                      transition: 'all 0.2s',
                      '&:hover': {
                        borderColor: 'primary.main',
                        transform: 'translateY(-2px)'
                      }
                    }}
                  >
                    <Typography variant="h6" sx={{ mb: 1 }}>
                      {goal.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {goal.description}
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      {goal.target_date && (
                        <Chip
                          icon={<CalendarTodayIcon />}
                          label={new Date(goal.target_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      )}
                      <Chip 
                        label={`Created ${new Date(goal.created_at).toLocaleDateString()}`}
                        size="small"
                        variant="outlined"
                      />
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          ) : (
            <Paper 
              elevation={0}
              sx={{ 
                p: 4, 
                textAlign: 'center',
                backgroundColor: 'rgba(37, 99, 235, 0.04)',
                borderRadius: 2
              }}
            >
              <FlagIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" sx={{ mb: 1 }}>
                No Goals Set Yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Create your first sustainability goal to get personalized AI recommendations aligned with your objectives.
              </Typography>
              <Button 
                variant="contained" 
                startIcon={<AddIcon />}
                onClick={() => setShowGoalsManager(true)}
              >
                Create Your First Goal
              </Button>
            </Paper>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <LightbulbIcon sx={{ color: 'warning.main' }} />
              <Typography variant="h5">
                AI Sustainability Recommendations
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Goal-focused recommendations generated from your utility data and sustainability objectives.
            </Typography>
          </Box>
          
          {forecastData?.error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {forecastData.error}
            </Alert>
          )}
          
          {loading.forecast ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <BulletList text={goalRecommendations} />
          )}
        </CardContent>
      </Card>

      {showGoalsManager && (
        <GoalsManager onClose={() => {
          setShowGoalsManager(false)
          if (onGoalsChange) onGoalsChange()
        }} />
      )}
    </Box>
  )
}

export default Sustainability
