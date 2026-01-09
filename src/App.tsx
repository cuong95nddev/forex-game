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
      <Toaster position="top-right" />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/YWR2ZXJ0aXNpbmcgYW5kIGNvbnRlbnQgbWVhc3VyZW1lbnQsIGF1ZGllbmNlIHJlc2VhcmNoIGFuZCBzZXJ2aWNlcyBkZXZlbG9wbWVudC4gV2l0aCB5b3VyIHBlcm1pc3Npb24gd2UgYW5kIG91ciBwYXJ0bmVycyBtYXkgdXNlIHByZWNpc2UgZ2VvbG9jYXRpb24gZGF0YSBhbmQgaWRlbnRpZmljYXRpb24gdGhyb3VnaCBkZXZpY2Ugc2Nhbm5pbmcuIFlvdSBtYXkgY2xpY2sgdG8gY29uc2VudCB0byBvdXIgYW5kIG91ciAxNTU4IHBhcnRuZXJz4oCZIHByb2Nlc3NpbmcgYXMgZGVzY3JpYmVkIGFib3ZlLiBBbHRlcm5hdGl2ZWx5IHlvdSBtYXkgY2xpY2sgdG8gcmVmdXNlIHRvIGNvbnNlbnQgb3IgYWNjZXNzIG1vcmUgZGV0YWlsZWQgaW5mb3JtYXRpb24gYW5kIGM=" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
