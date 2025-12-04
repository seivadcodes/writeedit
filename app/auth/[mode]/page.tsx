'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'signin'; // fallback to signin

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.push('/portfolio'); // or your dashboard
      }
    };
    checkSession();
  }, [router]);

  const validateForm = () => {
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setMessage({ type: 'error', text: 'Please enter a valid email.' });
      return false;
    }
    if (mode === 'signup' && (!password || password.length < 6)) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!validateForm()) return;

    setLoading(true);

    try {
      let result;
      if (mode === 'signup') {
        result = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
          },
        });
        if (result.error) throw result.error;
        setMessage({
          type: 'success',
          text: 'Check your email for a confirmation link.',
        });
      } else {
        // Sign in with password
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) {
          router.push('/portfolio');
          return;
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Authentication failed.' });
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider: 'github' | 'google') => {
    setLoading(true);
    supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const isSignIn = mode === 'signin';

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>{isSignIn ? 'Welcome Back' : 'Create Account'}</h1>
        <p style={styles.subtitle}>
          {isSignIn ? 'Sign in to manage your portfolio' : 'Join to showcase your work'}
        </p>

        {message && (
          <div style={message.type === 'error' ? styles.alertError : styles.alertSuccess}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label htmlFor="email" style={styles.label}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={styles.input}
              disabled={loading}
              required
            />
          </div>

          {mode === 'signup' && (
            <div style={styles.inputGroup}>
              <label htmlFor="password" style={styles.label}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={styles.input}
                disabled={loading}
                required
              />
              <p style={styles.hint}>At least 6 characters</p>
            </div>
          )}

          {mode === 'signin' && (
            <button
              type="button"
              onClick={() => {
                /* Optional: add password reset flow */
              }}
              style={styles.forgotPassword}
            >
              Forgot password?
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              ...(loading ? styles.buttonLoading : {}),
            }}
          >
            {loading ? 'Processing...' : isSignIn ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={styles.divider}>
          <span>or continue with</span>
        </div>

        <div style={styles.oauthButtons}>
          <button
            type="button"
            onClick={() => handleOAuth('github')}
            style={styles.oauthButton}
            disabled={loading}
          >
            GitHub
          </button>
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            style={styles.oauthButton}
            disabled={loading}
          >
            Google
          </button>
        </div>

        <div style={styles.footer}>
          {isSignIn ? (
            <>
              Don’t have an account?{' '}
              <a href="/auth/signup" style={styles.link}>
                Sign up
              </a>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <a href="/auth/signin" style={styles.link}>
                Sign in
              </a>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        /* Optional: add global reset or use your existing CSS */
      `}</style>
    </div>
  );
}

// Professional inline styles (replace with Tailwind or CSS modules if preferred)
const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '1.5rem',
    backgroundColor: '#f9fafb',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    padding: '2.5rem',
    borderRadius: '12px',
    backgroundColor: 'white',
    boxShadow:
      '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e5e7eb',
  },
  title: {
    fontSize: '1.875rem',
    fontWeight: 700,
    color: '#111827',
    textAlign: 'center' as const,
    marginBottom: '0.5rem',
  },
  subtitle: {
    fontSize: '1rem',
    color: '#6b7280',
    textAlign: 'center' as const,
    marginBottom: '1.5rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.25rem',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '0.5rem',
  },
  input: {
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '1rem',
    transition: 'border-color 0.2s',
  },
  hint: {
    fontSize: '0.75rem',
    color: '#9ca3af',
    marginTop: '0.25rem',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    background: 'none',
    border: 'none',
    color: '#3b82f6',
    fontSize: '0.875rem',
    cursor: 'pointer',
    padding: 0,
    marginTop: '-0.5rem',
    marginBottom: '0.25rem',
  },
  button: {
    padding: '0.875rem',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 600,
    color: 'white',
    backgroundColor: '#3b82f6',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  buttonLoading: {
    opacity: 0.8,
    cursor: 'not-allowed',
  },
  alertError: {
    padding: '0.75rem',
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    borderRadius: '8px',
    fontSize: '0.875rem',
    marginBottom: '1rem',
  },
  alertSuccess: {
    padding: '0.75rem',
    backgroundColor: '#dcfce7',
    color: '#166534',
    borderRadius: '8px',
    fontSize: '0.875rem',
    marginBottom: '1rem',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '1.5rem 0',
    color: '#9ca3af',
    fontSize: '0.875rem',
  },
  oauthButtons: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
  },
  oauthButton: {
    padding: '0.75rem',
    borderRadius: '8px',
    fontSize: '0.95rem',
    fontWeight: 600,
    border: '1px solid #d1d5db',
    backgroundColor: 'white',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  footer: {
    textAlign: 'center' as const,
    marginTop: '1.5rem',
    fontSize: '0.875rem',
    color: '#6b7280',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontWeight: 600,
  },
};