'use client';

import { Skeleton, Card, Row, Col } from 'antd';

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Row gutter={[16, 16]}>
      {Array.from({ length: count }).map((_, i) => (
        <Col xs={24} sm={12} lg={Math.floor(24 / count)} key={i}>
          <Card>
            <Skeleton active paragraph={{ rows: 2 }} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card>
      <Skeleton active title={{ width: '100%' }} paragraph={{ rows, width: Array(rows).fill('100%') }} />
    </Card>
  );
}

export function ChartSkeleton() {
  return (
    <Card>
      <Skeleton.Node active style={{ width: '100%', height: 300 }}>
        <div style={{ width: '100%', height: 300 }} />
      </Skeleton.Node>
    </Card>
  );
}
