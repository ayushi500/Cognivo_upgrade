import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {Toaster} from 'react-hot-toast'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <Toaster position="top-right" toastOptions={{duration:3000}}/>
    <App />
    </AuthProvider>
  </StrictMode>,
)


/**
 * Small popup notifications jo screen ke top/bottom par thodi der ke liye dikhte hain aur phir automatically hide ho jaate hain.
Ye user ko quick feedback dene ke liye use hote hain – jaise success, error, warning, info messages.
 */