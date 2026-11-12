import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  fetchPlayerSession,
  getPlatformApiBaseUrl,
  loginPlayerAccount,
  logoutPlayerAccount,
  registerPlayerAccount,
} from '../api/platformClient';

export interface PlayerAuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface PlayerAuthContextValue {
  playerUser: PlayerAuthUser | null;
  csrfToken: string | null;
  isCheckingSession: boolean;
  refreshSession: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: {
    username: string;
    email: string;
    password: string;
    bgmiIgn: string;
    bgmiCharId: string;
    roleTag?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const PlayerAuthContext = createContext<PlayerAuthContextValue | null>(null);

export const PlayerAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [playerUser, setPlayerUser] = useState<PlayerAuthUser | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(getPlatformApiBaseUrl()));

  const refreshSession = useCallback(async () => {
    if (!getPlatformApiBaseUrl()) {
      setPlayerUser(null);
      setCsrfToken(null);
      setIsCheckingSession(false);
      return;
    }
    try {
      const res = await fetchPlayerSession();
      if (res.authenticated && res.user) {
        setPlayerUser(res.user);
        setCsrfToken(res.csrfToken ?? null);
      } else {
        setPlayerUser(null);
        setCsrfToken(null);
      }
    } catch {
      setPlayerUser(null);
      setCsrfToken(null);
    } finally {
      setIsCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = async (identifier: string, password: string) => {
    const res = await loginPlayerAccount(identifier, password);
    setPlayerUser(res.user);
    setCsrfToken(res.csrfToken);
  };

  const register = async (payload: {
    username: string;
    email: string;
    password: string;
    bgmiIgn: string;
    bgmiCharId: string;
    roleTag?: string;
  }) => {
    const res = await registerPlayerAccount(payload);
    setPlayerUser(res.user);
    setCsrfToken(res.csrfToken);
  };

  const logout = async () => {
    try {
      await logoutPlayerAccount(csrfToken);
    } catch {
      // Clear client state even if cookie expired
    } finally {
      setPlayerUser(null);
      setCsrfToken(null);
    }
  };

  return (
    <PlayerAuthContext.Provider
      value={{
        playerUser,
        csrfToken,
        isCheckingSession,
        refreshSession,
        login,
        register,
        logout,
      }}
    >
      {children}
    </PlayerAuthContext.Provider>
  );
};

export function usePlayerAuth(): PlayerAuthContextValue {
  const ctx = useContext(PlayerAuthContext);
  if (!ctx) {
    throw new Error('usePlayerAuth must be used inside PlayerAuthProvider');
  }
  return ctx;
}

export function useOptionalPlayerAuth(): PlayerAuthContextValue | null {
  return useContext(PlayerAuthContext);
}
