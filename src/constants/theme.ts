/**
 * Aperiv Field color system.
 *
 * Brand navy #0B1120 (also the splash / adaptive-icon background) anchors the
 * dark surface ramp. Every text/background pair below meets WCAG 4.5:1 in its
 * own scheme; filled controls pair semantic fills with dedicated "on" colors.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const BrandNavy = '#0B1120';

export const Colors = {
  light: {
    text: '#0B1120',
    textSecondary: '#475569',
    background: '#F2F5F9',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E4E9F1',
    border: '#D4DCE7',
    accent: '#0F766E',
    onAccent: '#FFFFFF',
    accentText: '#0B5A52',
    success: '#15803D',
    warning: '#B45309',
    danger: '#B91C1C',
    successFill: '#15803D',
    onSuccessFill: '#FFFFFF',
    warningFill: '#B45309',
    onWarningFill: '#FFFFFF',
    dangerFill: '#B91C1C',
    onDangerFill: '#FFFFFF',
  },
  dark: {
    text: '#F2F5FB',
    textSecondary: '#94A3B8',
    background: BrandNavy,
    backgroundElement: '#151E31',
    backgroundSelected: '#212C45',
    border: '#32405E',
    accent: '#14B8A6',
    onAccent: '#042F2E',
    accentText: '#5EEAD4',
    success: '#4ADE80',
    warning: '#FBBF24',
    danger: '#F87171',
    successFill: '#4ADE80',
    onSuccessFill: '#052E16',
    warningFill: '#FBBF24',
    onWarningFill: '#451A03',
    dangerFill: '#F87171',
    onDangerFill: '#450A0A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type Theme = (typeof Colors)[keyof typeof Colors];

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Minimum touch target for all interactive controls (Apple HIG is 44pt). */
export const MinTouchTarget = 44;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
