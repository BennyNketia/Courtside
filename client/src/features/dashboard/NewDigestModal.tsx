import * as Dialog from '@radix-ui/react-dialog';
import { CSSProperties, useState } from 'react';
import { Button } from '../../components/Button';
import { Textarea } from '../../components/Textarea';
import { colors, fonts, motion, radii, shadows } from '../../theme';
import { CRON_PRESETS } from '../../mock/data';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (prompt: string, cron: string, cronLabel: string) => void;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(6, 7, 8, 0.55)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  zIndex: 40,
  animation: `courtside-fade-in ${motion.base}`,
};

const contentStyle: CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(520px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 40px)',
  overflow: 'auto',
  background: colors.bg4,
  color: colors.text1,
  borderRadius: radii.card,
  boxShadow: shadows.elevHigh,
  padding: 24,
  zIndex: 41,
  animation: `courtside-fade-in ${motion.base}`,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: fonts.sans,
  fontSize: 18,
  fontWeight: 590,
  letterSpacing: '-0.014em',
  color: colors.text1,
};

const subStyle: CSSProperties = {
  margin: '4px 0 20px',
  fontFamily: fonts.sans,
  fontSize: 13,
  color: colors.text3,
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontFamily: fonts.sans,
  fontSize: 12,
  fontWeight: 510,
  letterSpacing: '-0.005em',
  color: colors.text3,
  marginBottom: 6,
  textTransform: 'uppercase',
};

const selectStyle: CSSProperties = {
  width: '100%',
  height: 40,
  background: 'rgba(255, 255, 255, 0.03)',
  color: colors.text1,
  border: 'none',
  outline: 'none',
  boxShadow: shadows.elevBorderStrong,
  borderRadius: radii.control,
  padding: '0 12px',
  fontFamily: fonts.sans,
  fontSize: 14,
  fontWeight: 400,
  letterSpacing: '-0.008em',
  appearance: 'none',
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' stroke='%238A8F98' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 32,
};

const footerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 22,
};

export function NewDigestModal({ open, onOpenChange, onCreate }: Props) {
  const [prompt, setPrompt] = useState('');
  const [cron, setCron] = useState<string>(CRON_PRESETS[0].value);

  const reset = () => {
    setPrompt('');
    setCron(CRON_PRESETS[0].value);
  };

  const submit = () => {
    if (!prompt.trim()) return;
    const preset = CRON_PRESETS.find((p) => p.value === cron) ?? CRON_PRESETS[0];
    onCreate(prompt.trim(), preset.value, preset.label);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay data-overlay style={overlayStyle} />
        <Dialog.Content style={contentStyle} aria-describedby={undefined}>
          <Dialog.Title style={titleStyle}>New digest</Dialog.Title>
          <p style={subStyle}>Schedule a recurring question. The agent will run it and store the trace.</p>

          <label style={labelStyle} htmlFor="digest-prompt">
            Prompt
          </label>
          <Textarea
            id="digest-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Summarize last night's West conference results"
            autoGrow
            maxRows={5}
            style={{ minHeight: 88, marginBottom: 16 }}
          />

          <label style={labelStyle} htmlFor="digest-schedule">
            Schedule
          </label>
          <select
            id="digest-schedule"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            style={selectStyle}
          >
            {CRON_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          <div style={footerStyle}>
            <Dialog.Close asChild>
              <Button variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" disabled={!prompt.trim()} onClick={submit}>
              Create
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
