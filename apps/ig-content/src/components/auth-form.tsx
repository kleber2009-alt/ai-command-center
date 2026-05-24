'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        })
        if (error) throw error
        setInfo('Аккаунт создан. Если включено подтверждение email — проверьте почту, иначе войдите.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="mb-2 flex items-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-medium">IG Serial Content</span>
        </div>
        <CardTitle>{mode === 'login' ? 'Вход' : 'Регистрация'}</CardTitle>
        <CardDescription>
          {mode === 'login'
            ? 'Войдите, чтобы управлять серийными кампаниями'
            : 'Создайте аккаунт и запустите 30-дневную серию'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-2">
              <Label htmlFor="name">Имя</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Илья" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-emerald-400">{info}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === 'login' ? (
            <>
              Нет аккаунта?{' '}
              <Link href="/signup" className="text-primary hover:underline">
                Создать
              </Link>
            </>
          ) : (
            <>
              Уже есть аккаунт?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Войти
              </Link>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  )
}
