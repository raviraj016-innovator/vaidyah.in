import type { CSSProperties } from 'react';

const shimmer: CSSProperties = {
  background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
  backgroundSize: '200% 100%',
  animation: 'skel-shimmer 1.5s ease-in-out infinite',
  borderRadius: 8,
};

function Bar({ width = '100%', height = 16 }: { width?: string | number; height?: number }) {
  return <div style={{ ...shimmer, width, height, marginBottom: 12 }} />;
}

function CardSkel({ rows = 2, style }: { rows?: number; style?: CSSProperties }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 24, border: '1px solid #f3f4f6', ...style }}>
      <Bar width="40%" height={20} />
      {Array.from({ length: rows }, (_, i) => (
        <Bar key={i} width={i === rows - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

export function SkeletonLoader({ cards = 3, columns = 1 }: { cards?: number; columns?: number }) {
  return (
    <div style={{ padding: 24 }}>
      <Bar width="60%" height={24} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`,
        gap: 16,
        marginTop: 8,
      }}>
        {Array.from({ length: cards }, (_, i) => (
          <CardSkel key={i} rows={i === 0 ? 3 : 2} />
        ))}
      </div>
      <style>{`@keyframes skel-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
    </div>
  );
}
