import { ClerkProvider, UserButton, useAuth, useClerk, useUser } from '@clerk/react'
import { createContext, useContext, type ReactNode } from 'react'

export type OptionalAuth = {
  configured: boolean
  loaded: boolean
  signedIn: boolean
  user: { id: string; displayName: string; email: string | null; imageUrl: string } | null
  getToken: () => Promise<string | null>
  openSignIn: () => void
  openSignUp: () => void
  signOut: () => Promise<void>
}

const guestAuth: OptionalAuth = {
  configured: false,
  loaded: true,
  signedIn: false,
  user: null,
  getToken: async () => null,
  openSignIn: () => undefined,
  openSignUp: () => undefined,
  signOut: async () => undefined,
}

const AuthContext = createContext<OptionalAuth>(guestAuth)

function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { user } = useUser()
  const clerk = useClerk()
  const value: OptionalAuth = {
    configured: true,
    loaded: isLoaded,
    signedIn: isSignedIn === true,
    user: user ? {
      id: user.id,
      displayName: user.fullName ?? user.username ?? user.primaryEmailAddress?.emailAddress ?? 'Player',
      email: user.primaryEmailAddress?.emailAddress ?? null,
      imageUrl: user.imageUrl,
    } : null,
    getToken,
    openSignIn: () => clerk.openSignIn(),
    openSignUp: () => clerk.openSignUp(),
    signOut: () => clerk.signOut(),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function OptionalClerkProvider({ children }: { children: ReactNode }) {
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()
  if (!key) return <AuthContext.Provider value={guestAuth}>{children}</AuthContext.Provider>
  return <ClerkProvider publishableKey={key}><ClerkAuthBridge>{children}</ClerkAuthBridge></ClerkProvider>
}

export const useOptionalAuth = () => useContext(AuthContext)

export function AccountAvatar() {
  return <UserButton />
}
