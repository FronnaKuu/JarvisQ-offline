// ---- Markdown Styles ------------------------------------------------------
// Theme-driven style map for react-native-markdown-display. All colors and
// spacing come from AppTheme — no hardcoded values. Used only for assistant
// messages (user bubbles stay plain text).

import { StyleSheet } from 'react-native';
import { AppTheme } from './theme';

export const markdownStyles = StyleSheet.create({
  body: {
    color: AppTheme.colors.onBackground,
    fontSize: AppTheme.typography.bodyMedium.fontSize,
    lineHeight: 22,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: AppTheme.spacing.xs,
  },
  heading1: {
    color: AppTheme.colors.onBackground,
    fontSize: AppTheme.typography.titleLarge.fontSize,
    fontWeight: AppTheme.typography.titleLarge.fontWeight,
    marginTop: AppTheme.spacing.sm,
    marginBottom: AppTheme.spacing.xs,
  },
  heading2: {
    color: AppTheme.colors.onBackground,
    fontSize: AppTheme.typography.titleMedium.fontSize,
    fontWeight: AppTheme.typography.titleMedium.fontWeight,
    marginTop: AppTheme.spacing.sm,
    marginBottom: AppTheme.spacing.xs,
  },
  heading3: {
    color: AppTheme.colors.onBackground,
    fontSize: AppTheme.typography.bodyLarge.fontSize,
    fontWeight: '700',
    marginTop: AppTheme.spacing.sm,
    marginBottom: AppTheme.spacing.xs,
  },
  strong: {
    color: AppTheme.colors.onBackground,
    fontWeight: '700',
  },
  em: {
    fontStyle: 'italic',
  },
  link: {
    color: AppTheme.colors.primary,
    textDecorationLine: 'underline',
  },
  bullet_list: {
    marginBottom: AppTheme.spacing.xs,
  },
  ordered_list: {
    marginBottom: AppTheme.spacing.xs,
  },
  list_item: {
    marginBottom: AppTheme.spacing.xxs,
  },
  code_inline: {
    color: AppTheme.colors.onSurfaceVariant,
    backgroundColor: AppTheme.colors.surface,
    borderRadius: AppTheme.radius.sm,
    paddingHorizontal: AppTheme.spacing.xs,
    fontFamily: 'monospace',
  },
  code_block: {
    color: AppTheme.colors.onSurfaceVariant,
    backgroundColor: AppTheme.colors.surface,
    borderRadius: AppTheme.radius.md,
    padding: AppTheme.spacing.sm,
    fontFamily: 'monospace',
  },
  fence: {
    color: AppTheme.colors.onSurfaceVariant,
    backgroundColor: AppTheme.colors.surface,
    borderRadius: AppTheme.radius.md,
    padding: AppTheme.spacing.sm,
    fontFamily: 'monospace',
  },
  blockquote: {
    backgroundColor: AppTheme.colors.surface,
    borderLeftColor: AppTheme.colors.primary,
    borderLeftWidth: 3,
    paddingHorizontal: AppTheme.spacing.sm,
    paddingVertical: AppTheme.spacing.xs,
    marginVertical: AppTheme.spacing.xs,
  },
  hr: {
    backgroundColor: AppTheme.colors.outline,
    height: StyleSheet.hairlineWidth,
    marginVertical: AppTheme.spacing.sm,
  },
  table: {
    borderColor: AppTheme.colors.outline,
  },
  th: {
    color: AppTheme.colors.onBackground,
    fontWeight: '700',
    padding: AppTheme.spacing.xs,
  },
  td: {
    color: AppTheme.colors.onBackground,
    padding: AppTheme.spacing.xs,
  },
});
