export default function Loading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{
        width: 36, height: 36, border: '3px solid #f3f4f6',
        borderTopColor: '#7c3aed', borderRadius: '50%',
        animation: 'app-spin 0.6s linear infinite',
      }} />
      <style>{`@keyframes app-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
