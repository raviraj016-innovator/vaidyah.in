'use client';

import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        flexDirection: 'column',
        gap: 12,
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          fontSize: 72,
          fontWeight: 800,
          color: '#e5e7eb',
          lineHeight: 1,
          letterSpacing: '-0.04em',
        }}
      >
        500
      </div>
      <p style={{ fontSize: 16, color: '#64748b', margin: 0, textAlign: 'center' }}>
        An unexpected error occurred. Please try again.
      </p>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={reset}
          style={{
            padding: '10px 24px',
            background: '#7c3aed',
            color: '#fff',
            borderRadius: 10,
            border: 'none',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          Try Again
        </button>
        <Link
          href="/"
          style={{
            padding: '10px 24px',
            background: '#fff',
            color: '#475569',
            borderRadius: 10,
            border: '1px solid #e5e7eb',
            fontSize: 14,
            fontWeight: 500,
            textDecoration: 'none',
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
