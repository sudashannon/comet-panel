interface Props {
  visualized: boolean
  designReviewed: boolean
  verifyReviewed: boolean
}

function Pill({ testId, tone, label }: { testId: string; tone: 'ok' | 'neutral'; label: string }) {
  const cls =
    tone === 'ok'
      ? 'bg-[color-mix(in_srgb,var(--color-success)_12%,var(--color-surface))] text-[var(--color-success)]'
      : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)]'
  return (
    <span
      data-testid={testId}
      data-tone={tone}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      {tone === 'ok' ? '✓ ' : '○ '}
      {label}
    </span>
  )
}

export function ReviewBadges({ visualized, designReviewed, verifyReviewed }: Props) {
  return (
    <div className="flex gap-2">
      <Pill testId="badge-visualized" tone={visualized ? 'ok' : 'neutral'} label="可视化" />
      <Pill testId="badge-design-reviewed" tone={designReviewed ? 'ok' : 'neutral'} label="设计已审" />
      <Pill testId="badge-verify-reviewed" tone={verifyReviewed ? 'ok' : 'neutral'} label="验证已审" />
    </div>
  )
}
