'use client';

import React from 'react';
import Link from 'next/link';
import { HeartOutlined, SafetyCertificateOutlined } from '@ant-design/icons';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        .auth-layout { min-height: 100vh; display: flex; }
        .auth-brand { flex: 0 0 440px; background: #0f172a; padding: 48px 44px; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden; }
        .auth-form { flex: 1; display: flex; align-items: center; justify-content: center; padding: 32px; background: #fafafa; }
        @media (max-width: 900px) {
          .auth-brand { display: none; }
          .auth-form { padding: 24px 16px; }
        }
        @media (max-width: 480px) {
          .auth-form .ant-card-body { padding: 24px 20px !important; }
        }
      `}</style>

      <div className="auth-layout">
        {/* Left Panel — Branding */}
        <div className="auth-brand">
          {/* Decorative gradient orbs */}
          <div
            style={{
              position: 'absolute',
              top: '-15%',
              right: '-20%',
              width: 400,
              height: 400,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '-10%',
              left: '-15%',
              width: 350,
              height: 350,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 72 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
                }}
              >
                <HeartOutlined style={{ fontSize: 16, color: '#fff' }} />
              </div>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
                Vaidyah
              </span>
            </Link>

            <h2
              style={{
                fontSize: 34,
                fontWeight: 700,
                lineHeight: 1.2,
                margin: '0 0 16px',
                color: '#fff',
                letterSpacing: '-0.03em',
              }}
            >
              Healthcare is personal.{' '}
              <span
                style={{
                  background: 'linear-gradient(135deg, #a78bfa, #60a5fa)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                We make it smarter.
              </span>
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, lineHeight: 1.7, margin: 0, maxWidth: 340 }}>
              AI-powered voice consultations, real-time triage, and
              multilingual support for India&apos;s healthcare workers.
            </p>
          </div>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', gap: 32, marginBottom: 24 }}>
              {[
                { val: '22+', label: 'Languages' },
                { val: '<30s', label: 'Triage' },
                { val: '99.9%', label: 'Uptime' },
              ].map((s) => (
                <div key={s.label}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>{s.val}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <SafetyCertificateOutlined style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }} />
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, margin: 0, letterSpacing: '0.02em' }}>
                ABDM Certified &bull; HIPAA Compliant &bull; DISHA Ready
              </p>
            </div>
          </div>
        </div>

        {/* Right Panel — Form */}
        <div className="auth-form">
          {children}
        </div>
      </div>
    </>
  );
}
