import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import AdminPage from './pages/AdminPage'
import { Toaster } from './components/ui/sonner'
import { MultiTabDetector } from './components/MultiTabDetector'
import { BlockingLoader } from './components/BlockingLoader'
import { useStore } from './store/useStore'

function App() {
  const { loading } = useStore() // Get loading state from store

  return (
    <BrowserRouter>
      <MultiTabDetector />
      <BlockingLoader isLoading={loading} />
      <Toaster />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
