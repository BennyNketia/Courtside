import { Fragment, ReactNode } from 'react';
import { colors } from '../../theme';

interface RichTextProps {
  text: string;
}

// Minimal, safe renderer: preserves newlines and renders **bold** spans.
export function RichText({ text }: RichTextProps) {
  if (!text) return null;
  const lines = text.split('\n');
  const nodes: ReactNode[] = [];
  lines.forEach((line, i) => {
    nodes.push(<Fragment key={`l-${i}`}>{renderInline(line)}</Fragment>);
    if (i < lines.length - 1) nodes.push(<br key={`br-${i}`} />);
  });
  return <>{nodes}</>;
}

function renderInline(line: string): ReactNode[] {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} style={{ color: colors.text1, fontWeight: 590 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
