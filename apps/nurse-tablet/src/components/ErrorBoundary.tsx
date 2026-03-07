import React, { Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, TOUCH_TARGET } from '../config/theme';

interface Props {
  children: React.ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.props.fallbackMessage ?? 'An unexpected error occurred. Please try again.'}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={this.handleRetry} activeOpacity={0.8}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.background,
  },
  title: {
    ...TYPOGRAPHY.styles.h3,
    color: COLORS.emergency[500],
    marginBottom: SPACING.md,
  },
  message: {
    ...TYPOGRAPHY.styles.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  retryButton: {
    backgroundColor: COLORS.primary[500],
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.base,
    borderRadius: BORDER_RADIUS.lg,
    minHeight: TOUCH_TARGET.comfortable,
    justifyContent: 'center',
  },
  retryText: {
    ...TYPOGRAPHY.styles.buttonLarge,
    color: COLORS.textOnPrimary,
  },
});
