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
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material'
import FlagIcon from '@mui/icons-material/Flag'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import GoalsManager from '../components/GoalsManager'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

// Group goals by analysis type and display recommendations in accordions
function RecommendationsByType({ goals = [], forecastData = null }) {
  if (!forecastData?.summaries) return (
    <Alert severity="info" icon={<LightbulbIcon />}>
      Insights will appear once data is available.
    </Alert>
  )

  // Extract the three different recommendation types from forecast data
  const goalsRecommendations = forecastData.summaries.total_goals || forecastData.summaries.total || ''
  const coBenefitRecommendations = forecastData.summaries.total_cobenefit || ''
  const environmentalRecommendations = forecastData.summaries.total_environmental || ''

  // Parse function to convert text into lines
  const parseLines = (text) => {
    if (!text) return []
    return text
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
  }

  const goalsLines = parseLines(goalsRecommendations)
  const coBenefitLines = parseLines(coBenefitRecommendations)
  const environmentalLines = parseLines(environmentalRecommendations)

  // Group goals by analysis type
  const goalsByType = {
    'goals': [],
    'co-benefit': [],
    'environmental': []
  }

  goals.forEach(goal => {
    const type = goal.analysis_type || 'goals'
    if (goalsByType[type]) {
      goalsByType[type].push(goal)
    }
  })

  // Analysis type metadata with their corresponding recommendation lines
  const analysisTypes = {
    'goals': {
      icon: '📊',
      title: 'Goals-Focused Recommendations',
      description: 'Actionable recommendations aligned with your sustainability goals',
      lines: goalsLines
    },
    'co-benefit': {
      icon: '🔄',
      title: 'Co-Benefit Analysis',
      description: 'Cross-utility synergies and multi-domain impacts',
      lines: coBenefitLines
    },
    'environmental': {
      icon: '🌱',
      title: 'Environmental Impact Analysis',
      description: 'Carbon emissions and ecological benefits',
      lines: environmentalLines
    }
  }

  return (
    <Stack spacing={2}>
      {/* Always show all three sections */}
      {Object.entries(analysisTypes).map(([type, meta]) => {
        const typeGoals = goalsByType[type]
        const sectionLines = meta.lines
        
        return (
          <Accordion key={type} defaultExpanded={sectionLines.length > 0}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                <Typography variant="h6" sx={{ fontSize: '1.5rem' }}>
                  {meta.icon}
                </Typography>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {meta.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {meta.description}
                    {typeGoals.length > 0 && ` • ${typeGoals.length} goal${typeGoals.length !== 1 ? 's' : ''}`}
                  </Typography>
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {sectionLines.length > 0 ? (
                typeGoals.length > 0 && type === 'goals' ? (
                  // Goals type with actual goals: show 4 recs per goal
                  <Stack spacing={3}>
                    {typeGoals.map((goal, idx) => (
                      <Paper 
                        key={goal.id}
                        elevation={0}
                        sx={{ 
                          p: 3, 
                          backgroundColor: 'rgba(37, 99, 235, 0.04)',
                          borderRadius: 2,
                          borderLeft: '4px solid',
                          borderLeftColor: 'primary.main'
                        }}
                      >
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1, color: 'primary.main' }}>
                          {goal.title}
                        </Typography>
                        {/* <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          {goal.description}
                        </Typography> */}
                        
                        <Stack spacing={1.5}>
                          {sectionLines.slice(idx * 4, (idx + 1) * 4).map((line, lineIdx) => (
                            <Box key={lineIdx} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
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
                              <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                                {line}
                              </Typography>
                            </Box>
                          ))}
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                ) : (
                  // Show all recommendations for this type
                  <Paper 
                    elevation={0}
                    sx={{ 
                      p: 3, 
                      backgroundColor: 'rgba(37, 99, 235, 0.04)',
                      borderRadius: 2
                    }}
                  >
                    <Stack spacing={1.5}>
                      {sectionLines.map((line, lineIdx) => (
                        <Box key={lineIdx} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
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
                          <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                            {line}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Paper>
                )
              ) : (
                <Alert severity="info">
                  Loading {meta.title.toLowerCase()}...
                </Alert>
              )}
            </AccordionDetails>
          </Accordion>
        )
      })}
    </Stack>
  )
}

// Simple bullet list recommendations (kept for backward compatibility)
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
                Sustainability Co-Benefit Analysis Engine
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
            <RecommendationsByType goals={normalizedGoals} forecastData={forecastData} />
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
