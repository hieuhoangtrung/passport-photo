import { ActionIcon, Alert, Badge, Button, Card, Grid, Group, NumberInput, Select, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconPlus, IconPrinter, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useRef } from 'react';
import type { Edits } from './checks';
import type { Detection } from './detect';
import { SIZES, type Spec } from './formats';
import { drawSheet, pack, PAPERS } from './print';
import { downloadJpeg, render, type Result } from './render';

export type PrintSettings = { paper: string; rows: { key: string; count: number | null }[] };
export const DEFAULT_PRINT: PrintSettings = { paper: '6x4', rows: [{ key: 'current', count: null }] };

const SHEET_DPI = 300;
const PREVIEW_PX_PER_MM = 5;

type Props = {
  src: HTMLCanvasElement;
  det: Detection;
  edits: Edits;
  spec: Spec;
  current: Result;
  settings: PrintSettings;
  setSettings: (s: PrintSettings) => void;
};

export function PrintSheet({ src, det, edits, spec, current, settings, setSettings }: Props) {
  const { rows } = settings;
  const paper = PAPERS[settings.paper] ?? PAPERS['6x4'];
  const specOf = (key: string) => (key === 'current' ? spec : (SIZES[key]?.spec ?? spec));

  const keys = [...new Set(rows.map((r) => r.key))];
  // One rendered photo per size. Each size gets its own crop and checks.
  const photos = useMemo(() => {
    const out: Record<string, Result> = {};
    for (const k of keys) out[k] = k === 'current' ? current : render(src, det, specOf(k), edits);
    return out;
  }, [keys.join(), current, src, det, edits]);

  const layout = useMemo(
    () => pack(paper, rows.map((r, i) => ({ id: String(i), w: specOf(r.key).w, h: specOf(r.key).h, count: r.count }))),
    [paper, rows, spec],
  );
  const byId = Object.fromEntries(rows.map((r, i) => [String(i), photos[r.key].canvas]));

  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawSheet(layout, byId, PREVIEW_PX_PER_MM, ref.current);
  });

  const setRow = (i: number, patch: Partial<PrintSettings['rows'][number]>) =>
    setSettings({ ...settings, rows: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const sizeOptions = [
    { value: 'current', label: `Your photo (${spec.w} × ${spec.h} mm)` },
    ...Object.entries(SIZES).map(([value, s]) => ({ value, label: s.label })),
  ];

  return (
    <Card withBorder padding="lg">
      <Title order={2} size="h5" mb={4}>
        Print sheet
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        Put one or more photo sizes on one sheet. Leave copies empty to fit as many as possible.
      </Text>
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack gap="md">
            <Select
              label="Paper size"
              allowDeselect={false}
              data={Object.entries(PAPERS).map(([value, p]) => ({ value, label: p.label }))}
              value={settings.paper}
              onChange={(v) => v && setSettings({ ...settings, paper: v })}
            />
            {rows.map((r, i) => {
              // only flag failures caused by this size; the main checks already show the rest
              const failsHere = photos[r.key].checks.filter(
                (c) => c.status === 'fail' && !current.checks.some((m) => m.id === c.id && m.status === 'fail'),
              );
              return (
                <div key={i}>
                  <Group gap="xs" align="flex-end" wrap="nowrap">
                    <Select
                      style={{ flex: 1, minWidth: 0 }}
                      label={`Photo size ${i + 1}`}
                      allowDeselect={false}
                      data={sizeOptions}
                      value={r.key}
                      onChange={(v) => v && setRow(i, { key: v })}
                    />
                    <NumberInput
                      w={96}
                      label="Copies"
                      placeholder="Max"
                      min={1}
                      max={200}
                      allowDecimal={false}
                      value={r.count ?? ''}
                      onChange={(v) => setRow(i, { count: v === '' ? null : Math.max(1, Number(v)) })}
                    />
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="lg"
                      mb={2}
                      aria-label={`Remove photo size ${i + 1}`}
                      disabled={rows.length === 1}
                      onClick={() => setSettings({ ...settings, rows: rows.filter((_, j) => j !== i) })}
                    >
                      <IconTrash size={18} />
                    </ActionIcon>
                  </Group>
                  <Group gap="xs" mt={4}>
                    <Text size="xs" c="dimmed">
                      {layout.placed[String(i)] ?? 0} on sheet
                    </Text>
                    {failsHere.length > 0 && (
                      <Badge size="xs" color="red" variant="light" title={failsHere.map((c) => c.detail).join(' ')}>
                        At this size: {failsHere.map((c) => c.label.toLowerCase()).join(', ')}
                      </Badge>
                    )}
                  </Group>
                </div>
              );
            })}
            <Button
              variant="default"
              leftSection={<IconPlus size={16} />}
              onClick={() => setSettings({ ...settings, rows: [...rows, { key: '30x40', count: 2 }] })}
            >
              Add another size
            </Button>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack gap="sm">
            <canvas
              ref={ref}
              role="img"
              aria-label={`Print preview: ${layout.places.length} photos on ${paper.label}`}
              style={{ maxWidth: '100%', maxHeight: 460, margin: '0 auto', display: 'block', boxShadow: 'var(--mantine-shadow-md)', borderRadius: 4 }}
            />
            <Text size="sm" ta="center">
              {layout.places.length} photos on {paper.label}
            </Text>
            {layout.dropped > 0 && (
              <Alert color="yellow" variant="light" icon={<IconAlertTriangle />}>
                {layout.dropped} {layout.dropped === 1 ? 'photo does' : 'photos do'} not fit. Use fewer copies or bigger paper.
              </Alert>
            )}
            <Button
              leftSection={<IconPrinter size={18} />}
              disabled={!layout.places.length}
              onClick={() =>
                downloadJpeg(drawSheet(layout, byId, SHEET_DPI / 25.4), SHEET_DPI, `passport-photos-${settings.paper}-print.jpg`)
              }
            >
              Download print sheet ({SHEET_DPI} dpi JPEG)
            </Button>
            <Text size="xs" c="dimmed" ta="center">
              Print at 100% / actual size, not "fit to page". Grey lines are cut lines.
            </Text>
          </Stack>
        </Grid.Col>
      </Grid>
    </Card>
  );
}
