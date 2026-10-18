import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/components.css'
import './styles/landing.css'
import App from './App.tsx'
import { WalletProvider } from './lib/wallet'
import { StoreProvider } from './lib/useStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </WalletProvider>
  </StrictMode>,
)
