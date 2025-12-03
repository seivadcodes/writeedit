// components/Header.tsx
'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export function Header() {
  const [user, setUser] = useState<any>(null);
  const pathname = usePathname(); // ✅ SSR-safe way to get current path

  useEffect(() => {
    // Get initial user
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleAuth = async () => {
    if (user) {
      await supabase.auth.signOut();
      // Optionally: redirect or refresh
      window.location.href = '/'; // simple reload or redirect
    } else {
      alert('Login modal would open here');
    }
  };

  const navItems = [
    { name: 'Portfolio', href: '/portfolio' },
    { name: 'Blog', href: '/blog' },
    { name: 'Editor', href: '/editor' },
    { name: 'Write', href: '/write' },
  ];

  return (
    <header className="site-header-bp">
      <div className="container-bp">
        <div className="logo-bp">
          <h1><a href="/">Before Publishing</a></h1>
        </div>
        <nav className="main-nav-bp">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={item.href === pathname ? 'active' : ''}
            >
              {item.name}
            </a>
          ))}
          <button
            onClick={handleAuth}
            className="auth-btn"
          >
            {user ? 'Logout' : 'Login'}
          </button>
        </nav>
      </div>
    </header>
  );
}