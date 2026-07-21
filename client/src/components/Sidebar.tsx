import { CSSProperties, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { colors, fonts, motion, radii } from '../theme';
import { HealthDot } from './HealthDot';

const sidebarStyle: CSSProperties = {
  width: 240,
  flexShrink: 0,
  background: colors.bg1,
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  padding: '18px 12px 12px',
  boxShadow: '1px 0 0 0 rgba(255, 255, 255, 0.06)',
  position: 'sticky',
  top: 0,
};

const brandStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 10px 20px',
  fontFamily: fonts.sans,
  fontSize: 16,
  fontWeight: 590,
  letterSpacing: '-0.012em',
  color: colors.text1,
};

const brandMark: CSSProperties = {
  fontSize: 18,
  lineHeight: 1,
  color: colors.court,
};

const navGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: 1,
};

const footerStyle: CSSProperties = {
  padding: '10px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontFamily: fonts.mono,
  fontSize: 12,
  color: colors.text3,
};

interface NavItemProps {
  to: string;
  icon: string;
  label: string;
  end?: boolean;
}

function NavItem({ to, icon, label, end }: NavItemProps) {
  const [hover, setHover] = useState(false);
  return (
    <NavLink
      to={to}
      end={end}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={({ isActive }): CSSProperties => ({
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 32,
        padding: '0 10px',
        borderRadius: radii.control,
        color: isActive ? colors.text1 : hover ? colors.text1 : colors.text3,
        background: isActive
          ? 'rgba(255, 255, 255, 0.05)'
          : hover
            ? 'rgba(255, 255, 255, 0.03)'
            : 'transparent',
        fontFamily: fonts.sans,
        fontSize: 13.5,
        fontWeight: 510,
        letterSpacing: '-0.008em',
        textDecoration: 'none',
        transition: `background ${motion.base}, color ${motion.base}`,
      })}
    >
      <span style={{ fontSize: 14, width: 16, textAlign: 'center', opacity: 0.9 }}>{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <aside style={sidebarStyle}>
      <div style={brandStyle}>
        <span style={brandMark} aria-hidden>
          🏀
        </span>
        <span>Courtside</span>
      </div>
      <nav style={navGroupStyle}>
        <NavItem to="/" icon="◇" label="Chat" end />
        <NavItem to="/dashboard" icon="▤" label="Dashboard" />
      </nav>
      <div style={footerStyle}>
        <HealthDot healthy />
        <span>gemini-flash</span>
      </div>
    </aside>
  );
}
