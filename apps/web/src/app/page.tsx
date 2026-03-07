'use client';

import { useEffect, useState, useRef, useCallback, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';
import {
  AudioOutlined,
  TranslationOutlined,
  MedicineBoxOutlined,
  AlertOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
  DashboardOutlined,
  UserOutlined,
  HeartOutlined,
  ArrowRightOutlined,
  CheckCircleFilled,
  GlobalOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/auth-store';

/* ═══════════════════════════════════════════════════════════════════════════
   DESIGN SYSTEM
   ═══════════════════════════════════════════════════════════════════════════ */

const font = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const mono = "'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace";

const color = {
  bg: '#fafafa',
  white: '#ffffff',
  gray50: '#f8fafc',
  gray100: '#f1f5f9',
  gray200: '#e2e8f0',
  gray300: '#cbd5e1',
  gray400: '#94a3b8',
  gray500: '#64748b',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1e293b',
  gray900: '#0f172a',
  gray950: '#020617',
  violet: '#7c3aed',
  violetLight: '#ede9fe',
  violetDark: '#5b21b6',
  blue: '#2563eb',
  teal: '#0d9488',
  red: '#dc2626',
  amber: '#d97706',
  green: '#16a34a',
};

/* ═══════════════════════════════════════════════════════════════════════════
   SCROLL REVEAL HOOK
   ═══════════════════════════════════════════════════════════════════════════ */

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

function Reveal({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: CSSProperties;
}) {
  const { ref, isVisible } = useScrollReveal();
  return (
    <div
      ref={ref}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(32px)',
        transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s`,
        willChange: 'opacity, transform',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GLOBAL STYLES (injected once)
   ═══════════════════════════════════════════════════════════════════════════ */

function LandingStyles() {
  return (
    <style>{`
      /* ── Keyframes ── */
      @keyframes lp-gradient { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
      @keyframes lp-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
      @keyframes lp-float-slow { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-20px) rotate(3deg)} }
      @keyframes lp-pulse { 0%,100%{opacity:0.4;transform:scale(1)} 50%{opacity:0.8;transform:scale(1.05)} }
      @keyframes lp-dash { to{stroke-dashoffset:0} }
      @keyframes lp-spin-slow { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      @keyframes lp-shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }

      /* ── Nav ── */
      .lp-nav-link { position:relative; color:${color.gray500}; font-size:14px; font-weight:500; text-decoration:none; transition:color 0.2s; letter-spacing:-0.01em; }
      .lp-nav-link:hover { color:${color.gray900}; }

      /* ── Cards ── */
      .lp-card {
        transition: transform 0.4s cubic-bezier(0.16,1,0.3,1), box-shadow 0.4s cubic-bezier(0.16,1,0.3,1);
      }
      .lp-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 24px 48px -12px rgba(0,0,0,0.08), 0 8px 16px -4px rgba(0,0,0,0.04);
      }

      .lp-portal-card {
        transition: transform 0.45s cubic-bezier(0.16,1,0.3,1), box-shadow 0.45s cubic-bezier(0.16,1,0.3,1);
      }
      .lp-portal-card:hover {
        transform: translateY(-6px) scale(1.01);
        box-shadow: 0 32px 64px -16px rgba(0,0,0,0.1), 0 12px 24px -4px rgba(0,0,0,0.05);
      }

      .lp-step:hover .lp-step-num {
        transform: scale(1.1);
        box-shadow: 0 8px 24px rgba(124,58,237,0.2);
      }

      /* ── Buttons ── */
      .lp-btn-primary {
        position: relative;
        overflow: hidden;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .lp-btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 12px 24px -4px rgba(124,58,237,0.35);
      }
      .lp-btn-primary:active { transform: translateY(0); }

      .lp-btn-secondary {
        transition: all 0.2s;
      }
      .lp-btn-secondary:hover {
        background: ${color.gray100} !important;
        border-color: ${color.gray300} !important;
      }

      /* ── Footer ── */
      .lp-footer-link {
        color: rgba(255,255,255,0.4);
        font-size: 14px;
        text-decoration: none;
        display: block;
        margin-bottom: 12px;
        transition: color 0.2s;
        letter-spacing: -0.01em;
      }
      .lp-footer-link:hover { color: rgba(255,255,255,0.85); }

      /* ── Responsive ── */
      @media (max-width: 900px) {
        .lp-hero-grid { grid-template-columns: 1fr !important; text-align: center !important; }
        .lp-hero-visual { display: none !important; }
        .lp-hero-actions { justify-content: center !important; }
        .lp-hero-title { font-size: 42px !important; }
        .lp-hero-sub { font-size: 16px !important; }
        .lp-features-grid { grid-template-columns: 1fr !important; }
        .lp-feat-wide { grid-column: span 1 !important; }
        .lp-steps-grid { grid-template-columns: 1fr 1fr !important; }
        .lp-timeline-line { display: none !important; }
        .lp-portals-grid { grid-template-columns: 1fr !important; }
        .lp-stats-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 16px !important; }
        .lp-nav-links-desktop { display: none !important; }
        .lp-footer-grid { grid-template-columns: 1fr 1fr !important; }
        .lp-cta-title { font-size: 32px !important; }
        .lp-section { padding: 64px 20px !important; }
        .lp-hero-section { padding: 100px 20px 64px !important; }
        .lp-cta-section { padding: 48px 20px !important; }
        .lp-cta-card { padding: 48px 32px !important; }
      }
      @media (max-width: 600px) {
        .lp-hero-title { font-size: 28px !important; line-height: 1.15 !important; }
        .lp-hero-sub { font-size: 15px !important; }
        .lp-hero-actions { flex-direction: column !important; width: 100% !important; }
        .lp-hero-actions a, .lp-hero-actions button { width: 100% !important; }
        .lp-steps-grid { grid-template-columns: 1fr !important; }
        .lp-stats-grid { grid-template-columns: 1fr 1fr !important; gap: 12px !important; }
        .lp-section-title { font-size: 24px !important; }
        .lp-section-sub { font-size: 14px !important; }
        .lp-footer-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
        .lp-section { padding: 48px 16px !important; }
        .lp-hero-section { padding: 80px 16px 48px !important; }
        .lp-cta-section { padding: 40px 16px !important; }
        .lp-cta-card { padding: 36px 20px !important; border-radius: 16px !important; }
        .lp-nav { padding: 0 16px !important; }
      }
    `}</style>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════════════════════════════════ */

function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className="lp-nav"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: '0 24px',
        background: scrolled ? 'rgba(255,255,255,0.82)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(0,0,0,0.04)' : '1px solid transparent',
        transition: 'all 0.3s ease',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
            }}
          >
            <HeartOutlined style={{ fontSize: 16, color: '#fff' }} />
          </div>
          <span style={{ fontSize: 20, fontWeight: 700, color: color.gray900, letterSpacing: '-0.03em', fontFamily: font }}>
            Vaidyah
          </span>
        </Link>

        {/* Links */}
        <div className="lp-nav-links-desktop" style={{ display: 'flex', gap: 32 }}>
          <Link href="#features" className="lp-nav-link">Features</Link>
          <Link href="#how-it-works" className="lp-nav-link">How It Works</Link>
          <Link href="#portals" className="lp-nav-link">Portals</Link>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/admin/login">
            <button
              style={{
                background: 'transparent',
                border: 'none',
                color: color.gray600,
                fontWeight: 500,
                fontSize: 14,
                padding: '8px 16px',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: font,
                transition: 'color 0.2s',
              }}
            >
              Sign in
            </button>
          </Link>
          <Link href="/nurse/login">
            <button
              className="lp-btn-primary"
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                padding: '9px 22px',
                borderRadius: 10,
                cursor: 'pointer',
                fontFamily: font,
                letterSpacing: '-0.01em',
                boxShadow: '0 4px 12px rgba(124,58,237,0.25)',
              }}
            >
              Get started
            </button>
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HERO — Split layout with product preview
   ═══════════════════════════════════════════════════════════════════════════ */

function MockDashboard() {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 420,
        background: color.white,
        borderRadius: 20,
        boxShadow: '0 40px 80px -20px rgba(0,0,0,0.12), 0 16px 32px -8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
        overflow: 'hidden',
        animation: 'lp-float-slow 6s ease-in-out infinite',
      }}
    >
      {/* Title bar */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${color.gray100}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 11, color: color.gray400, fontFamily: mono, fontWeight: 500 }}>
            vaidyah.in/nurse/dashboard
          </span>
        </div>
      </div>
      {/* Mock content */}
      <div style={{ padding: 18 }}>
        {/* Patient card */}
        <div style={{ background: color.gray50, borderRadius: 12, padding: 14, marginBottom: 12, border: `1px solid ${color.gray100}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: color.gray800, fontFamily: font }}>Active Consultation</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: color.green, background: '#dcfce7', padding: '2px 8px', borderRadius: 20, fontFamily: font }}>LIVE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #a78bfa, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserOutlined style={{ fontSize: 14, color: '#fff' }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: color.gray800, fontFamily: font }}>Priya Sharma</div>
              <div style={{ fontSize: 10, color: color.gray400, fontFamily: font }}>Female, 34 &bull; Hindi</div>
            </div>
          </div>
          {/* Voice waveform mock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 28, padding: '0 4px' }}>
            {[14, 22, 18, 28, 12, 24, 16, 20, 26, 14, 22, 18, 24, 16, 28, 20, 12, 22, 18, 14].map((h, i) => (
              <div
                key={i}
                style={{
                  width: 3,
                  height: h,
                  borderRadius: 2,
                  background: `linear-gradient(180deg, ${color.violet}, ${color.blue})`,
                  opacity: 0.3 + (i % 3) * 0.25,
                  animation: `lp-pulse ${1.5 + (i % 4) * 0.3}s ease-in-out infinite ${i * 0.08}s`,
                }}
              />
            ))}
          </div>
        </div>
        {/* Triage badge */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, background: '#fef3c7', borderRadius: 10, padding: '10px 12px', border: '1px solid #fde68a' }}>
            <div style={{ fontSize: 10, color: color.amber, fontWeight: 600, fontFamily: font, letterSpacing: '0.04em' }}>TRIAGE</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: color.amber, fontFamily: font }}>B - Urgent</div>
          </div>
          <div style={{ flex: 1, background: color.violetLight, borderRadius: 10, padding: '10px 12px', border: '1px solid #ddd6fe' }}>
            <div style={{ fontSize: 10, color: color.violet, fontWeight: 600, fontFamily: font, letterSpacing: '0.04em' }}>SYMPTOMS</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: color.violet, fontFamily: font }}>3 found</div>
          </div>
        </div>
        {/* Extracted symptoms */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['Headache', 'Fever 101.2F', 'Fatigue'].map((s) => (
            <span
              key={s}
              style={{
                fontSize: 11,
                color: color.gray600,
                background: color.gray100,
                padding: '4px 10px',
                borderRadius: 6,
                fontWeight: 500,
                fontFamily: font,
              }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section
      className="lp-hero-section"
      style={{
        position: 'relative',
        padding: '140px 24px 100px',
        overflow: 'hidden',
        background: color.white,
      }}
    >
      {/* Subtle grid pattern */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(${color.gray200} 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
          opacity: 0.5,
          maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />
      {/* Gradient glow */}
      <div
        style={{
          position: 'absolute',
          top: '-20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 800,
          height: 600,
          background: 'radial-gradient(ellipse, rgba(124,58,237,0.06) 0%, rgba(37,99,235,0.03) 40%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div
        className="lp-hero-grid"
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 64,
          alignItems: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Left — Text */}
        <div>
          {/* Badge */}
          <Reveal>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px 6px 6px',
                borderRadius: 100,
                background: color.violetLight,
                marginBottom: 28,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: color.violet,
                }}
              >
                <ThunderboltOutlined style={{ fontSize: 11, color: '#fff' }} />
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: color.violetDark, fontFamily: font, letterSpacing: '-0.01em' }}>
                Trusted by 500+ Health Centers
              </span>
            </div>
          </Reveal>

          {/* Headline */}
          <Reveal delay={0.05}>
            <h1
              className="lp-hero-title"
              style={{
                fontSize: 56,
                fontWeight: 800,
                lineHeight: 1.08,
                color: color.gray900,
                margin: '0 0 20px',
                letterSpacing: '-0.035em',
                fontFamily: font,
              }}
            >
              Healthcare is{' '}
              <span style={{ color: color.gray900 }}>personal.</span>
              <br />
              <span
                style={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 50%, #0d9488 100%)',
                  backgroundSize: '200% auto',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  animation: 'lp-gradient 6s ease infinite',
                }}
              >
                We make it smarter.
              </span>
            </h1>
          </Reveal>

          {/* Subheadline */}
          <Reveal delay={0.1}>
            <p
              className="lp-hero-sub"
              style={{
                fontSize: 17,
                lineHeight: 1.7,
                color: color.gray500,
                margin: '0 0 36px',
                maxWidth: 480,
                fontFamily: font,
                fontWeight: 400,
                letterSpacing: '-0.01em',
              }}
            >
              AI-powered voice consultations, real-time triage, and multilingual
              support — designed for India&apos;s primary healthcare workers and the
              communities they serve.
            </p>
          </Reveal>

          {/* CTA */}
          <Reveal delay={0.15}>
            <div className="lp-hero-actions" style={{ display: 'flex', gap: 12, marginBottom: 48 }}>
              <Link href="/nurse/login" prefetch>
                <button
                  className="lp-btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                    color: '#fff',
                    border: 'none',
                    padding: '14px 28px',
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: font,
                    letterSpacing: '-0.01em',
                    boxShadow: '0 8px 24px -4px rgba(124,58,237,0.3)',
                  }}
                >
                  Start Consultation
                  <ArrowRightOutlined style={{ fontSize: 14 }} />
                </button>
              </Link>
              <Link href="#how-it-works">
                <button
                  className="lp-btn-secondary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: color.white,
                    color: color.gray700,
                    border: `1.5px solid ${color.gray200}`,
                    padding: '14px 24px',
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: font,
                    letterSpacing: '-0.01em',
                  }}
                >
                  See how it works
                </button>
              </Link>
            </div>
          </Reveal>

          {/* Stats row */}
          <Reveal delay={0.2}>
            <div
              className="lp-stats-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, auto)',
                gap: 32,
              }}
            >
              {[
                { value: '22+', label: 'Languages', icon: <GlobalOutlined /> },
                { value: '<30s', label: 'Triage time', icon: <ClockCircleOutlined /> },
                { value: '99.9%', label: 'Uptime', icon: <ThunderboltOutlined /> },
                { value: 'ABDM', label: 'Integrated', icon: <SafetyCertificateOutlined /> },
              ].map((s) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: color.gray50,
                      border: `1px solid ${color.gray100}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: color.violet,
                      fontSize: 16,
                    }}
                  >
                    {s.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: color.gray900, lineHeight: 1.2, fontFamily: font, letterSpacing: '-0.02em' }}>
                      {s.value}
                    </div>
                    <div style={{ fontSize: 12, color: color.gray400, fontWeight: 400, fontFamily: font }}>
                      {s.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        {/* Right — Product Preview */}
        <div
          className="lp-hero-visual"
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
          }}
        >
          {/* Glow behind card */}
          <div
            style={{
              position: 'absolute',
              width: '80%',
              height: '80%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)',
              filter: 'blur(40px)',
              pointerEvents: 'none',
            }}
          />
          <MockDashboard />
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FEATURES — Clean card grid
   ═══════════════════════════════════════════════════════════════════════════ */

const features: {
  icon: ReactNode;
  title: string;
  desc: string;
  accent: string;
  wide?: boolean;
}[] = [
  {
    icon: <AudioOutlined style={{ fontSize: 22 }} />,
    title: 'Voice-First Consultations',
    desc: 'Patients describe symptoms in their native language. AI transcribes, extracts entities, and builds clinical notes in real time.',
    accent: color.violet,
    wide: true,
  },
  {
    icon: <AlertOutlined style={{ fontSize: 22 }} />,
    title: 'AI-Powered Triage',
    desc: 'Rule-based and ML-driven triage classifies urgency in under 30 seconds. Emergency cases trigger instant alerts.',
    accent: color.red,
  },
  {
    icon: <TranslationOutlined style={{ fontSize: 22 }} />,
    title: 'Multilingual NLU',
    desc: 'Natural language understanding across 22+ Indian languages with automatic detection and medical entity extraction.',
    accent: color.teal,
  },
  {
    icon: <ExperimentOutlined style={{ fontSize: 22 }} />,
    title: 'Clinical Trial Matching',
    desc: 'Automatically match patients to eligible trials based on demographics, conditions, and geolocation.',
    accent: color.blue,
  },
  {
    icon: <SafetyCertificateOutlined style={{ fontSize: 22 }} />,
    title: 'ABDM Integration',
    desc: 'ABHA ID verification, consent management, and health record exchange via FHIR — fully integrated with India\'s digital health stack.',
    accent: color.green,
    wide: true,
  },
  {
    icon: <FileTextOutlined style={{ fontSize: 22 }} />,
    title: 'Smart SOAP Notes',
    desc: 'AI generates structured SOAP summaries. Nurses review and confirm, reducing documentation time by 80%.',
    accent: color.amber,
  },
];

function Features() {
  return (
    <section id="features" className="lp-section" style={{ padding: '100px 24px', background: color.gray50, borderTop: `1px solid ${color.gray100}` }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 14px',
                borderRadius: 8,
                border: `1px solid ${color.gray200}`,
                background: color.white,
                marginBottom: 20,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: color.gray500, letterSpacing: '0.06em', fontFamily: font }}>
                FEATURES
              </span>
            </div>
            <h2
              className="lp-section-title"
              style={{
                fontSize: 40,
                fontWeight: 700,
                color: color.gray900,
                margin: '0 0 14px',
                letterSpacing: '-0.03em',
                fontFamily: font,
                lineHeight: 1.15,
              }}
            >
              Everything you need for
              <br />modern healthcare
            </h2>
            <p className="lp-section-sub" style={{ fontSize: 16, color: color.gray500, maxWidth: 480, margin: '0 auto', lineHeight: 1.6, fontFamily: font, fontWeight: 400 }}>
              A comprehensive platform transforming how primary healthcare is delivered across India.
            </p>
          </div>
        </Reveal>

        <div
          className="lp-features-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
          }}
        >
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.05}>
              <div
                className={`lp-card ${f.wide ? 'lp-feat-wide' : ''}`}
                style={{
                  gridColumn: f.wide ? 'span 2' : 'span 1',
                  padding: 28,
                  borderRadius: 16,
                  border: `1px solid ${color.gray200}`,
                  background: color.white,
                  height: '100%',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    border: `1px solid ${color.gray200}`,
                    background: color.gray50,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 18,
                    color: f.accent,
                  }}
                >
                  {f.icon}
                </div>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: color.gray900,
                    margin: '0 0 8px',
                    fontFamily: font,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {f.title}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    color: color.gray500,
                    lineHeight: 1.65,
                    margin: 0,
                    fontFamily: font,
                    fontWeight: 400,
                  }}
                >
                  {f.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HOW IT WORKS — Numbered steps with connecting line
   ═══════════════════════════════════════════════════════════════════════════ */

const steps = [
  {
    num: '1',
    title: 'Patient Arrives',
    desc: 'Nurse registers the patient and begins voice-based consultation in their native language.',
    accent: color.violet,
  },
  {
    num: '2',
    title: 'AI Processes Speech',
    desc: 'Voice is transcribed, symptoms extracted, and medical entities mapped to ICD-10 codes.',
    accent: color.blue,
  },
  {
    num: '3',
    title: 'Triage & Summary',
    desc: 'AI generates a triage score and structured SOAP note. Nurse reviews within seconds.',
    accent: color.teal,
  },
  {
    num: '4',
    title: 'Record & Notify',
    desc: 'Records sync to ABDM. Patients receive summaries. Emergency alerts dispatch if needed.',
    accent: color.amber,
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="lp-section" style={{ padding: '100px 24px', background: color.white }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 72 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 14px',
                borderRadius: 8,
                border: `1px solid ${color.gray200}`,
                background: color.white,
                marginBottom: 20,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: color.gray500, letterSpacing: '0.06em', fontFamily: font }}>
                HOW IT WORKS
              </span>
            </div>
            <h2
              className="lp-section-title"
              style={{
                fontSize: 40,
                fontWeight: 700,
                color: color.gray900,
                margin: '0 0 14px',
                letterSpacing: '-0.03em',
                fontFamily: font,
                lineHeight: 1.15,
              }}
            >
              From voice to verified
              <br />diagnosis in minutes
            </h2>
          </div>
        </Reveal>

        <div style={{ position: 'relative' }}>
          {/* Connecting line */}
          <div
            className="lp-timeline-line"
            style={{
              position: 'absolute',
              top: 28,
              left: 'calc(12.5% + 20px)',
              right: 'calc(12.5% + 20px)',
              height: 2,
              background: `linear-gradient(90deg, ${color.violet}, ${color.blue}, ${color.teal}, ${color.amber})`,
              borderRadius: 1,
              opacity: 0.15,
            }}
          />

          <div
            className="lp-steps-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 24,
              position: 'relative',
            }}
          >
            {steps.map((step, i) => (
              <Reveal key={step.num} delay={i * 0.08}>
                <div className="lp-step" style={{ textAlign: 'center' }}>
                  <div
                    className="lp-step-num"
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 16,
                      background: color.white,
                      border: `2px solid ${step.accent}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 24px',
                      position: 'relative',
                      zIndex: 2,
                      transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s ease',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        color: step.accent,
                        fontFamily: font,
                      }}
                    >
                      {step.num}
                    </span>
                  </div>
                  <h4
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: color.gray900,
                      margin: '0 0 8px',
                      fontFamily: font,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {step.title}
                  </h4>
                  <p
                    style={{
                      fontSize: 14,
                      color: color.gray500,
                      lineHeight: 1.65,
                      margin: 0,
                      fontFamily: font,
                      fontWeight: 400,
                    }}
                  >
                    {step.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PORTALS — Premium cards
   ═══════════════════════════════════════════════════════════════════════════ */

const portals = [
  {
    key: 'nurse',
    icon: <MedicineBoxOutlined style={{ fontSize: 24, color: '#fff' }} />,
    title: 'Nurse Portal',
    subtitle: 'Frontline Care',
    desc: 'Voice consultations, vitals recording, AI triage, SOAP note generation, and emergency alerts.',
    features: ['Voice consultation capture', 'AI-powered triage scoring', 'SOAP note review', 'Emergency alert dispatch'],
    accent: color.teal,
    gradient: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)',
    href: '/nurse/login',
  },
  {
    key: 'admin',
    icon: <DashboardOutlined style={{ fontSize: 24, color: '#fff' }} />,
    title: 'Admin Portal',
    subtitle: 'System Management',
    desc: 'Full oversight of health centers, user management, analytics, system health, and audit logs.',
    features: ['Health center management', 'Real-time analytics', 'User & role management', 'System health monitoring'],
    accent: '#1e3a5f',
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 100%)',
    href: '/admin/login',
  },
  {
    key: 'patient',
    icon: <UserOutlined style={{ fontSize: 24, color: '#fff' }} />,
    title: 'Patient Portal',
    subtitle: 'Personal Health',
    desc: 'Access health records, consultation history, clinical trials, ABHA profile, and notifications.',
    features: ['Health record access', 'Clinical trial search', 'ABHA management', 'Health notifications'],
    accent: color.violet,
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)',
    href: '/patient/login',
  },
];

function Portals() {
  return (
    <section
      id="portals"
      className="lp-section"
      style={{
        padding: '100px 24px',
        background: color.gray50,
        borderTop: `1px solid ${color.gray100}`,
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 14px',
                borderRadius: 8,
                border: `1px solid ${color.gray200}`,
                background: color.white,
                marginBottom: 20,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: color.gray500, letterSpacing: '0.06em', fontFamily: font }}>
                PORTALS
              </span>
            </div>
            <h2
              className="lp-section-title"
              style={{
                fontSize: 40,
                fontWeight: 700,
                color: color.gray900,
                margin: '0 0 14px',
                letterSpacing: '-0.03em',
                fontFamily: font,
                lineHeight: 1.15,
              }}
            >
              One platform, three experiences
            </h2>
            <p className="lp-section-sub" style={{ fontSize: 16, color: color.gray500, maxWidth: 480, margin: '0 auto', lineHeight: 1.6, fontFamily: font, fontWeight: 400 }}>
              Role-based interfaces designed for the unique needs of nurses, administrators, and patients.
            </p>
          </div>
        </Reveal>

        <div
          className="lp-portals-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 20,
          }}
        >
          {portals.map((p, i) => (
            <Reveal key={p.key} delay={i * 0.08}>
              <div
                className="lp-portal-card"
                style={{
                  borderRadius: 20,
                  overflow: 'hidden',
                  background: color.white,
                  border: `1px solid ${color.gray200}`,
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                }}
              >
                {/* Header */}
                <div
                  style={{
                    background: p.gradient,
                    padding: '32px 28px 26px',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Decorative element */}
                  <div
                    style={{
                      position: 'absolute',
                      top: -40,
                      right: -40,
                      width: 120,
                      height: 120,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.07)',
                    }}
                  />
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 16,
                    }}
                  >
                    {p.icon}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', marginBottom: 4, fontFamily: font }}>
                    {p.subtitle.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', fontFamily: font, letterSpacing: '-0.02em' }}>
                    {p.title}
                  </div>
                </div>

                {/* Body */}
                <div style={{ padding: '24px 28px 28px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <p style={{ fontSize: 14, color: color.gray500, lineHeight: 1.65, margin: '0 0 20px', fontFamily: font }}>
                    {p.desc}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                    {p.features.map((f) => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <CheckCircleFilled style={{ color: p.accent, fontSize: 13, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: color.gray600, fontFamily: font }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <Link href={p.href} prefetch style={{ display: 'block', marginTop: 24 }}>
                    <button
                      className="lp-btn-primary"
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        background: p.gradient,
                        color: '#fff',
                        border: 'none',
                        padding: '13px 20px',
                        borderRadius: 12,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: font,
                        boxShadow: `0 4px 12px ${p.accent}20`,
                      }}
                    >
                      Sign In
                      <ArrowRightOutlined style={{ fontSize: 13 }} />
                    </button>
                  </Link>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CTA SECTION
   ═══════════════════════════════════════════════════════════════════════════ */

function CTASection() {
  return (
    <section className="lp-cta-section" style={{ padding: '100px 24px', background: color.white }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Reveal>
          <div
            className="lp-cta-card"
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              borderRadius: 24,
              padding: '72px 48px',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Decorative gradients */}
            <div
              style={{
                position: 'absolute',
                top: -60,
                right: -60,
                width: 300,
                height: 300,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: -80,
                left: -40,
                width: 350,
                height: 350,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />

            <div style={{ position: 'relative', zIndex: 1 }}>
              <h2
                className="lp-cta-title"
                style={{
                  fontSize: 40,
                  fontWeight: 700,
                  color: '#fff',
                  margin: '0 0 16px',
                  letterSpacing: '-0.03em',
                  fontFamily: font,
                  lineHeight: 1.15,
                }}
              >
                Ready to transform healthcare delivery?
              </h2>
              <p
                style={{
                  fontSize: 16,
                  color: 'rgba(255,255,255,0.5)',
                  maxWidth: 480,
                  margin: '0 auto 36px',
                  lineHeight: 1.6,
                  fontFamily: font,
                }}
              >
                Join 500+ health centers already using Vaidyah to deliver
                faster, smarter, and more accessible care.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Link href="/nurse/login" prefetch>
                  <button
                    className="lp-btn-primary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                      color: '#fff',
                      border: 'none',
                      padding: '14px 32px',
                      borderRadius: 12,
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: font,
                      boxShadow: '0 8px 24px -4px rgba(124,58,237,0.4)',
                    }}
                  >
                    Get started free
                    <ArrowRightOutlined style={{ fontSize: 14 }} />
                  </button>
                </Link>
                <Link href="#portals">
                  <button
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.85)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      padding: '14px 28px',
                      borderRadius: 12,
                      fontSize: 15,
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: font,
                      backdropFilter: 'blur(8px)',
                      transition: 'all 0.2s',
                    }}
                  >
                    View all portals
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════════════════════════════════════ */

function Footer() {
  return (
    <footer
      style={{
        background: color.gray950,
        padding: '64px 24px 32px',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div
          className="lp-footer-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1.8fr 1fr 1fr 1.2fr',
            gap: 48,
            marginBottom: 48,
          }}
        >
          {/* Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <HeartOutlined style={{ fontSize: 14, color: '#fff' }} />
              </div>
              <span style={{ color: '#fff', fontSize: 18, fontWeight: 700, fontFamily: font, letterSpacing: '-0.02em' }}>
                Vaidyah
              </span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.35)', lineHeight: 1.7, fontSize: 14, margin: '0 0 14px', maxWidth: 260, fontFamily: font }}>
              AI-powered healthcare platform bridging the gap between
              technology and primary care delivery across India.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: 12, margin: 0, fontFamily: font }}>
              Private by design. No raw audio stored.
            </p>
          </div>

          {/* Portals */}
          <div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: 12, marginBottom: 18, letterSpacing: '0.06em', fontFamily: font }}>
              PORTALS
            </div>
            <Link href="/nurse/login" className="lp-footer-link">Nurse Portal</Link>
            <Link href="/admin/login" className="lp-footer-link">Admin Portal</Link>
            <Link href="/patient/login" className="lp-footer-link">Patient Portal</Link>
          </div>

          {/* Features */}
          <div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: 12, marginBottom: 18, letterSpacing: '0.06em', fontFamily: font }}>
              FEATURES
            </div>
            {['Voice AI', 'Triage Engine', 'ABDM Integration', 'Trial Matching'].map((t) => (
              <span key={t} className="lp-footer-link">{t}</span>
            ))}
          </div>

          {/* Compliance */}
          <div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: 12, marginBottom: 18, letterSpacing: '0.06em', fontFamily: font }}>
              COMPLIANCE
            </div>
            {['ABDM Certified', 'HIPAA Compliant', 'DISHA Ready', 'SOC 2 Type II'].map((c) => (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <CheckCircleFilled style={{ color: '#22c55e', fontSize: 11 }} />
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: font }}>{c}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: 24,
            textAlign: 'center',
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, fontFamily: font }}>
            &copy; {new Date().getFullYear()} Vaidyah Healthcare Platform &bull; Built with care for India
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE (auth logic preserved exactly)
   ═══════════════════════════════════════════════════════════════════════════ */

export default function RootPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const portalType = useAuthStore((s) => s.portalType);
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) return;
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (isAuthenticated && portalType) {
      const routes = { admin: '/admin/dashboard', nurse: '/nurse/dashboard', patient: '/patient/home' };
      router.replace(routes[portalType] ?? '/');
    }
  }, [hydrated, isAuthenticated, portalType, router]);

  if (!hydrated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (isAuthenticated && portalType) return null;

  return (
    <div style={{ fontFamily: font, WebkitFontSmoothing: 'antialiased' }}>
      <LandingStyles />
      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <Portals />
      <CTASection />
      <Footer />
    </div>
  );
}
