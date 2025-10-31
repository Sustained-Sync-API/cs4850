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
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import LightbulbIcon from '@mui/icons-material/Lightbulb'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import GoalsManager from '../components/GoalsManager'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function BulletList({ text, enhanced = false }) {
  if (!text) return (
    <Alert severity="info" icon={<LightbulbIcon />}>
      Insights will appear once data is available.
    </Alert>
  )

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)

  if (enhanced) {
    const items = []
    let currentSection = null

    lines.forEach((line, idx) => {
      const cleanLine = line
        .replace(/^[•\-*►▸▹◦⦿⦾]\s*/, '')
        .replace(/^\d+[\.)]\s*/, '')
        .replace(/^#+\s*/, '')
        .trim()

      if (!cleanLine) return

      const isHeading = 
        cleanLine.endsWith(':') || 
        (cleanLine.length < 60 && /^[A-Z\s]+$/.test(cleanLine)) ||
        cleanLine.startsWith('**') ||
        line.startsWith('#')

      if (isHeading) {
        currentSection = cleanLine.replace(/[:*]/g, '').trim()
        items.push({ type: 'heading', text: currentSection, key: `heading-${idx}` })
      } else {
        const sentences = cleanLine.split(/(?<=[.!?])\s+(?=[A-Z])/)
        sentences.forEach((sentence, sIdx) => {
          const trimmedSentence = sentence.trim()
          if (trimmedSentence) {
            items.push({
              type: 'item',
              text: trimmedSentence,
              section: currentSection,
              key: `item-${idx}-${sIdx}`
            })
          }
        })
      }
    })

    return (
      <Stack spacing={2}>
        {items.map((item) => {
          if (item.type === 'heading') {
            return (
              <Box key={item.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                <LightbulbIcon sx={{ color: 'warning.main' }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {item.text}
                </Typography>
              </Box>
            )
          }
          
          return (
            <Box key={item.key} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <CheckCircleIcon sx={{ color: 'success.main', fontSize: '1.25rem', mt: 0.25, flexShrink: 0 }} />
              <Typography variant="body1" sx={{ flex: 1 }}>
                {item.text}
              </Typography>
            </Box>
          )
        })}
      </Stack>
    )
  }

  return (
    <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', pl: 0 }}>
      {lines.map((line, idx) => (
        <Box key={idx} component="li" sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <CheckCircleIcon sx={{ color: 'success.main', fontSize: '1.25rem', mt: 0.25, flexShrink: 0 }} />
          <Typography variant="body1">
            {line.replace(/^[•\-*]\s*/, '').replace(/^\d+[\.)]\s*/, '')}
          </Typography>
        </Box>
      ))}
    </Stack>
  )
}

function Sustainability() {
  const [goals, setGoals] = useState([])
  const [recommendations, setRecommendations] = useState('')
  const [recommendationWarning, setRecommendationWarning] = useState('')
  const [loading, setLoading] = useState({ goals: true, recommendations: true })
  const [showGoalsManager, setShowGoalsManager] = useState(false)

  useEffect(() => {
    fetchGoals()
    fetchRecommendations()
  }, [])

  const fetchGoals = async () => {
    setLoading(prev => ({ ...prev, goals: true }))
    try {
      const response = await fetch(`${API_BASE}/api/goals/`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to load goals')
      const normalizedGoals = Array.isArray(data.results)
        ? data.results
        : Array.isArray(data.goals)
          ? data.goals
          : []
      setGoals(normalizedGoals)
    } catch (err) {
      console.error('Failed to fetch goals:', err)
      setGoals([])
    } finally {
      setLoading(prev => ({ ...prev, goals: false }))
    }
  }

  const fetchRecommendations = async () => {
    setLoading(prev => ({ ...prev, recommendations: true }))
    setRecommendationWarning('')
    try {
      const response = await fetch(`${API_BASE}/api/recommendations/`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || data.warning || 'Failed to load recommendations')
      setRecommendations(data.recommendations || '')
      if (data.warning) setRecommendationWarning(data.warning)
    } catch (err) {
      setRecommendations('')
      setRecommendationWarning(err.message)
    } finally {
      setLoading(prev => ({ ...prev, recommendations: false }))
    }
  }

  const handleGoalsChange = () => {
    fetchGoals()
    fetchRecommendations()
  }

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
                {goals.length > 0 
                  ? `You have ${goals.length} active goal${goals.length !== 1 ? 's' : ''} tracking your sustainability progress.`
                  : 'Set up to 5 custom sustainability goals to guide your AI recommendations.'}
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={goals.length > 0 ? <EditIcon /> : <AddIcon />}
              onClick={() => setShowGoalsManager(true)}
            >
              {goals.length > 0 ? 'Manage Goals' : 'Set Your First Goal'}
            </Button>
          </Box>
          
          {loading.goals ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : goals.length > 0 ? (
            <Grid container spacing={2}>
              {goals.map((goal) => (
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
              Generated from contextual RAG pipeline using live database records.
            </Typography>
          </Box>
          
          {recommendationWarning && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              {recommendationWarning}
            </Alert>
          )}
          
          {loading.recommendations ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <BulletList text={recommendations} enhanced={true} />
          )}
        </CardContent>
      </Card>

      {showGoalsManager && (
        <GoalsManager onClose={() => {
          setShowGoalsManager(false)
          handleGoalsChange()
        }} />
      )}
    </Box>
  )
}

export default Sustainability
