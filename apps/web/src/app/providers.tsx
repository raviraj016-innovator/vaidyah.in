'use client';

import '@ant-design/v5-patch-for-react-19';
import React, { useState } from 'react';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const vaidyahTheme = {
  token: {
    colorPrimary: '#7c3aed',
    colorLink: '#7c3aed',
    colorLinkHover: '#6d28d9',
    borderRadius: 10,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    colorSuccess: '#16a34a',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    colorInfo: '#2563eb',
    fontSize: 14,
    controlHeight: 40,
    colorBgContainer: '#ffffff',
    colorBgLayout: '#fafafa',
    colorBorder: '#e5e7eb',
    colorBorderSecondary: '#f3f4f6',
    colorText: '#0f172a',
    colorTextSecondary: '#64748b',
    colorTextTertiary: '#94a3b8',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02)',
    boxShadowSecondary: '0 4px 12px rgba(0,0,0,0.06)',
    lineHeight: 1.6,
  },
  algorithm: theme.defaultAlgorithm,
  components: {
    Button: {
      borderRadius: 10,
      controlHeight: 40,
      fontWeight: 500,
      primaryShadow: '0 2px 8px rgba(124,58,237,0.2)',
    },
    Card: {
      borderRadiusLG: 14,
      paddingLG: 24,
    },
    Input: {
      borderRadius: 10,
      controlHeight: 42,
    },
    Select: {
      borderRadius: 10,
      controlHeight: 42,
    },
    Menu: {
      itemBorderRadius: 8,
      itemMarginInline: 8,
      itemPaddingInline: 16,
    },
    Table: {
      borderRadius: 12,
      headerBg: '#f9fafb',
    },
    Modal: {
      borderRadiusLG: 16,
    },
    Dropdown: {
      borderRadiusLG: 12,
    },
    Badge: {
      fontSizeSM: 10,
    },
    Tag: {
      borderRadiusSM: 6,
    },
    Alert: {
      borderRadiusLG: 12,
    },
    Statistic: {
      contentFontSize: 28,
    },
  },
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ConfigProvider theme={vaidyahTheme}>
      <QueryClientProvider client={queryClient}>
        <AntApp>
          {children}
        </AntApp>
      </QueryClientProvider>
    </ConfigProvider>
  );
}
