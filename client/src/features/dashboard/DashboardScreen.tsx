import { CSSProperties, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { StatusBadge } from '../../components/StatusBadge';
import { colors, fonts, motion } from '../../theme';
import { RECENT_RUNS, SCHEDULED_JOBS, type RunSummary, type ScheduledJob } from '../../mock/data';
import { NewDigestModal } from './NewDigestModal';

const pageStyle: CSSProperties = {
  padding: '28px 40px 48px',
  maxWidth: 1120,
  margin: '0 auto',
  width: '100%',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 24,
};

const h1Style: CSSProperties = {
  margin: 0,
  fontFamily: fonts.sans,
  fontSize: 26,
  fontWeight: 590,
  letterSpacing: '-0.022em',
  color: colors.text1,
};

const sectionTitle: CSSProperties = {
  margin: '0 0 12px',
  fontFamily: fonts.sans,
  fontSize: 14,
  fontWeight: 510,
  letterSpacing: '-0.005em',
  color: colors.text3,
  textTransform: 'uppercase',
};

const cardExtra: CSSProperties = {
  overflow: 'hidden',
  marginBottom: 32,
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: fonts.sans,
};

const thStyle: CSSProperties = {
  background: colors.bg2,
  color: colors.text3,
  fontFamily: fonts.sans,
  fontSize: 12,
  fontWeight: 510,
  letterSpacing: '-0.005em',
  textAlign: 'left',
  padding: '10px 16px',
  textTransform: 'uppercase',
  borderBottom: `1px solid ${colors.borderHairline}`,
};

const tdBase: CSSProperties = {
  padding: '14px 16px',
  fontFamily: fonts.sans,
  fontSize: 14,
  color: colors.text2,
  borderBottom: `1px solid ${colors.borderHairline}`,
  verticalAlign: 'middle',
};

const tdMono: CSSProperties = {
  ...tdBase,
  fontFamily: fonts.mono,
  fontSize: 13,
  color: colors.text1,
};

const tdMonoRight: CSSProperties = {
  ...tdMono,
  textAlign: 'right',
};

interface LocalJob extends ScheduledJob {
  confirmingCancel?: boolean;
}

export function DashboardScreen() {
  const [jobs, setJobs] = useState<LocalJob[]>(SCHEDULED_JOBS);
  const [runs] = useState<RunSummary[]>(RECENT_RUNS);
  const [modalOpen, setModalOpen] = useState(false);
  const navigate = useNavigate();

  const startCancel = (id: string) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, confirmingCancel: true } : j)));
  };
  const abortCancel = (id: string) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, confirmingCancel: false } : j)));
  };
  const confirmCancel = (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const createJob = (prompt: string, cron: string, cronLabel: string) => {
    setJobs((prev) => [
      {
        id: `job_${Math.floor(performance.now())}`,
        prompt,
        cron,
        cronLabel,
        createdAt: 'just now',
      },
      ...prev,
    ]);
  };

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <h1 style={h1Style}>Digests</h1>
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          New digest
        </Button>
      </header>

      <h2 style={sectionTitle}>Scheduled</h2>
      <Card style={cardExtra}>
        <table style={tableStyle}>
          <colgroup>
            <col style={{ width: '46%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>Prompt</th>
              <th style={thStyle}>Schedule</th>
              <th style={thStyle}>Created</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <td style={{ ...tdBase, color: colors.text3 }} colSpan={4}>
                  No scheduled digests. Click <em>New digest</em> to create one.
                </td>
              </tr>
            )}
            {jobs.map((j) => (
              <tr key={j.id}>
                <td style={{ ...tdBase, color: colors.text1 }}>{j.prompt}</td>
                <td style={tdBase}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span
                      style={{
                        fontFamily: fonts.sans,
                        fontSize: 13.5,
                        color: colors.text2,
                      }}
                    >
                      {j.cronLabel}
                    </span>
                    <span
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 11.5,
                        color: colors.text4,
                      }}
                    >
                      {j.cron}
                    </span>
                  </div>
                </td>
                <td style={{ ...tdBase, color: colors.text3 }}>{j.createdAt}</td>
                <td style={{ ...tdBase, textAlign: 'right' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      gap: 6,
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                    }}
                  >
                    {!j.confirmingCancel ? (
                      <>
                        <Button variant="ghost" size="sm">
                          Run now
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => startCancel(j.id)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 12, color: colors.text3, marginRight: 4 }}>
                          Cancel this digest?
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => abortCancel(j.id)}>
                          Keep
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => confirmCancel(j.id)}>
                          Confirm
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <h2 style={sectionTitle}>Recent runs</h2>
      <Card style={cardExtra}>
        <table style={tableStyle}>
          <colgroup>
            <col style={{ width: '40%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>Question</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Model</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Tokens</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Latency</th>
              <th style={thStyle}>When</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <RunRow key={r.id} run={r} onOpen={() => navigate(`/traces/${r.id}`)} />
            ))}
          </tbody>
        </table>
      </Card>

      <NewDigestModal open={modalOpen} onOpenChange={setModalOpen} onCreate={createJob} />
    </div>
  );
}

function RunRow({ run, onOpen }: { run: RunSummary; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const rowStyle: CSSProperties = {
    cursor: 'pointer',
    background: hover ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
    transition: `background ${motion.base}`,
  };
  return (
    <tr
      style={rowStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      tabIndex={0}
    >
      <td style={{ ...tdBase, color: colors.text1 }}>{run.question}</td>
      <td style={tdBase}>
        <StatusBadge status={run.status} />
      </td>
      <td style={tdMono}>{run.model}</td>
      <td style={tdMonoRight}>{run.tokens.toLocaleString()}</td>
      <td style={tdMonoRight}>{formatLatency(run.latencyMs)}</td>
      <td style={{ ...tdBase, color: colors.text3 }}>{run.when}</td>
    </tr>
  );
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
