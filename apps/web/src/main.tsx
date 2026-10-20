import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/figtree/400.css'; import '@fontsource/figtree/600.css'; import '@fontsource/figtree/700.css'; import '@fontsource/figtree/800.css'
import './styles.css'
import { SessionProvider } from './lib/session'
import App from './App'
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><SessionProvider><App /></SessionProvider></BrowserRouter></StrictMode>)
