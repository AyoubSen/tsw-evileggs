import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './app/styles.css'
import { OptionalClerkProvider } from './account/auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OptionalClerkProvider><App /></OptionalClerkProvider>
  </StrictMode>,
)
