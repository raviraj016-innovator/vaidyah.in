'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Typography, Card, Space } from 'antd';
import { WarningOutlined, ReloadOutlined } from '@ant-design/icons';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component.
 * Catches render errors in child tree and shows a recovery UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, maxWidth: 600, margin: '0 auto' }}>
          <Card style={{ textAlign: 'center' }}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <WarningOutlined style={{ fontSize: 48, color: '#dc2626' }} />
              <Typography.Title level={4} style={{ margin: 0 }}>
                {this.props.fallbackTitle ?? 'Something went wrong'}
              </Typography.Title>
              <Typography.Text type="secondary">
                {this.props.fallbackMessage ??
                  'An unexpected error occurred. Your session data is preserved. Please try again.'}
              </Typography.Text>
              {this.state.error && (
                <Typography.Text
                  code
                  style={{ fontSize: 12, display: 'block', maxHeight: 80, overflow: 'auto' }}
                >
                  {this.state.error.message}
                </Typography.Text>
              )}
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                size="large"
                onClick={this.handleRetry}
              >
                Retry
              </Button>
            </Space>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
