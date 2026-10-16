/**
 * Small inline icons. They are decorative (`aria-hidden`): every status they mark is also written as a
 * word next to them, so colour and shape are never the only signal (WCAG 1.4.1).
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, className = 'size-4', ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      {...props}
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 8.5l3 3 7-7" />
  </Icon>
);

export const CrossIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);

export const SkipIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 4l5 4-5 4M9 4l5 4-5 4" />
  </Icon>
);

export const WarningIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 2l6.5 11.5h-13z" />
    <path d="M8 6.5v3M8 11.6v.1" />
  </Icon>
);

export const ClockIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.5V8l2.5 1.5" />
  </Icon>
);

export const PersonIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="8" cy="5" r="2.5" />
    <path d="M3 14c.5-3 2.5-4.5 5-4.5s4.5 1.5 5 4.5" />
  </Icon>
);

export const ArrowRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2.5 8h11M9.5 4l4 4-4 4" />
  </Icon>
);

/** Rotating arc; the global reduced-motion rule in index.css stops the rotation. */
export const SpinnerIcon = ({ className = 'size-4', ...props }: IconProps) => (
  <Icon className={`animate-spin ${className}`} {...props}>
    <path d="M8 2a6 6 0 1 1-6 6" />
  </Icon>
);
