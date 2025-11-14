import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Box,
  Typography,
  IconButton,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  CardActions,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import AddIcon from '@mui/icons-material/Add'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function GoalsManager({ onClose }) {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editingGoal, setEditingGoal] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    analysis_type: 'goals',
    target_date: '',
  })

  useEffect(() => {
    fetchGoals()
  }, [])

  const fetchGoals = async () => {
    setLoading(true)
    setError('')
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
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    if (goals.length >= 5) {
      setError('Maximum of 5 goals allowed')
      return
    }
    setIsEditing(true)
    setEditingGoal(null)
    setFormData({ title: '', description: '', analysis_type: 'goals', target_date: '' })
  }

  const handleEdit = (goal) => {
    setIsEditing(true)
    setEditingGoal(goal)
    setFormData({
      title: goal.title,
      description: goal.description,
      analysis_type: goal.analysis_type || 'goals',
      target_date: goal.target_date || '',
    })
  }

  const handleDelete = async (goalId) => {
    if (!confirm('Are you sure you want to delete this goal?')) return
    
    try {
      const response = await fetch(`${API_BASE}/api/goals/`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: goalId }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete goal')
      }
      await fetchGoals()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleSave = async () => {
    setError('')
    
    if (!formData.title.trim()) {
      setError('Title is required')
      return
    }
    if (!formData.description.trim()) {
      setError('Description is required')
      return
    }

    try {
      const method = editingGoal ? 'PUT' : 'POST'
      const payload = editingGoal
        ? { ...formData, id: editingGoal.id }
        : formData
      const response = await fetch(`${API_BASE}/api/goals/`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save goal')
      }

      await fetchGoals()
      setIsEditing(false)
      setEditingGoal(null)
      setFormData({ title: '', description: '', analysis_type: 'goals', target_date: '' })
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditingGoal(null)
    setFormData({ title: '', description: '', analysis_type: 'goals', target_date: '' })
    setError('')
  }

  return (
    <Dialog open={true} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Manage Sustainability Goals
          </Typography>
          <IconButton onClick={onClose} edge="end">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : isEditing ? (
          <Stack spacing={3}>
            <Typography variant="body2" color="text.secondary">
              {editingGoal ? 'Edit your sustainability goal' : 'Create a new sustainability goal (max 5 total)'}
            </Typography>
            <TextField
              label="Goal Title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              fullWidth
              required
              placeholder="e.g., Reduce energy consumption by 20%"
            />
            <TextField
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              fullWidth
              required
              multiline
              rows={4}
              placeholder="Describe what you want to achieve and how..."
            />
            <TextField
              select
              label="Analysis Type"
              value={formData.analysis_type}
              onChange={(e) => setFormData({ ...formData, analysis_type: e.target.value })}
              fullWidth
              required
              SelectProps={{ native: true }}
              helperText="Choose how recommendations should be generated for this goal"
            >
              <option value="goals">Goals-Focused (2 recommendations per goal)</option>
              <option value="co-benefit">Co-Benefit Analysis (cross-utility synergies)</option>
              <option value="environmental">Environmental Impact (carbon & ecological focus)</option>
            </TextField>
            <TextField
              label="Target Date (Optional)"
              type="date"
              value={formData.target_date}
              onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <Button onClick={handleCancel} variant="outlined">
                Cancel
              </Button>
              <Button onClick={handleSave} variant="contained">
                {editingGoal ? 'Save Changes' : 'Create Goal'}
              </Button>
            </Box>
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                You have {goals.length} of 5 goals
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreate}
                disabled={goals.length >= 5}
              >
                Add New Goal
              </Button>
            </Box>

            {goals.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  No goals yet. Create your first sustainability goal to get started.
                </Typography>
              </Box>
            ) : (
              goals.map((goal) => (
                <Card key={goal.id} variant="outlined">
                  <CardContent>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                      {goal.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {goal.description}
                    </Typography>
                    <Typography variant="caption" color="primary" sx={{ display: 'block', mb: 0.5, fontWeight: 500 }}>
                      {goal.analysis_type === 'goals' && '📊 Goals-Focused (2 recs/goal)'}
                      {goal.analysis_type === 'co-benefit' && '🔄 Co-Benefit Analysis'}
                      {goal.analysis_type === 'environmental' && '🌱 Environmental Impact'}
                    </Typography>
                    {goal.target_date && (
                      <Typography variant="caption" color="text.secondary">
                        Target: {new Date(goal.target_date).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </Typography>
                    )}
                  </CardContent>
                  <CardActions sx={{ justifyContent: 'flex-end', gap: 1 }}>
                    <Button
                      size="small"
                      startIcon={<EditIcon />}
                      onClick={() => handleEdit(goal)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={() => handleDelete(goal.id)}
                    >
                      Delete
                    </Button>
                  </CardActions>
                </Card>
              ))
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default GoalsManager
