import { createContext, useContext, useState } from 'react'
import { apiLogin, apiSignup } from '../api'

const AuthContext = createContext(null)

const TOKEN_KEY = 'bideval_token'
const USER_KEY  = 'bideval_user'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null }
  })

  async function signup(name, email, password) {
    try {
      const data = await apiSignup(name, email, password)
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      setUser(data.user)
      return null
    } catch (err) {
      return err.message || 'Signup failed.'
    }
  }

  async function login(email, password) {
    try {
      const data = await apiLogin(email, password)
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      setUser(data.user)
      return null
    } catch (err) {
      return err.message || 'Login failed.'
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, signup }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
