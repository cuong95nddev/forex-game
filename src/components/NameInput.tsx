import { useState, useEffect } from 'react'
import { User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '../lib/supabase'

interface NameInputProps {
  onSubmit: (name: string) => void
}

export const NameInput: React.FC<NameInputProps> = ({ onSubmit }) => {
  const [name, setName] = useState('')
  const [defaultBalance, setDefaultBalance] = useState(10000)

  useEffect(() => {
    // Load default balance from settings
    const loadSettings = async () => {
      const { data } = await supabase
        .from('game_settings')
        .select('default_user_balance')
        .limit(1)
        .single()
      
      if (data?.default_user_balance) {
        setDefaultBalance(data.default_user_balance)
      }
    }
    
    loadSettings()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onSubmit(name.trim())
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-primary">
              <User className="w-12 h-12 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-3xl">
            Chào mừng đến Game Vàng
          </CardTitle>
          <CardDescription className="text-base mt-2">
            Nhập tên của bạn để bắt đầu giao dịch
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Tên của bạn
              </label>
              <Input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nhập tên..."
                required
                autoFocus
              />
            </div>
            
            <Button
              type="submit"
              className="w-full"
            >
              Bắt đầu chơi
            </Button>
          </form>
          
          <Alert className="mt-6">
            <AlertDescription className="flex items-center justify-center">
              💰 Số dư ban đầu: <span className="font-bold ml-2">${defaultBalance.toLocaleString()}</span>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
