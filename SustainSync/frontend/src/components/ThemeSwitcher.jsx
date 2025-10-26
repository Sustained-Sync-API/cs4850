import { useState, useEffect } from 'react';

const THEMES = [
  { id: 'default', name: '🌲 Forest Green (Default)', file: null },
  { id: 'modern-blue', name: '💼 Modern Blue', file: 'theme-1-modern-blue.css' },
  { id: 'dark-purple', name: '🌌 Dark Purple', file: 'theme-2-dark-purple.css' },
  { id: 'warm-sunset', name: '🌅 Warm Sunset', file: 'theme-3-warm-sunset.css' },
  { id: 'cyberpunk', name: '🔮 Cyberpunk Neon', file: 'theme-4-cyberpunk-neon.css' },
  { id: 'minimal', name: '⚫ Minimal Mono', file: 'theme-5-minimal-mono.css' },
];

export default function ThemeSwitcher() {
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('sustainsync-theme') || 'default';
  });

  useEffect(() => {
    // Remove any existing theme link
    const existingLinks = document.querySelectorAll('link[data-theme-stylesheet]');
    existingLinks.forEach(link => link.remove());

    // Load the selected theme
    const theme = THEMES.find(t => t.id === currentTheme);
    if (theme && theme.file) {
      const link = document.createElement('link');
      link.setAttribute('data-theme-stylesheet', 'true');
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = `/themes/${theme.file}`;
      document.head.appendChild(link);
      
      // Debug: log the URL being loaded
      console.log('Loading theme:', link.href);
    }

    // Save to localStorage
    localStorage.setItem('sustainsync-theme', currentTheme);
  }, [currentTheme]);

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 1000,
      background: 'rgba(14, 51, 33, 0.95)',
      backdropFilter: 'blur(24px)',
      padding: '16px 20px',
      borderRadius: '16px',
      border: '1px solid rgba(140, 195, 66, 0.3)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      maxWidth: '280px',
    }}>
      <label style={{
        display: 'block',
        marginBottom: '12px',
        fontSize: '0.9rem',
        fontWeight: 700,
        color: 'rgba(255, 255, 255, 0.9)',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}>
        🎨 Theme
      </label>
      <select
        value={currentTheme}
        onChange={(e) => setCurrentTheme(e.target.value)}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: '10px',
          border: '1px solid rgba(140, 195, 66, 0.3)',
          background: 'rgba(27, 64, 44, 0.8)',
          color: 'rgba(255, 255, 255, 0.95)',
          fontSize: '0.95rem',
          fontWeight: 600,
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {THEMES.map(theme => (
          <option key={theme.id} value={theme.id}>
            {theme.name}
          </option>
        ))}
      </select>
      <p style={{
        margin: '12px 0 0',
        fontSize: '0.75rem',
        color: 'rgba(255, 255, 255, 0.6)',
        lineHeight: 1.4,
      }}>
        Changes apply instantly. Your choice is saved.
      </p>
    </div>
  );
}
