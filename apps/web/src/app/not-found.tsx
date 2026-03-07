import Link from 'next/link';

export default function NotFound() {
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
        404
      </div>
      <p style={{ fontSize: 16, color: '#64748b', margin: 0, textAlign: 'center' }}>
        Sorry, the page you visited does not exist.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 8,
          padding: '10px 24px',
          background: '#7c3aed',
          color: '#fff',
          borderRadius: 10,
          textDecoration: 'none',
          fontSize: 14,
          fontWeight: 600,
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        Back to Home
      </Link>
    </div>
  );
}
