import { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export default function GoalsManager({ onClose }) {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    target_date: ''
  })

  useEffect(() => {
    fetchGoals()
  }, [])

  const fetchGoals = async () => {
    try {
      console.log('Fetching goals from:', `${API_BASE}/api/goals/`)
      const response = await fetch(`${API_BASE}/api/goals/`)
      console.log('Goals response status:', response.status)
      const data = await response.json()
      console.log('Goals data received:', data)
      setGoals(data.goals || [])
    } catch (error) {
      console.error('Failed to fetch goals:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (goals.length >= 5 && !editing) {
      alert('Maximum of 5 goals allowed. Please delete an existing goal first.')
      return
    }

    try {
      const method = editing ? 'PUT' : 'POST'
      const payload = editing ? { ...formData, id: editing } : formData
      
      const response = await fetch(`${API_BASE}/api/goals/`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      if (response.ok) {
        await fetchGoals()
        resetForm()
      }
    } catch (error) {
      console.error('Failed to save goal:', error)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this goal?')) return
    
    try {
      await fetch(`${API_BASE}/api/goals/`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      await fetchGoals()
    } catch (error) {
      console.error('Failed to delete goal:', error)
    }
  }

  const handleEdit = (goal) => {
    setEditing(goal.id)
    setFormData({
      title: goal.title,
      description: goal.description,
      target_date: goal.target_date || ''
    })
  }

  const resetForm = () => {
    setEditing(null)
    setFormData({
      title: '',
      description: '',
      target_date: ''
    })
  }

  if (loading) return <div className="goals-manager-loading">Loading goals...</div>

  return (
    <div className="goals-manager-overlay" onClick={onClose}>
      <div className="goals-manager" onClick={(e) => e.stopPropagation()}>
        <div className="goals-header">
          <h2>🎯 Sustainability Goals</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="goals-info">
          <span className="goals-count">{goals.length}/5 Goals</span>
          <p>AI will automatically analyze all goals and track your progress</p>
        </div>

        <form className="goal-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Goal title (e.g., Reduce power consumption by 20%)"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
            maxLength={200}
          />
          
          <textarea
            placeholder="Detailed description of your sustainability goal..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            required
            rows={3}
          />

          <input
            type="date"
            placeholder="Target date (optional)"
            value={formData.target_date}
            onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
          />

          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {editing ? 'Update Goal' : 'Add Goal'}
            </button>
            {editing && (
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="goals-list">
          {goals.length === 0 ? (
            <p className="empty-state">No goals yet. Add your first sustainability goal above!</p>
          ) : (
            goals.map(goal => (
              <div key={goal.id} className="goal-item">
                <div className="goal-content">
                  <h3>{goal.title}</h3>
                  <p className="goal-description">{goal.description}</p>
                  {goal.target_date && (
                    <div className="goal-target">
                      Target Date: {new Date(goal.target_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </div>
                  )}
                  <div className="goal-meta">
                    <span className="goal-date">Added {new Date(goal.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="goal-actions">
                  <button onClick={() => handleEdit(goal)} className="btn-edit">Edit</button>
                  <button onClick={() => handleDelete(goal.id)} className="btn-delete">Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
