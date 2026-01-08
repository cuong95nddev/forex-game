import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import AdminPage from './pages/AdminPage'
import { Toaster } from './components/ui/sonner'
import { MultiTabDetector } from './components/MultiTabDetector'

function App() {
  return (
    <BrowserRouter>
      <MultiTabDetector />
      <Toaster />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
