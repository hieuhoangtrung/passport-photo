import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Grid,
  Group,
  List,
  LoadingOverlay,
  SegmentedControl,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { Dropzone, IMAGE_MIME_TYPE } from '@mantine/dropzone';
import {
  IconAlertTriangle,
  IconBulb,
  IconCheck,
  IconDownload,
  IconEyeCheck,
  IconLock,
  IconPhotoUp,
  IconPrinter,
  IconRefresh,
  IconSun,
  IconTrash,
  IconUser,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_EDITS, type Check, type Edits } from './checks';
import { detect, type Detection } from './detect';
import { COUNTRIES, fmtMm, SIZES, specFor, type Spec } from './formats';
import { DPI, downloadJpeg, printSheet, render } from './render';

const IMG_KEY = 'passport-photo:image';
const SETTINGS_KEY = 'passport-photo:settings';
const MAX_SIDE = 2400; // keeps the local backup well under the ~5 MB storage limit

type Settings = { mode: 'country' | 'size'; key: string; edits: Edits };
const DEFAULT_SETTINGS: Settings = { mode: 'country', key: 'Australia', edits: DEFAULT_EDITS };

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    return s ? { ...DEFAULT_SETTINGS, ...s, edits: { ...DEFAULT_EDITS, ...s.edits } } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function toCanvas(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const SLIDERS: { key: keyof Edits; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'zoom', label: 'Head size', min: 0.85, max: 1.15, step: 0.01, unit: '×' },
  { key: 'offsetX', label: 'Move left / right', min: -5, max: 5, step: 0.1, unit: ' mm' },
  { key: 'offsetY', label: 'Move up / down', min: -5, max: 5, step: 0.1, unit: ' mm' },
  { key: 'rotate', label: 'Rotate', min: -10, max: 10, step: 0.5, unit: '°' },
  { key: 'brightness', label: 'Brightness', min: 50, max: 150, step: 1, unit: '%' },
  { key: 'contrast', label: 'Contrast', min: 50, max: 150, step: 1, unit: '%' },
];

export default function App() {
  const [initial] = useState(loadSettings);
  const [mode, setMode] = useState(initial.mode);
  const [key, setKey] = useState(initial.key);
  const [edits, setEdits] = useState(initial.edits);
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);
  const [det, setDet] = useState<Detection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupFailed, setBackupFailed] = useState(false);

  const spec = specFor(mode, key);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, key, edits }));
  }, [mode, key, edits]);

  async function open(url: string, backup: boolean) {
    setBusy(true);
    setError(null);
    try {
      const c = await toCanvas(url);
      if (backup) {
        try {
          localStorage.setItem(IMG_KEY, c.toDataURL('image/jpeg', 0.92));
          setBackupFailed(false);
        } catch {
          setBackupFailed(true);
        }
      }
      setSrc(c);
      setDet(await detect(c));
    } catch (e) {
      console.error(e);
      setError('Could not read this photo. Use a JPEG or PNG file.');
      setSrc(null);
    } finally {
      setBusy(false);
    }
  }

  // Restore the last photo after an accidental refresh.
  useEffect(() => {
    const saved = localStorage.getItem(IMG_KEY);
    if (saved) open(saved, false);
  }, []);

  function onDrop(files: File[]) {
    const url = URL.createObjectURL(files[0]);
    setEdits(DEFAULT_EDITS);
    open(url, true).finally(() => URL.revokeObjectURL(url));
  }

  function clearAll() {
    localStorage.removeItem(IMG_KEY);
    setSrc(null);
    setDet(null);
    setEdits(DEFAULT_EDITS);
  }

  const result = useMemo(() => (src && det ? render(src, det, spec, edits) : null), [src, det, spec, edits]);

  return (
    <Box mih="100vh" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))">
      <Container size="lg" py="lg">
        <Group justify="space-between" mb="xl" wrap="wrap">
          <Group gap="sm">
            <ThemeIcon size={40} radius="md" variant="gradient" gradient={{ from: 'teal', to: 'cyan', deg: 135 }}>
              <IconUser size={24} />
            </ThemeIcon>
            <div>
              <Title order={1} size="h3">
                Passport Photo Maker
              </Title>
              <Text size="sm" c="dimmed">
                Crop, check and print a passport photo
              </Text>
            </div>
          </Group>
          <Badge size="lg" variant="light" leftSection={<IconLock size={14} />}>
            Runs in your browser - no uploads
          </Badge>
        </Group>

        {error && (
          <Alert color="red" icon={<IconX />} mb="md" withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {!src ? (
          <Upload onDrop={onDrop} busy={busy} />
        ) : (
          <Grid gap="lg">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card withBorder padding="lg" pos="relative">
                <LoadingOverlay visible={busy} overlayProps={{ blur: 2 }} />
                <Preview result={result} spec={spec} />
                <Text size="xs" c="dimmed" ta="center" mt="sm">
                  Dashed lines show the measured crown and chin. Preview is to scale for {fmtMm(spec.w)} × {fmtMm(spec.h)}.
                </Text>
              </Card>
              <Card withBorder padding="lg" mt="lg">
                <Title order={2} size="h5" mb="sm">
                  Photo size
                </Title>
                <SizePicker mode={mode} setMode={setMode} value={key} setValue={setKey} spec={spec} />
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="lg">
                <Checks checks={result?.checks ?? []} busy={busy} />
                <Adjust edits={edits} setEdits={setEdits} />
                <Download result={result} spec={spec} label={mode === 'size' ? key : key.replace(/\W+/g, '-')} onClear={clearAll} backupFailed={backupFailed} />
              </Stack>
            </Grid.Col>
          </Grid>
        )}

        <Text size="xs" c="dimmed" ta="center" mt="xl">
          No account, no tracking, no payment. Face detection runs on your device with open-source MediaPipe models. Rules change - confirm with your
          passport office, e.g.{' '}
          <Anchor href="https://www.passports.gov.au/getting-passport-how-it-works/photo-guidelines" target="_blank" rel="noreferrer" size="xs">
            Australian photo guidelines
          </Anchor>
          .
        </Text>
      </Container>
    </Box>
  );
}

function Upload({ onDrop, busy }: { onDrop: (f: File[]) => void; busy: boolean }) {
  const tips = [
    { icon: IconEyeCheck, title: 'Look straight at the camera', text: 'Neutral face, mouth closed, eyes open. No glasses.' },
    { icon: IconBulb, title: 'Plain, light background', text: 'Stand in front of a white or light grey wall, away from it to avoid shadows.' },
    { icon: IconSun, title: 'Even light', text: 'Face a window. No shadows or glare on your face.' },
  ];
  return (
    <Stack gap="lg">
      <Dropzone onDrop={onDrop} accept={IMAGE_MIME_TYPE} multiple={false} loading={busy} radius="lg" p="xl">
        <Stack align="center" gap="xs" mih={240} justify="center" style={{ pointerEvents: 'none' }}>
          <Dropzone.Idle>
            <IconPhotoUp size={56} stroke={1.4} color="var(--mantine-color-teal-6)" />
          </Dropzone.Idle>
          <Dropzone.Accept>
            <IconCheck size={56} color="var(--mantine-color-teal-6)" />
          </Dropzone.Accept>
          <Dropzone.Reject>
            <IconX size={56} color="var(--mantine-color-red-6)" />
          </Dropzone.Reject>
          <Title order={2} size="h3" ta="center">
            Drop your photo here, or click to choose
          </Title>
          <Text c="dimmed" ta="center" maw={460}>
            A front-facing photo with your head and shoulders. Your photo stays on this device.
          </Text>
        </Stack>
      </Dropzone>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        {tips.map((t) => (
          <Card key={t.title} withBorder padding="md">
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon variant="light" size="lg">
                <t.icon size={20} />
              </ThemeIcon>
              <div>
                <Text fw={600} size="sm">
                  {t.title}
                </Text>
                <Text size="sm" c="dimmed">
                  {t.text}
                </Text>
              </div>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

function Preview({ result, spec }: { result: ReturnType<typeof render> | null; spec: Spec }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !result) return;
    c.width = result.canvas.width;
    c.height = result.canvas.height;
    c.getContext('2d')!.drawImage(result.canvas, 0, 0);
  }, [result]);

  const headOk = result?.checks.find((c) => c.id === 'head')?.status === 'pass';
  const line = headOk ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-red-6)';
  return (
    <Box pos="relative" mx="auto" maw={340} style={{ aspectRatio: `${spec.w} / ${spec.h}`, boxShadow: 'var(--mantine-shadow-md)' }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} aria-label="Passport photo preview" />
      <svg viewBox={`0 0 ${spec.w} ${spec.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
        <line x1={spec.w / 2} x2={spec.w / 2} y1={0} y2={spec.h} stroke="#fff" strokeOpacity={0.7} strokeWidth={0.15} strokeDasharray="0.8 0.8" />
        {spec.eyeMin !== undefined && spec.eyeMax !== undefined && (
          <rect x={0} width={spec.w} y={spec.h - spec.eyeMax} height={spec.eyeMax - spec.eyeMin} fill="var(--mantine-color-teal-4)" fillOpacity={0.15} />
        )}
        {result?.crown && result.chin && (
          <>
            {[result.crown.y, result.chin.y].map((y, i) => (
              <line key={i} x1={0} x2={spec.w} y1={y} y2={y} stroke={line} strokeWidth={0.25} strokeDasharray="1 0.6" />
            ))}
            <line x1={2} x2={2} y1={result.crown.y} y2={result.chin.y} stroke={line} strokeWidth={0.25} />
            <text x={2.8} y={(result.crown.y + result.chin.y) / 2} fontSize={2.2} fill={line} stroke="#fff" strokeWidth={0.4} paintOrder="stroke">
              {Math.hypot(result.chin.x - result.crown.x, result.chin.y - result.crown.y).toFixed(1)} mm
            </text>
          </>
        )}
      </svg>
    </Box>
  );
}

function SizePicker(p: {
  mode: 'country' | 'size';
  setMode: (m: 'country' | 'size') => void;
  value: string;
  setValue: (v: string) => void;
  spec: Spec;
}) {
  return (
    <Stack gap="sm">
      <SegmentedControl
        fullWidth
        value={p.mode}
        onChange={(m) => {
          p.setMode(m as 'country' | 'size');
          p.setValue(m === 'country' ? 'Australia' : '35x45');
        }}
        data={[
          { value: 'country', label: 'By country' },
          { value: 'size', label: 'By size' },
        ]}
      />
      {p.mode === 'country' ? (
        <Select
          label="Country"
          searchable
          allowDeselect={false}
          nothingFoundMessage="Not in our list - choose By size"
          data={Object.keys(COUNTRIES)}
          value={p.value}
          onChange={(v) => v && p.setValue(v)}
        />
      ) : (
        <Select
          label="Size"
          allowDeselect={false}
          data={Object.entries(SIZES).map(([value, s]) => ({ value, label: s.label }))}
          value={p.value}
          onChange={(v) => v && p.setValue(v)}
        />
      )}
      <Text size="sm" c="dimmed">
        {fmtMm(p.spec.w)} × {fmtMm(p.spec.h)}, head {p.spec.headMin}–{p.spec.headMax} mm
        {p.spec.eyeMin !== undefined && `, eyes ${p.spec.eyeMin}–${p.spec.eyeMax} mm from bottom`}
      </Text>
    </Stack>
  );
}

const ICON = { pass: IconCheck, warn: IconAlertTriangle, fail: IconX };
const COLOR = { pass: 'teal', warn: 'yellow', fail: 'red' };

function Checks({ checks, busy }: { checks: Check[]; busy: boolean }) {
  const fails = checks.filter((c) => c.status === 'fail').length;
  const warns = checks.filter((c) => c.status === 'warn').length;
  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h5">
          Requirement checks
        </Title>
        {!busy && checks.length > 0 && (
          <Badge color={fails ? 'red' : warns ? 'yellow' : 'teal'} variant="filled">
            {fails ? `${fails} to fix` : warns ? `${warns} to review` : 'All passed'}
          </Badge>
        )}
      </Group>
      <Stack gap={8} aria-live="polite">
        {busy && <Text c="dimmed">Finding your face…</Text>}
        {checks.map((c) => {
          const I = ICON[c.status];
          return (
            <Group key={c.id} gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon color={COLOR[c.status]} variant="light" size="md" radius="xl" aria-label={c.status}>
                <I size={16} />
              </ThemeIcon>
              <div>
                <Text size="sm" fw={500}>
                  {c.label}
                </Text>
                <Text size="xs" c="dimmed">
                  {c.detail}
                </Text>
              </div>
            </Group>
          );
        })}
      </Stack>
      <Text size="sm" fw={600} mt="md" mb={4}>
        Check these yourself
      </Text>
      <List size="sm" c="dimmed" spacing={2}>
        <List.Item>No glasses, and nothing covers your eyes or face (hair, hat)</List.Item>
        <List.Item>Head covering only for religious or medical reasons</List.Item>
        <List.Item>Photo taken in the last 6 months</List.Item>
        <List.Item>No filters, retouching or red eye</List.Item>
      </List>
    </Card>
  );
}

function Adjust({ edits, setEdits }: { edits: Edits; setEdits: (e: Edits) => void }) {
  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h5">
          Adjust
        </Title>
        <Button size="xs" variant="subtle" leftSection={<IconRefresh size={14} />} onClick={() => setEdits(DEFAULT_EDITS)}>
          Reset
        </Button>
      </Group>
      <Text size="xs" c="dimmed" mb="md">
        We crop and straighten automatically. Checks run again after each change.
      </Text>
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="lg" verticalSpacing="md">
        {SLIDERS.map((s) => (
          <div key={s.key}>
            <Text size="sm" mb={4} id={`lbl-${s.key}`}>
              {s.label}
            </Text>
            <Slider
              aria-labelledby={`lbl-${s.key}`}
              min={s.min}
              max={s.max}
              step={s.step}
              value={edits[s.key] as number}
              label={(v) => `${+v.toFixed(2)}${s.unit}`}
              onChange={(v) => setEdits({ ...edits, [s.key]: v })}
            />
          </div>
        ))}
      </SimpleGrid>
      <Switch
        mt="lg"
        checked={edits.whiteBg}
        onChange={(e) => setEdits({ ...edits, whiteBg: e.currentTarget.checked })}
        label="Replace background with white"
        description="Only use if your wall is not plain. Some offices reject digitally changed photos."
      />
    </Card>
  );
}

function Download(p: { result: ReturnType<typeof render> | null; spec: Spec; label: string; onClear: () => void; backupFailed: boolean }) {
  const fails = p.result?.checks.some((c) => c.status === 'fail');
  return (
    <Card withBorder padding="lg">
      <Title order={2} size="h5" mb="sm">
        Download
      </Title>
      {fails && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle />} mb="sm">
          Some checks failed. Your photo may be rejected. Fix them or take a new photo.
        </Alert>
      )}
      <Stack gap="xs">
        <Button
          leftSection={<IconDownload size={18} />}
          disabled={!p.result}
          onClick={() => p.result && downloadJpeg(p.result.canvas, DPI, `passport-photo-${p.label}.jpg`)}
        >
          Download photo ({DPI} dpi JPEG)
        </Button>
        <Button
          variant="light"
          leftSection={<IconPrinter size={18} />}
          disabled={!p.result}
          onClick={() => {
            if (!p.result) return;
            const s = printSheet(p.result.canvas, p.spec);
            downloadJpeg(s.canvas, s.dpi, `passport-photo-${p.label}-6x4in-print.jpg`);
          }}
        >
          Download 6 × 4 in print sheet
        </Button>
      </Stack>
      <Alert color="gray" variant="light" icon={<IconLock />} mt="md">
        We do not keep your photo. Download it when you finish.{' '}
        {p.backupFailed
          ? 'The photo is too big to keep a backup in this browser, so do not refresh the page.'
          : 'A backup stays only in this browser so a refresh does not lose your work.'}
      </Alert>
      <Button mt="sm" fullWidth variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={p.onClear}>
        Start over and delete photo from this browser
      </Button>
    </Card>
  );
}
