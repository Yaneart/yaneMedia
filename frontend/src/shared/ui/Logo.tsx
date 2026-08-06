type LogoProps = {
  compact?: boolean;
  className?: string;
};

export function Logo({ compact = false, className = '' }: LogoProps) {
  return (
    <span aria-label="yaneMedia" className={`inline-flex items-baseline leading-none ${className}`}>
      <span className="text-xl font-extrabold tracking-[-0.06em] text-text-primary">yane</span>
      {!compact && (
        <span className="ml-1 text-xs font-medium tracking-tight text-text-secondary">Media</span>
      )}
    </span>
  );
}
