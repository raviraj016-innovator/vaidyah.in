'use client';

import { App } from 'antd';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { useCallback } from 'react';

interface ConfirmModalOptions {
  title: string;
  content: string;
  onOk: () => void | Promise<void>;
  okText?: string;
  cancelText?: string;
  danger?: boolean;
}

export function useConfirmModal() {
  const { modal } = App.useApp();

  const showConfirm = useCallback(
    ({
      title,
      content,
      onOk,
      okText = 'Confirm',
      cancelText = 'Cancel',
      danger = false,
    }: ConfirmModalOptions) => {
      modal.confirm({
        title,
        icon: <ExclamationCircleFilled />,
        content,
        okText,
        cancelText,
        okButtonProps: { danger },
        onOk,
      });
    },
    [modal],
  );

  return showConfirm;
}
