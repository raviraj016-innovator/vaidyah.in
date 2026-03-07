'use client';

import { Button, Result } from 'antd';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Result
        status="error"
        title="Error Loading Page"
        subTitle="Something went wrong. Please try again or contact support."
        extra={
          <Button type="primary" onClick={reset}>
            Retry
          </Button>
        }
      />
    </div>
  );
}
