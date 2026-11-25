import type { FC, SVGProps } from 'react';

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  color?: string;
  strokeWidth?: number | string;
  fill?: string;
}

export type LucideIcon = FC<IconProps>;

function baseProps(props: IconProps) {
  const {
    size = 24,
    color = 'currentColor',
    strokeWidth = 2,
    fill = 'none',
    className = '',
    ...rest
  } = props;

  return {
    xmlns: 'http://www.w3.org/2000/svg',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill,
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    ...rest,
  };
}

export const Zap: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

export const LayoutDashboard: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <rect width="7" height="9" x="3" y="3" rx="1" />
    <rect width="7" height="5" x="14" y="3" rx="1" />
    <rect width="7" height="9" x="14" y="12" rx="1" />
    <rect width="7" height="5" x="3" y="16" rx="1" />
  </svg>
);

export const Map: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
    <line x1="9" x2="9" y1="3" y2="18" />
    <line x1="15" x2="15" y1="6" y2="21" />
  </svg>
);

export const Database: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5V19A9 3 0 0 0 21 19V5" />
    <path d="M3 12A9 3 0 0 0 21 12" />
  </svg>
);

export const ClipboardCheck: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="m9 14 2 2 4-4" />
  </svg>
);

export const ShieldCheck: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const X: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export const Bell: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

export const UserCircle: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="10" r="3" />
    <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
  </svg>
);

export const LogOut: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" x2="9" y1="12" y2="12" />
  </svg>
);

export const Menu: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <line x1="4" x2="20" y1="12" y2="12" />
    <line x1="4" x2="20" y1="6" y2="6" />
    <line x1="4" x2="20" y1="18" y2="18" />
  </svg>
);

export const Search: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const Eye: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOff: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
    <path d="M17.479 17.499A10.75 10.75 0 0 1 2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.25-5.08" />
    <line x1="2" x2="22" y1="2" y2="22" />
  </svg>
);

export const ChevronDown: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const DatabaseBackup: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 12a9 3 0 0 0 5 2.69" />
    <path d="M21 9.3V5" />
    <path d="M3 5v14a9 3 0 0 0 6.47 2.88" />
    <path d="M12 12v4h4" />
    <path d="M13 20a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L12 16" />
  </svg>
);

export const Download: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </svg>
);

export const FileUp: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M12 12v6" />
    <path d="m15 15-3-3-3 3" />
  </svg>
);

export const RefreshCw: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);

export const ArrowDown: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </svg>
);

export const ArrowUp: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </svg>
);

export const ArrowUpDown: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="m21 16-4 4-4-4" />
    <path d="M17 20V4" />
    <path d="m3 8 4-4 4 4" />
    <path d="M7 4v16" />
  </svg>
);

export const MapPinned: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M18 8c0 4.5-6 9-6 9s-6-4.5-6-9a6 6 0 0 1 12 0" />
    <circle cx="12" cy="8" r="2" />
    <path d="M8.835 14H5a1 1 0 0 0-.9.6l-2 4A1 1 0 0 0 3 20h18a1 1 0 0 0 .9-1.4l-2-4a1 1 0 0 0-.9-.6h-3.835" />
  </svg>
);

export const LocateFixed: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <line x1="2" x2="5" y1="12" y2="12" />
    <line x1="19" x2="22" y1="12" y2="12" />
    <line x1="12" x2="12" y1="2" y2="5" />
    <line x1="12" x2="12" y1="19" y2="22" />
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const Plus: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <line x1="12" x2="12" y1="5" y2="19" />
    <line x1="5" x2="19" y1="12" y2="12" />
  </svg>
);

export const Pencil: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

export const Trash2: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" x2="10" y1="11" y2="17" />
    <line x1="14" x2="14" y1="11" y2="17" />
  </svg>
);

export const Save: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

export const Check: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const RotateCcw: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

export const Circle: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <circle cx="12" cy="12" r="10" />
  </svg>
);

export const Square: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </svg>
);

export const Triangle: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
  </svg>
);

export const Diamond: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M12 2 2 12l10 10 10-10Z" />
  </svg>
);

export const Tower: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M4 22h16" />
    <path d="m7 22 4-18h2l4 18" />
    <path d="M6 14h12" />
    <path d="M8 8h8" />
    <path d="m9 14 3-6 3 6" />
    <path d="m8 22 4-8 4 8" />
  </svg>
);

export const Transformer: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <circle cx="9" cy="12" r="6" />
    <circle cx="15" cy="12" r="6" />
    <path d="M3 12h0" />
    <path d="M21 12h0" />
  </svg>
);

export const Pole: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <line x1="12" x2="12" y1="2" y2="22" />
    <line x1="5" x2="19" y1="6" y2="6" />
    <line x1="7" x2="17" y1="10" y2="10" />
    <circle cx="5" cy="6" r="1" />
    <circle cx="19" cy="6" r="1" />
  </svg>
);

export const Gauge: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="m12 14 4-4" />
    <path d="M3.34 19a10 10 0 1 1 17.32 0" />
  </svg>
);

export const Sun: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

export const Layers: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
    <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
    <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
  </svg>
);

export const MapPin: FC<IconProps> = (props) => (
  <svg {...baseProps(props)}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export const LayerIconGlyph: FC<{
  icon?: string;
  size?: number | string;
  className?: string;
  color?: string;
  fill?: string;
  strokeWidth?: number | string;
}> = ({ icon, size = 14, className, color = 'currentColor', fill = 'none', strokeWidth = 2 }) => {
  const p = { size, className, color, fill, strokeWidth };
  switch (icon?.toLowerCase()) {
    case 'zap':
      return <Zap {...p} />;
    case 'tower':
      return <Tower {...p} />;
    case 'transformer':
      return <Transformer {...p} />;
    case 'pole':
      return <Pole {...p} />;
    case 'meter':
    case 'gauge':
      return <Gauge {...p} />;
    case 'pin':
      return <MapPin {...p} />;
    case 'circle':
      return <Circle {...p} />;
    case 'square':
      return <Square {...p} />;
    case 'triangle':
      return <Triangle {...p} />;
    case 'diamond':
      return <Diamond {...p} />;
    case 'sun':
      return <Sun {...p} />;
    case 'layers':
      return <Layers {...p} />;
    default:
      return <Circle {...p} />;
  }
};


