import { createContext, useContext, useState, useEffect } from 'react'
import { apiLogin, apiSignup, apiMe } from '../api'

const AuthContext = createContext(null)

const TOKEN_KEY = 'bideval_token'
const USER_KEY  = 'bideval_user'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY)) } catch { return null }
  })

  // Refresh the cached user (e.g. to pick up a role change) for sessions that
  // logged in before that field existed on the response.
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return
    apiMe()
      .then(fresh => {
        localStorage.setItem(USER_KEY, JSON.stringify(fresh))
        setUser(fresh)
      })
      .catch(() => {})
  }, [])

  async function signup(name, email, password, role = 'evaluator') {
    try {
      const data = await apiSignup(name, email, password, role)
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
