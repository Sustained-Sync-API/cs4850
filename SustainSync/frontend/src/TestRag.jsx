import { useState } from 'react'

export default function TestRag(){
  const [answer, setAnswer] = useState(null)
  const [count, setCount] = useState(null)
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

  async function askQuestion(){
  const res = await fetch(`${API_BASE}/ask/`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({question: 'What is the total consumption trend?'}),
    })
    const data = await res.json()
    setAnswer(data.answer || data.error)
  }

  async function fetchCount(){
  const res = await fetch(`${API_BASE}/api/count/`)
    const data = await res.json()
    setCount(data.count)
  }

  return (
    <div style={{padding:20}}>
      <h3>RAG + DB test</h3>
      <div>
        <button onClick={askQuestion}>Ask RAG</button>
        <div style={{whiteSpace:'pre-wrap', marginTop:10}}>{answer}</div>
      </div>
      <div style={{marginTop:20}}>
        <button onClick={fetchCount}>Get Bills Count</button>
        <div style={{marginTop:10}}>Count: {count}</div>
      </div>
    </div>
  )
}
