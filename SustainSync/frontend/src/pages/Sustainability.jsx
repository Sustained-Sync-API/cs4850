import { useState } from 'react'
import GoalsManager from '../components/GoalsManager'
import '../App.css'

// Convert newline-delimited LLM responses into bullet points with enhanced formatting.
function BulletList({ text, enhanced = false }) {
  if (!text) return <p className="empty-state">Insights will appear once data is available.</p>

  // Split by multiple newlines or bullet patterns to handle various AI response formats
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (enhanced) {
    const items = []
    let currentSection = null

    lines.forEach((line, idx) => {
      // Remove common bullet markers and numbering
      const cleanLine = line
        .replace(/^[•\-*►▸▹◦⦿⦾]\s*/, '')
        .replace(/^\d+[\.)]\s*/, '')
        .replace(/^#+\s*/, '')
        .trim()

      if (!cleanLine) return

      // Detect headings: short lines ending with colon, bold markers, or all caps phrases
      const isHeading = 
        cleanLine.endsWith(':') || 
        (cleanLine.length < 60 && /^[A-Z\s]+$/.test(cleanLine)) ||
        cleanLine.startsWith('**') ||
        line.startsWith('#')

      if (isHeading) {
        currentSection = cleanLine.replace(/[:*]/g, '').trim()
        items.push({
          type: 'heading',
          text: currentSection,
          key: `heading-${idx}`
        })
      } else {
        // Split long paragraphs into sentences for better readability
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
      <div className="recommendations-enhanced">
        {items.map((item) => {
          if (item.type === 'heading') {
            return (
              <div key={item.key} className="recommendation-section">
                <div className="recommendation-heading">
                  <span className="heading-icon">💡</span>
                  <h4>{item.text}</h4>
                </div>
              </div>
            )
          }
          
          return (
            <div key={item.key} className="recommendation-item">
              <span className="recommendation-icon">✓</span>
              <div className="recommendation-content">
                <p className="recommendation-text">{item.text}</p>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <ul className="recommendations">
      {lines.map((line, idx) => (
        <li key={idx}>{line.replace(/^[•\-*]\s*/, '').replace(/^\d+[\.)]\s*/, '')}</li>
      ))}
    </ul>
  )
}

function Sustainability({ goals, recommendations, recommendationSources, recommendationWarning, loading, onGoalsChange }) {
  const [showGoalsManager, setShowGoalsManager] = useState(false)

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <h1>Sustainability Goals & AI Recommendations</h1>
          <p>Set custom goals and receive AI-powered sustainability guidance based on your energy data.</p>
        </div>
        <div className="header-actions">
          <button 
            className="primary" 
            onClick={() => setShowGoalsManager(true)}
          >
            {goals.length > 0 ? '✏️ Manage Goals' : '🎯 Set Your First Goal'}
          </button>
        </div>
      </header>

      {/* Goals Section */}
      <section className="panel">
        <div className="panel-header">
          <div className="panel-header-row">
            <div>
              <h2>Your Sustainability Goals</h2>
              <p>
                {goals.length > 0 
                  ? `You have ${goals.length} active goal${goals.length !== 1 ? 's' : ''} tracking your sustainability progress.`
                  : 'Set up to 5 custom sustainability goals to guide your AI recommendations.'}
              </p>
            </div>
          </div>
        </div>
        
        {loading.goals ? (
          <div className="goals-manager-loading">Loading goals...</div>
        ) : goals.length > 0 ? (
          <div className="goals-display">
            {goals.map((goal) => (
              <div key={goal.id} className="goal-card">
                <div className="goal-header">
                  <h3>{goal.title}</h3>
                  {goal.target_date && (
                    <span className="goal-deadline">
                      📅 {new Date(goal.target_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                  )}
                </div>
                <p className="goal-description">{goal.description}</p>
                <div className="goal-meta">
                  <span className="goal-created">Created {new Date(goal.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state-large">
            <div className="empty-state-icon">🎯</div>
            <h3>No Goals Set Yet</h3>
            <p>Create your first sustainability goal to get personalized AI recommendations aligned with your objectives.</p>
            <button 
              className="primary" 
              onClick={() => setShowGoalsManager(true)}
              style={{ marginTop: '20px' }}
            >
              Create Your First Goal
            </button>
          </div>
        )}
      </section>

      {/* AI Recommendations Section */}
      <section className="panel">
        <div className="panel-header">
          <div className="panel-header-row">
            <div>
              <h2>AI Sustainability Recommendations</h2>
              <p>Generated from contextual RAG pipeline using live database records.</p>
            </div>
          </div>
        </div>
        
        {recommendationSources && (
          <div className="recommendation-sources">
            <div className="source-badge">
              <strong>AI Model:</strong> {recommendationSources.model}
            </div>
            {recommendationSources.data_range?.start_date && (
              <div className="source-badge">
                <strong>Data Analyzed:</strong> {new Date(recommendationSources.data_range.start_date).toLocaleDateString()} - {new Date(recommendationSources.data_range.end_date).toLocaleDateString()} ({recommendationSources.data_range.total_bills} bills)
              </div>
            )}
            <div className="source-badge">
              <strong>Goals Analyzed:</strong> {goals.length}
            </div>
            <div className="source-badge">
              <strong>RAG Pipeline:</strong> {recommendationSources.rag_enabled ? '✓ Enabled' : '✗ Disabled'}
            </div>
          </div>
        )}
        
        {recommendationWarning && <div className="warning-banner">{recommendationWarning}</div>}
        
        {loading.recommendations ? (
          <div className="goals-manager-loading">Generating AI recommendations...</div>
        ) : (
          <BulletList text={recommendations} enhanced={true} />
        )}
      </section>

      {showGoalsManager && (
        <GoalsManager onClose={() => {
          setShowGoalsManager(false)
          if (onGoalsChange) onGoalsChange()
        }} />
      )}
    </div>
  )
}

export default Sustainability
