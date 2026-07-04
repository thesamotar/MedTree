'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { LogIn, UserPlus, ArrowRight, KeyRound, Eye, EyeOff } from 'lucide-react';

// Animated background graph canvas
function GraphBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let nodes = [];
    const NODE_COUNT = 60;
    const CONNECTION_DIST = 160;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    // Seed nodes
    for (let i = 0; i < NODE_COUNT; i++) {
      nodes.push({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2.5 + 1.5,
        pulse: Math.random() * Math.PI * 2,
        hue: Math.random() > 0.6 ? 170 : Math.random() > 0.3 ? 160 : 195,
      });
    }

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      // Move nodes
      nodes.forEach(n => {
        n.x += n.vx;
        n.y += n.vy;
        n.pulse += 0.015;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      });

      // Draw edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.18;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `hsla(${nodes[i].hue}, 80%, 65%, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      nodes.forEach(n => {
        const glow = Math.sin(n.pulse) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${n.hue}, 85%, 70%, ${glow * 0.8})`;
        ctx.fill();

        // Outer glow
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 3, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${n.hue}, 85%, 70%, ${glow * 0.08})`;
        ctx.fill();
      });

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="login-graph-canvas" />;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage('Password reset link sent! Check your email inbox.');
      }
      setLoading(false);
      return;
    }

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage('Check your email for a confirmation link. If email confirmation is disabled in your Supabase project, you are already logged in.');
        setTimeout(() => router.push('/'), 1500);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        router.push('/');
        router.refresh();
      }
    }

    setLoading(false);
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setMessage('');
    setShowPassword(false);
  };

  return (
    <div className="login-page">
      {/* Animated Graph Background */}
      <GraphBackground />

      {/* Left branding */}
      <div className="login-brand">
        <h1 className="login-brand-title">MedTree</h1>
        <p className="login-brand-tagline">
          Map your family's medical history.<br />
          Uncover hidden risks before they happen.
        </p>
      </div>

      {/* Right-aligned login card */}
      <div className="login-card">
        {/* Toggle */}
        <div className="login-toggle">
          <button
            className={`toggle-btn ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => switchMode('signin')}
          >
            <LogIn size={14} /> Sign In
          </button>
          <button
            className={`toggle-btn ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => switchMode('signup')}
          >
            <UserPlus size={14} /> Sign Up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={loading}
            />
          </div>

          {mode !== 'forgot' && (
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  disabled={loading}
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted, #6b7280)',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {error && <div className="login-error">{error}</div>}
          {message && <div className="login-success">{message}</div>}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading
              ? 'Processing...'
              : mode === 'forgot'
                ? 'Send Reset Link'
                : mode === 'signup'
                  ? 'Create Account'
                  : 'Sign In'}
            {!loading && <ArrowRight size={16} />}
          </button>

          {mode === 'signin' && (
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="login-forgot-btn"
            >
              <KeyRound size={12} /> Forgot your password?
            </button>
          )}
          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="login-forgot-btn"
              style={{ color: 'var(--text-muted, #6b7280)' }}
            >
              ← Back to Sign In
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
