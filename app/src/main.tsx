import '@fontsource-variable/newsreader/wght.css'
import '@fontsource-variable/source-sans-3/wght.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import 'maplibre-gl/dist/maplibre-gl.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Les fichiers publiés sont immuables pour une version donnée : pas besoin de les recharger.
const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: 1 } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
